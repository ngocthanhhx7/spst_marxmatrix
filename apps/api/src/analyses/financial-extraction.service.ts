import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type {
  DocumentExtractionEnvelope,
  FinancialExtractionResult,
  QueueFinancialExtractionResult
} from '@marxmatrix/contracts';
import { createHash } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { AI_PROVIDER, type AIProvider } from '../ai/ai-provider.js';
import { DomainError } from '../common/domain-error.js';
import { DocumentPageRecord } from '../documents/schemas/document-page.schema.js';
import { DocumentRecord } from '../documents/schemas/document.schema.js';
import { JobService } from '../jobs/jobs.service.js';
import { Analysis } from './schemas/analysis.schema.js';

type ExtractionState = 'completed' | 'already-complete' | 'busy';

export const EXTRACTION_LOGGER = Symbol('EXTRACTION_LOGGER');
export interface ExtractionLogger {
  log(record: Record<string, unknown>): void;
}

interface ExtractionChunk {
  sourcePage: number;
  sourceChunkId: string;
  text: string;
}

export function financialExtractionFingerprint(
  documentId: string,
  parseToken: string,
  promptVersion: string,
  chunks: readonly ExtractionChunk[]
): string {
  return createHash('sha256')
    .update(JSON.stringify({ documentId, parseToken, promptVersion, chunks }))
    .digest('hex');
}

/** Persists evidence-backed review candidates; it deliberately does not invoke calculation logic. */
@Injectable()
export class FinancialExtractionService {
  public constructor(
    @InjectModel(DocumentRecord.name) private readonly documents: Model<DocumentRecord>,
    @InjectModel(DocumentPageRecord.name) private readonly pages: Model<DocumentPageRecord>,
    @InjectModel(Analysis.name) private readonly analyses: Model<Analysis>,
    @Inject(AI_PROVIDER) private readonly provider: AIProvider,
    private readonly jobs: JobService,
    @Optional() @Inject(EXTRACTION_LOGGER) private readonly logger?: ExtractionLogger
  ) {}

  async extract(documentId: string, analysisId: string): Promise<ExtractionState> {
    const document = await this.document(documentId);
    const chunks = await this.chunks(documentId, document.parsedPageToken);
    const fingerprint = financialExtractionFingerprint(
      documentId,
      document.parsedPageToken,
      this.provider.financialExtractionPromptVersion,
      chunks
    );
    const current = await this.analysis(analysisId);
    if (current.ownerId.toString() !== document.ownerId.toString())
      throw new DomainError(
        'EXTRACTION_DOCUMENT_ANALYSIS_MISMATCH',
        'The document and analysis do not belong to the same account.',
        404
      );
    if (current.financialExtractionFingerprint === fingerprint) return 'already-complete';

    const claimed = await this.analyses.findOneAndUpdate(
      {
        _id: current._id,
        financialExtractionFingerprint: { $ne: fingerprint },
        financialExtractionInProgressFingerprint: null
      },
      { $set: { financialExtractionInProgressFingerprint: fingerprint } },
      { returnDocument: 'after' }
    );
    if (claimed === null) {
      const refreshed = await this.analysis(analysisId);
      return refreshed.financialExtractionFingerprint === fingerprint ? 'already-complete' : 'busy';
    }

    try {
      const providerStartedAt = Date.now();
      const result = await this.provider.extractFinancialFacts({
        documentId,
        pageNumbers: [...new Set(chunks.map((chunk) => chunk.sourcePage))],
        chunks
      });
      this.logger?.log({
        event: 'financial_extraction_provider_completed',
        durationMs: Math.max(0, Date.now() - providerStartedAt),
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
        totalTokens: result.usage?.totalTokens ?? null
      });
      const facts = this.validatedFacts(result, chunks);
      // Fence the provider result against edits or deletion that happened while
      // the model was running. Never publish facts for a stale parse snapshot.
      let latestDocument: { parsedPageToken: string };
      try {
        latestDocument = await this.document(documentId);
      } catch (error: unknown) {
        if (error instanceof DomainError) {
          throw new DomainError(
            'EXTRACTION_SOURCE_CHANGED',
            'The source document changed during extraction.',
            409
          );
        }
        throw error;
      }
      if (latestDocument.parsedPageToken !== document.parsedPageToken)
        throw new DomainError(
          'EXTRACTION_SOURCE_CHANGED',
          'The source document changed during extraction.',
          409
        );
      const persisted = await this.analyses.findOneAndUpdate(
        { _id: current._id, financialExtractionInProgressFingerprint: fingerprint },
        {
          $push: { facts: { $each: facts } },
          $set: {
            financialExtractionFingerprint: fingerprint,
            financialExtractionInProgressFingerprint: null,
            financialExtractionDocumentId: new Types.ObjectId(documentId),
            financialExtractionSimulated: result.simulated,
            financialExtractionModel: result.model,
            financialExtractionPromptVersion: result.promptVersion,
            financialExtractionParseToken: document.parsedPageToken,
            financialExtractionUsage: result.usage ?? null
          },
          $inc: { stateVersion: 1 }
        },
        { returnDocument: 'after', runValidators: true }
      );
      if (persisted === null) return 'busy';
      return 'completed';
    } catch (error: unknown) {
      await this.analyses.updateOne(
        { _id: current._id, financialExtractionInProgressFingerprint: fingerprint },
        { $set: { financialExtractionInProgressFingerprint: null } }
      );
      throw error;
    }
  }

  async queue(
    ownerId: string,
    documentId: string,
    analysisId: string
  ): Promise<QueueFinancialExtractionResult> {
    if (
      !Types.ObjectId.isValid(ownerId) ||
      !Types.ObjectId.isValid(documentId) ||
      !Types.ObjectId.isValid(analysisId)
    )
      throw new DomainError('DOCUMENT_NOT_FOUND', 'Document was not found.', 404);
    const owner = new Types.ObjectId(ownerId);
    const document = await this.documents
      .findOne({ _id: new Types.ObjectId(documentId), ownerId: owner, deletionState: 'active' })
      .select('+parsedPageToken');
    if (document === null)
      throw new DomainError('DOCUMENT_NOT_FOUND', 'Document was not found.', 404);
    if (
      typeof document.parsedPageToken !== 'string' ||
      !['parsed', 'embedding', 'ready'].includes(document.status)
    )
      throw new DomainError(
        'DOCUMENT_NOT_READY',
        'Document pages are not ready for extraction.',
        409
      );
    const analysis = await this.analyses
      .findOne({ _id: new Types.ObjectId(analysisId), ownerId: owner })
      .select(
        '+financialExtractionFingerprint +financialExtractionDocumentId +financialExtractionParseToken'
      );
    if (analysis === null)
      throw new DomainError('ANALYSIS_NOT_FOUND', 'Analysis was not found.', 404);
    if (
      analysis.financialExtractionFingerprint !== null &&
      analysis.financialExtractionDocumentId?.toString() === documentId &&
      analysis.financialExtractionParseToken === document.parsedPageToken
    )
      return { status: 'already-complete', documentId, analysisId };
    const job = await this.jobs.enqueue({
      type: 'extract_financials',
      payload: { documentId, analysisId },
      idempotencyKey: `extract_financials:${documentId}:${analysisId}:${document.parsedPageToken}`
    });
    if (job.status === 'failed') await this.jobs.requeueFailed(job._id.toString());
    return { status: 'queued', documentId, analysisId };
  }

  async listForDocument(ownerId: string, documentId: string): Promise<DocumentExtractionEnvelope> {
    if (!Types.ObjectId.isValid(ownerId) || !Types.ObjectId.isValid(documentId))
      throw new DomainError('DOCUMENT_NOT_FOUND', 'Document was not found.', 404);
    const owner = new Types.ObjectId(ownerId);
    const document = await this.documents
      .findOne({ _id: new Types.ObjectId(documentId), ownerId: owner, deletionState: 'active' })
      .select('_id +parsedPageToken');
    if (document === null)
      throw new DomainError('DOCUMENT_NOT_FOUND', 'Document was not found.', 404);
    const analyses = await this.analyses
      .find({
        ownerId: owner,
        financialExtractionDocumentId: document._id,
        financialExtractionParseToken: document.parsedPageToken
      })
      .select(
        'facts +financialExtractionSimulated +financialExtractionModel +financialExtractionPromptVersion +financialExtractionUsage'
      )
      .sort({ updatedAt: -1 });
    const latest = analyses[0];
    if (latest === undefined)
      return { facts: [], simulated: null, model: null, promptVersion: null, usage: null };
    return {
      facts: latest.facts.flatMap((fact) => {
        if (
          fact.extractionMode !== 'ai_extracted' ||
          fact._id === undefined ||
          fact.sourcePage === null ||
          fact.evidenceText === null
        )
          return [];
        return [
          {
            id: fact._id.toString(),
            label: fact.label,
            value: fact.value,
            currency: fact.currency,
            scale: fact.scale,
            reportingPeriod: fact.reportingPeriod,
            classification: fact.classification,
            reviewStatus: fact.reviewStatus,
            sourcePage: fact.sourcePage,
            evidenceText: fact.evidenceText
          }
        ];
      }),
      simulated: latest.financialExtractionSimulated,
      model: latest.financialExtractionModel,
      promptVersion: latest.financialExtractionPromptVersion,
      usage: latest.financialExtractionUsage ?? null
    };
  }

  private async document(id: string): Promise<{
    _id: Types.ObjectId;
    ownerId: Types.ObjectId;
    parsedPageToken: string;
  }> {
    if (!Types.ObjectId.isValid(id))
      throw new DomainError('DOCUMENT_NOT_FOUND', 'Document was not found.', 404);
    const document = await this.documents
      .findOne({ _id: new Types.ObjectId(id), deletionState: 'active' })
      .select('+parsedPageToken');
    const parsedPageToken = document?.parsedPageToken;
    if (document === null || typeof parsedPageToken !== 'string')
      throw new DomainError(
        'DOCUMENT_NOT_READY',
        'Document pages are not ready for extraction.',
        409
      );
    return { _id: document._id, ownerId: document.ownerId, parsedPageToken };
  }

  private async chunks(documentId: string, parseToken: string): Promise<ExtractionChunk[]> {
    const pages = await this.pages
      .find({ documentId: new Types.ObjectId(documentId), parseToken })
      .sort({ pageNumber: 1 });
    const chunks = pages
      .filter((page) => page.text.trim().length > 0)
      .map((page) => ({
        sourcePage: page.pageNumber,
        // Parsed pages are the bounded source chunks until Task 7 creates finer-grained chunks.
        sourceChunkId: page.sourceChunkIds[0]?.toString() ?? page._id.toString(),
        text: page.text.trim().slice(0, 12_000)
      }));
    if (chunks.length === 0)
      throw new DomainError(
        'DOCUMENT_NOT_READY',
        'Document pages are not ready for extraction.',
        409
      );
    return chunks;
  }

  private async analysis(id: string): Promise<{
    _id: Types.ObjectId;
    ownerId: Types.ObjectId;
    financialExtractionFingerprint: string | null;
  }> {
    if (!Types.ObjectId.isValid(id))
      throw new DomainError('ANALYSIS_NOT_FOUND', 'Analysis was not found.', 404);
    const analysis = await this.analyses
      .findOne({ _id: new Types.ObjectId(id) })
      .select('+financialExtractionFingerprint +financialExtractionInProgressFingerprint');
    if (analysis === null)
      throw new DomainError('ANALYSIS_NOT_FOUND', 'Analysis was not found.', 404);
    return analysis;
  }

  private validatedFacts(result: FinancialExtractionResult, chunks: readonly ExtractionChunk[]) {
    const validSources = new Map(
      chunks.map((chunk) => [`${chunk.sourcePage}:${chunk.sourceChunkId}`, chunk.text])
    );
    return result.facts.map((fact) => {
      const source = validSources.get(`${fact.sourcePage}:${fact.sourceChunkId}`);
      if (source === undefined || !this.includesEvidence(source, fact.evidenceText))
        throw new DomainError(
          'EXTRACTION_EVIDENCE_INVALID',
          'Extracted financial facts must include grounded evidence.',
          422
        );
      return {
        _id: new Types.ObjectId(),
        ...fact,
        // A model can suggest classification but cannot approve or apply it.
        classification: 'needs_review' as const,
        reviewStatus: 'pending_review' as const
      };
    });
  }

  private includesEvidence(source: string, evidence: string): boolean {
    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
    return normalize(source).includes(normalize(evidence));
  }
}
