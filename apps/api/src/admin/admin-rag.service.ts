import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { courseIdSchema } from '@marxmatrix/contracts';
import { Model, Types } from 'mongoose';
import { DomainError } from '../common/domain-error.js';
import { DocumentsService } from '../documents/documents.service.js';
import { DocumentRecord } from '../documents/schemas/document.schema.js';
import { JobService } from '../jobs/jobs.service.js';
import { Job } from '../jobs/schemas/job.schema.js';

interface AdminUploadFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@Injectable()
export class AdminRagService {
  public constructor(
    @InjectModel(DocumentRecord.name) private readonly records: Model<DocumentRecord>,
    private readonly documents: DocumentsService,
    private readonly jobs: JobService,
    @InjectModel(Job.name) private readonly jobRecords: Model<Job>
  ) {}

  async list() {
    const documents = await this.records
      .find({ type: 'textbook', deletionState: 'active' })
      .sort({ updatedAt: -1 });
    return Promise.all(
      documents.map(async (document) => {
        const failedJob = await this.jobRecords
          .findOne({
            'payload.documentId': document._id,
            status: 'failed',
            type: { $in: ['embed_document', 'rebuild_document_index'] }
          })
          .sort({ updatedAt: -1, _id: -1 });
        return {
          id: document._id.toString(),
          title: document.title,
          courseId: document.courseId,
          status: document.status,
          pageCount: document.pageCount,
          errorCode: document.errorCode,
          errorMessage: document.errorMessage,
          updatedAt: document.updatedAt.toISOString(),
          failedJobId: failedJob?._id.toString() ?? null
        };
      })
    );
  }

  async upload(ownerId: string, input: { title: string; courseId: string }, file: AdminUploadFile) {
    const courseId = courseIdSchema.parse(input.courseId);
    return this.documents.upload(ownerId, { title: input.title, type: 'textbook' }, file, courseId);
  }

  async reindex(documentId: string, courseId: string) {
    if (!Types.ObjectId.isValid(documentId)) throw this.notFound();
    const parsedCourseId = courseIdSchema.parse(courseId);
    const document = await this.records.findOneAndUpdate(
      {
        _id: new Types.ObjectId(documentId),
        type: 'textbook',
        deletionState: 'active',
        status: { $in: ['parsed', 'embedding', 'ready'] },
        parsedPageToken: { $ne: null }
      },
      { $set: { courseId: parsedCourseId } },
      { returnDocument: 'after' }
    );
    if (document === null)
      throw new DomainError(
        'RAG_DOCUMENT_NOT_READY',
        'The selected document is not ready for course indexing.',
        409
      );
    if (document.parsedPageToken === null)
      throw new DomainError(
        'RAG_DOCUMENT_NOT_READY',
        'The selected document is not ready for course indexing.',
        409
      );
    const job = await this.jobs.enqueue({
      type: 'embed_document',
      payload: { documentId },
      idempotencyKey: `embed_document:${documentId}:${parsedCourseId}:${document.parsedPageToken}`
    });
    if (job.status === 'failed') return this.jobs.requeueFailed(job._id.toString());
    return job;
  }

  async retry(jobId: string) {
    if (!Types.ObjectId.isValid(jobId))
      throw new DomainError('RAG_JOB_NOT_FOUND', 'RAG indexing job was not found.', 404);
    const job = await this.jobRecords.findById(jobId);
    if (job === null || !['embed_document', 'rebuild_document_index'].includes(job.type))
      throw new DomainError('RAG_JOB_NOT_FOUND', 'RAG indexing job was not found.', 404);
    return this.jobs.requeueFailed(jobId);
  }

  private notFound(): DomainError {
    return new DomainError('DOCUMENT_NOT_FOUND', 'Document was not found.', 404);
  }
}
