import { Injectable, type OnModuleInit } from '@nestjs/common';
import { JobHandlerFailure, JobHandlerRegistry, type JobHandler } from '../jobs/worker-runner.js';
import { RagIngestionService } from './rag-ingestion.service.js';

@Injectable()
export class EmbedDocumentHandler implements JobHandler, OnModuleInit {
  public readonly type = 'embed_document' as const;
  private registered = false;

  public constructor(
    private readonly ingestion: RagIngestionService,
    private readonly registry: JobHandlerRegistry
  ) {}

  onModuleInit(): void {
    if (this.registered) return;
    this.registry.register(this);
    this.registered = true;
  }

  async handle(job: Parameters<JobHandler['handle']>[0], signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw new Error('Worker operation was aborted.');
    try {
      await this.ingestion.reindexDocument(job.payload.documentId.toString(), signal);
    } catch (error: unknown) {
      if (this.isPublicRagError(error))
        throw new JobHandlerFailure('EMBEDDING_FAILED', this.isTransientRagError(error));
      throw error;
    }
    if (signal.aborted) throw new Error('Worker operation was aborted.');
  }

  private isPublicRagError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string' &&
      (error as { code: string }).code.startsWith('RAG_')
    );
  }

  private isTransientRagError(error: unknown): boolean {
    if (!this.isPublicRagError(error)) return false;
    return ['RAG_AI_TIMEOUT', 'RAG_AI_REQUEST_FAILED', 'RAG_EMBEDDING_BUSY'].includes(
      (error as { code: string }).code
    );
  }
}
