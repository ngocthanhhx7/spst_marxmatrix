import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { JobHandler } from '../jobs/worker-runner.js';
import { JobHandlerFailure, JobHandlerRegistry } from '../jobs/worker-runner.js';
import { DocumentsService } from './documents.service.js';
import { PdfParserService, PdfParsingError } from './pdf-parser.service.js';

/** A safe, retryable signal for the queue when another worker owns the document lease. */
export class DocumentParseBusyError extends Error {
  public constructor() {
    super('Document parsing is currently busy.');
    this.name = 'DocumentParseBusyError';
  }
}

@Injectable()
export class ParsePdfHandler implements JobHandler, OnModuleInit {
  public readonly type = 'parse_pdf' as const;
  private registered = false;

  public constructor(
    private readonly documents: DocumentsService,
    private readonly parser: PdfParserService,
    private readonly registry: JobHandlerRegistry
  ) {}

  onModuleInit(): void {
    if (this.registered) return;
    this.registry.register(this);
    this.registered = true;
  }

  async handle(job: Parameters<JobHandler['handle']>[0], signal: AbortSignal): Promise<void> {
    this.throwIfAborted(signal);
    try {
      const result = await this.documents.parseDocument(
        job.payload.documentId.toString(),
        this.parser
      );
      if (result === 'busy') throw new DocumentParseBusyError();
      this.throwIfAborted(signal);
    } catch (error: unknown) {
      if (error instanceof PdfParsingError) throw new JobHandlerFailure(error.code);
      throw error;
    }
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) throw new Error('Worker operation was aborted.');
  }
}
