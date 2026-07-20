import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  PERSONAL_COPILOT_COURSE_ID,
  copilotQuerySchema,
  createDocumentMetadataSchema
} from '@marxmatrix/contracts';
import { createZodDto } from '../common/zod-validation.pipe.js';
import { DomainError } from '../common/domain-error.js';
import type { AuthenticatedUser } from '../identity/authenticated-user.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentUser } from '../identity/current-user.decorator.js';
import { DocumentsService } from '../documents/documents.service.js';
import { RagService } from './rag.service.js';

class CopilotDocumentBody extends createZodDto(
  createDocumentMetadataSchema.pick({ title: true })
) {}
class CopilotQueryBody extends createZodDto(copilotQuerySchema) {}
interface UploadedPdf {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@Controller('copilot')
@UseGuards(AuthGuard)
export class CopilotDocumentsController {
  public constructor(
    private readonly documents: DocumentsService,
    private readonly rag: RagService
  ) {}

  @Get('documents')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.documents.listForCourse(user.id, PERSONAL_COPILOT_COURSE_ID);
  }

  @Post('documents')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CopilotDocumentBody,
    @UploadedFile() file: UploadedPdf | undefined
  ) {
    if (file === undefined)
      throw new DomainError('UPLOAD_FILE_REQUIRED', 'A PDF file is required.', 400);
    return this.documents.upload(
      user.id,
      { title: body.title, type: 'textbook' },
      file,
      PERSONAL_COPILOT_COURSE_ID
    );
  }

  @Post('query')
  query(@CurrentUser() user: AuthenticatedUser, @Body() body: CopilotQueryBody) {
    return this.rag.queryPrivate(user.id, body);
  }

  @Delete('documents/:id')
  @HttpCode(204)
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.documents.delete(user.id, id);
  }
}
