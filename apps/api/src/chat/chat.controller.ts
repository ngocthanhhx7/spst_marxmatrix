import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
  type ExceptionFilter
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  CHAT_MAX_IMAGE_BYTES,
  CHAT_MAX_IMAGES,
  chatCursorQuerySchema,
  chatMessageInputSchema,
  chatStreamEventSchema,
  type ChatStreamEvent
} from '@marxmatrix/contracts';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { createZodDto } from '../common/zod-validation.pipe.js';
import { DomainError } from '../common/domain-error.js';
import type { AuthenticatedUser } from '../identity/authenticated-user.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentUser } from '../identity/current-user.decorator.js';
import { validateChatImages, type ChatImageUploadCandidate } from './chat-image-validation.js';
import { ChatRateLimiter } from './chat-rate-limiter.js';
import { ChatRunRegistry } from './chat-run-registry.js';
import { ChatService } from './chat.service.js';

class ChatCursorQuery extends createZodDto(chatCursorQuerySchema) {}
class ChatMessageBody extends createZodDto(z.object({ text: z.string().max(8_000).default('') })) {}

type StreamOperation = (emit: (event: ChatStreamEvent) => void) => Promise<unknown>;
const terminalTypes = new Set<ChatStreamEvent['type']>(['final', 'refusal', 'error']);

@Catch(BadRequestException, PayloadTooLargeException)
class ChatUploadExceptionFilter implements ExceptionFilter {
  public catch(_exception: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<{ id?: string }>();
    const response = host.switchToHttp().getResponse<Response>();
    response.status(400).json({
      statusCode: 400,
      code: 'CHAT_IMAGE_INVALID',
      message: 'The uploaded chat images are invalid.',
      details: [],
      requestId: request.id ?? '00000000-0000-4000-8000-000000000000'
    });
  }
}

@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  public constructor(
    private readonly chat: ChatService,
    private readonly rateLimiter: ChatRateLimiter,
    private readonly runs: ChatRunRegistry
  ) {}

  @Post('conversations')
  create(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.create(user.id);
  }

  @Get('conversations')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ChatCursorQuery) {
    return this.chat.list(user.id, query);
  }

  @Get('conversations/:conversationId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Query() query: ChatCursorQuery
  ) {
    return this.chat.get(user.id, conversationId, query);
  }

  @Delete('conversations/:conversationId')
  @HttpCode(204)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string
  ): Promise<void> {
    await this.chat.delete(user.id, conversationId);
  }

  @Post('conversations/:conversationId/messages')
  @UseFilters(ChatUploadExceptionFilter)
  @UseInterceptors(
    FilesInterceptor('images', CHAT_MAX_IMAGES, {
      limits: { files: CHAT_MAX_IMAGES, fileSize: CHAT_MAX_IMAGE_BYTES }
    })
  )
  async send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Body() body: ChatMessageBody,
    @UploadedFiles() files: ChatImageUploadCandidate[] = [],
    @Res() response: Response,
    @Req() _request: Request
  ): Promise<void> {
    const input = chatMessageInputSchema.parse({ text: body.text, imageCount: files.length });
    this.rateLimiter.consume(user.id);
    const images = await validateChatImages(files);
    await this.stream(user.id, response, _request, (emit) =>
      this.chat.send(user.id, conversationId, { text: input.text, files: images }, emit)
    );
  }

  @Post('conversations/:conversationId/messages/:userMessageId/regenerate')
  async regenerate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Param('userMessageId') userMessageId: string,
    @Res() response: Response,
    @Req() _request: Request
  ): Promise<void> {
    this.rateLimiter.consume(user.id);
    await this.stream(user.id, response, _request, (emit) =>
      this.chat.regenerate(user.id, conversationId, userMessageId, emit)
    );
  }

  @Post('conversations/:conversationId/runs/:runId/cancel')
  @HttpCode(204)
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Param('runId') runId: string
  ): Promise<void> {
    await this.chat.cancel(user.id, conversationId, runId);
  }

  private async stream(
    ownerId: string,
    response: Response,
    _request: Request,
    operation: StreamOperation
  ): Promise<void> {
    let started = false;
    let settled = false;
    let terminal = false;
    let runId: string | undefined;

    const start = () => {
      if (started) return;
      response.status(200);
      response.type('application/x-ndjson');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('X-Accel-Buffering', 'no');
      started = true;
    };
    const emit = (candidate: ChatStreamEvent) => {
      if (terminal)
        throw new DomainError(
          'CHAT_AI_RESPONSE_INVALID',
          'Chat AI returned an invalid response.',
          502
        );
      const event = chatStreamEventSchema.parse(candidate);
      if (runId !== undefined && event.runId !== runId)
        throw new DomainError(
          'CHAT_AI_RESPONSE_INVALID',
          'Chat AI returned an invalid response.',
          502
        );
      runId = event.runId;
      start();
      response.write(`${JSON.stringify(event)}\n`);
      terminal = terminalTypes.has(event.type);
    };

    response.once('close', () => {
      if (!settled && !response.writableEnded && runId !== undefined)
        this.runs.cancel(ownerId, runId);
    });

    try {
      await operation(emit);
      if (!terminal) {
        if (!started || runId === undefined)
          throw new DomainError(
            'CHAT_AI_RESPONSE_INVALID',
            'Chat AI returned an invalid response.',
            502
          );
        emit(this.safeStreamError(runId));
      }
    } catch (error) {
      if (!started) throw error;
      if (!terminal && runId !== undefined) emit(this.safeStreamError(runId, error));
    } finally {
      settled = true;
      if (started) response.end();
    }
  }

  private safeStreamError(runId: string, error?: unknown): ChatStreamEvent {
    if (error instanceof DomainError)
      return { type: 'error', runId, code: error.code, message: error.message };
    return {
      type: 'error',
      runId,
      code: 'CHAT_AI_REQUEST_FAILED',
      message: 'Chat AI request failed.'
    };
  }
}
