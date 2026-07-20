import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { courseIdSchema, createDocumentMetadataSchema } from '@marxmatrix/contracts';
import { z } from 'zod';
import { createZodDto } from '../common/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../identity/authenticated-user.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentUser } from '../identity/current-user.decorator.js';
import { Roles } from '../identity/roles.decorator.js';
import { RolesGuard } from '../identity/roles.guard.js';
import { AdminRagService } from './admin-rag.service.js';
import { DomainError } from '../common/domain-error.js';

class AdminUploadBody extends createZodDto(
  createDocumentMetadataSchema.pick({ title: true }).extend({ courseId: courseIdSchema })
) {}
class ReindexBody extends createZodDto(z.object({ courseId: courseIdSchema })) {}
interface UploadedPdf {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminRagController {
  public constructor(private readonly admin: AdminRagService) {}

  @Get('documents')
  list() {
    return this.admin.list();
  }

  @Post('documents')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: AdminUploadBody,
    @UploadedFile() file: UploadedPdf | undefined
  ) {
    if (file === undefined)
      throw new DomainError('UPLOAD_FILE_REQUIRED', 'A PDF file is required.', 400);
    return this.admin.upload(user.id, body, file);
  }

  @Post('documents/:id/reindex')
  reindex(@Param('id') id: string, @Body() body: ReindexBody) {
    return this.admin.reindex(id, body.courseId);
  }

  @Post('jobs/:id/retry')
  retry(@Param('id') id: string) {
    return this.admin.retry(id);
  }
}
