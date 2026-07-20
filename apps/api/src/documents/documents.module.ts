import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { MongooseModule } from '@nestjs/mongoose';
import { JobsModule } from '../jobs/jobs.module.js';
import { AnalysesModule } from '../analyses/analyses.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { GridFsStorageService } from './gridfs-storage.service.js';
import { PdfParserService } from './pdf-parser.service.js';
import { ParsePdfHandler } from './parse-pdf.handler.js';
import { DocumentPageRecord, DocumentPageRecordSchema } from './schemas/document-page.schema.js';
import { DocumentRecord, DocumentRecordSchema } from './schemas/document.schema.js';

@Module({
  imports: [
    IdentityModule,
    AnalysesModule,
    JobsModule,
    MongooseModule.forFeature([
      { name: DocumentRecord.name, schema: DocumentRecordSchema },
      { name: DocumentPageRecord.name, schema: DocumentPageRecordSchema }
    ]),
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          files: 1,
          fileSize: config.getOrThrow<number>('DOCUMENT_MAX_SIZE_MB') * 1024 * 1024
        }
      })
    })
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, GridFsStorageService, PdfParserService, ParsePdfHandler],
  exports: [DocumentsService, PdfParserService, GridFsStorageService]
})
export class DocumentsModule {}
