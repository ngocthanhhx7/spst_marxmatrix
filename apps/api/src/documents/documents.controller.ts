import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  createDocumentMetadataSchema,
  queueFinancialExtractionInputSchema
} from '@marxmatrix/contracts';
import type { Response } from 'express';
import { createZodDto } from '../common/zod-validation.pipe.js';
import { DomainError } from '../common/domain-error.js';
import type { AuthenticatedUser } from '../identity/authenticated-user.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentUser } from '../identity/current-user.decorator.js';
import { DocumentsService } from './documents.service.js';
import { FinancialExtractionService } from '../analyses/financial-extraction.service.js';

class CreateDocumentBody extends createZodDto(createDocumentMetadataSchema) {}
class QueueFinancialExtractionBody extends createZodDto(queueFinancialExtractionInputSchema) {}
interface UploadedPdf {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@Controller('documents')
@UseGuards(AuthGuard)
export class DocumentsController {
  public constructor(
    private readonly documents: DocumentsService,
    private readonly extractions: FinancialExtractionService
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateDocumentBody,
    @UploadedFile() file: UploadedPdf | undefined
  ) {
    if (file === undefined)
      throw new DomainError('UPLOAD_FILE_REQUIRED', 'A PDF file is required.', 400);
    return this.documents.upload(user.id, body, file);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.documents.list(user.id);
  }

  @Get(':id/status')
  status(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documents.status(user.id, id);
  }

  @Get(':id/extractions')
  extractionsForDocument(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.extractions.listForDocument(user.id, id);
  }

  @Post(':id/extractions')
  queueExtraction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: QueueFinancialExtractionBody
  ) {
    return this.extractions.queue(user.id, id, body.analysisId);
  }

  @Get(':id/pages/:pageNumber')
  page(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('pageNumber', ParseIntPipe) pageNumber: number
  ) {
    return this.documents.page(user.id, id, pageNumber);
  }

  @Get(':id/download')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() response: Response
  ): Promise<void> {
    const document = await this.documents.download(user.id, id);
    const fallback = document.filename.replace(/[^\x20-\x7e]/g, '_').replaceAll('"', '');
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(document.filename)}`
    );
    document.stream.once('error', () => response.destroy());
    document.stream.pipe(response);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documents.detail(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.documents.delete(user.id, id);
  }
}
