import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AIProviderError } from '../ai/ai-provider.js';
import { JobHandlerFailure, JobHandlerRegistry, type JobHandler } from '../jobs/worker-runner.js';
import { FinancialExtractionService } from './financial-extraction.service.js';

@Injectable()
export class ExtractFinancialsHandler implements JobHandler, OnModuleInit {
  public readonly type = 'extract_financials' as const;
  private registered = false;

  public constructor(
    private readonly extraction: FinancialExtractionService,
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
      if (job.payload.analysisId === null)
        throw new JobHandlerFailure('FINANCIAL_EXTRACTION_FAILED', false);
      const result = await this.extraction.extract(
        job.payload.documentId.toString(),
        job.payload.analysisId.toString()
      );
      if (result === 'busy') throw new Error('Financial extraction is currently busy.');
      if (signal.aborted) throw new Error('Worker operation was aborted.');
    } catch (error: unknown) {
      if (error instanceof AIProviderError)
        throw new JobHandlerFailure('FINANCIAL_EXTRACTION_FAILED', error.retryable);
      if (this.isPublicExtractionError(error))
        throw new JobHandlerFailure('FINANCIAL_EXTRACTION_FAILED', false);
      throw error;
    }
  }

  private isPublicExtractionError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string' &&
      ((error as { code: string }).code.startsWith('EXTRACTION_') ||
        (error as { code: string }).code.startsWith('AI_'))
    );
  }
}
