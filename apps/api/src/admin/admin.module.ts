import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentsModule } from '../documents/documents.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { DocumentRecord, DocumentRecordSchema } from '../documents/schemas/document.schema.js';
import { Job, JobSchema } from '../jobs/schemas/job.schema.js';
import { AdminRagController } from './admin-rag.controller.js';
import { AdminRagService } from './admin-rag.service.js';

@Module({
  imports: [
    IdentityModule,
    JobsModule,
    DocumentsModule,
    MongooseModule.forFeature([
      { name: DocumentRecord.name, schema: DocumentRecordSchema },
      { name: Job.name, schema: JobSchema }
    ])
  ],
  controllers: [AdminRagController],
  providers: [AdminRagService]
})
export class AdminModule {}
