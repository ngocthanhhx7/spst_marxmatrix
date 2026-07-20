import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DomainError } from '../common/domain-error.js';
import { DocumentPageRecord } from '../documents/schemas/document-page.schema.js';
import { DocumentRecord } from '../documents/schemas/document.schema.js';
import { DEFAULT_JOB_LEASE_MS } from '../jobs/jobs.service.js';
import { chunkDocumentPages } from './chunker.js';
import type { TextEmbedder } from './deterministic-embedder.js';
import { RAG_TEXT_EMBEDDER } from './rag.service.js';
import { RAG_EMBEDDING_DIMENSION } from './gemini-rag.provider.js';
import { RagChunkRecord } from './schemas/rag-chunk.schema.js';

/** Aligned with the queue lease so a reclaimed job can fence a dead worker immediately. */
export const RAG_EMBEDDING_CLAIM_TIMEOUT_MS = DEFAULT_JOB_LEASE_MS;

@Injectable()
export class RagIngestionService {
  public constructor(
    @InjectModel(DocumentRecord.name) private readonly documents: Model<DocumentRecord>,
    @InjectModel(DocumentPageRecord.name) private readonly pages: Model<DocumentPageRecord>,
    @InjectModel(RagChunkRecord.name) private readonly chunks: Model<RagChunkRecord>,
    @Inject(RAG_TEXT_EMBEDDER) private readonly embedder: TextEmbedder
  ) {}

  async reindexDocument(documentId: string, signal?: AbortSignal): Promise<void> {
    this.assertNotAborted(signal);
    if (!Types.ObjectId.isValid(documentId)) throw this.documentNotReady();
    const startedAt = new Date();
    const staleBefore = new Date(startedAt.getTime() - RAG_EMBEDDING_CLAIM_TIMEOUT_MS);
    const embeddingToken = new Types.ObjectId().toHexString();
    const document = await this.documents
      .findById(new Types.ObjectId(documentId))
      .select('+parsedPageToken +embeddingStartedAt +embeddingToken');
    if (document === null || document.courseId === null || document.parsedPageToken === null)
      throw this.documentNotReady();
    if (
      document.status === 'embedding' &&
      document.embeddingStartedAt instanceof Date &&
      document.embeddingStartedAt > staleBefore
    )
      throw this.embeddingBusy();
    if (
      !this.isIndexable(
        document.status,
        document.errorCode,
        document.embeddingStartedAt,
        staleBefore
      )
    )
      throw this.documentNotReady();
    const claim = await this.documents
      .findOneAndUpdate(
        {
          _id: document._id,
          courseId: document.courseId,
          parsedPageToken: document.parsedPageToken,
          deletionState: 'active',
          $or: [
            { status: { $in: ['parsed', 'ready'] } },
            { status: 'failed', errorCode: 'EMBEDDING_FAILED' },
            {
              status: 'embedding',
              $or: [{ embeddingStartedAt: { $lte: staleBefore } }, { embeddingStartedAt: null }]
            }
          ]
        },
        {
          $set: {
            status: 'embedding',
            embeddingStartedAt: startedAt,
            embeddingToken,
            errorCode: null,
            errorMessage: null
          }
        },
        { returnDocument: 'after' }
      )
      .select('+parsedPageToken +embeddingStartedAt +embeddingToken');
    if (claim === null) throw this.embeddingBusy();
    const courseId = claim.courseId;
    const parseToken = claim.parsedPageToken;
    if (courseId === null || parseToken === null) throw this.documentNotReady();
    try {
      this.assertNotAborted(signal);
      const pages = await this.pages
        .find({ documentId: claim._id, parseToken })
        .sort({ pageNumber: 1, _id: 1 });
      const drafts = chunkDocumentPages(
        pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text }))
      );
      if (drafts.length === 0)
        throw new DomainError('RAG_DOCUMENT_EMPTY', 'The document has no indexable text.', 422);
      const embeddings = await this.embedInOrder(
        drafts.map((draft) => draft.text),
        signal
      );
      this.assertNotAborted(signal);
      const stillCurrent = await this.documents.exists({
        _id: claim._id,
        courseId,
        parsedPageToken: parseToken,
        deletionState: 'active',
        status: 'embedding',
        embeddingToken
      });
      if (stillCurrent === null) throw this.documentNotReady();
      this.assertNotAborted(signal);
      await this.chunks.bulkWrite(
        drafts.map((draft, index) => {
          const embedding = embeddings[index];
          if (
            embedding === undefined ||
            embedding.length !== RAG_EMBEDDING_DIMENSION ||
            embedding.some((value) => !Number.isFinite(value))
          )
            throw new DomainError(
              'RAG_EMBEDDING_INVALID',
              'Embedding output is incompatible with the configured vector index.',
              502
            );
          return {
            updateOne: {
              filter: {
                ownerId: claim.ownerId,
                courseId,
                documentId: claim._id,
                parseToken,
                checksum: draft.checksum
              },
              update: {
                $set: {
                  ownerId: claim.ownerId,
                  courseId,
                  documentId: claim._id,
                  parseToken,
                  pageStart: draft.pageStart,
                  pageEnd: draft.pageEnd,
                  text: draft.text,
                  checksum: draft.checksum,
                  embedding
                }
              },
              upsert: true
            }
          };
        })
      );
      await this.chunks.deleteMany({
        documentId: claim._id,
        parseToken,
        checksum: { $nin: drafts.map((draft) => draft.checksum) }
      });
      const completed = await this.documents.updateOne(
        {
          _id: claim._id,
          courseId,
          parsedPageToken: parseToken,
          deletionState: 'active',
          status: 'embedding',
          embeddingToken
        },
        {
          $set: {
            status: 'ready',
            embeddingStartedAt: null,
            embeddingToken: null,
            errorCode: null,
            errorMessage: null
          }
        }
      );
      if (completed.matchedCount === 0) throw this.documentNotReady();
    } catch (error: unknown) {
      try {
        await this.documents.updateOne(
          {
            _id: claim._id,
            courseId,
            parsedPageToken: parseToken,
            deletionState: 'active',
            status: 'embedding',
            embeddingToken
          },
          {
            $set: {
              status: 'failed',
              embeddingStartedAt: null,
              embeddingToken: null,
              errorCode: 'EMBEDDING_FAILED',
              errorMessage: 'Document indexing could not be completed.'
            }
          }
        );
      } catch {
        // Preserve the original indexing failure for queue retry classification.
      }
      throw error;
    }
  }

  private isIndexable(
    status: string,
    errorCode: string | null,
    embeddingStartedAt: Date | null | undefined,
    staleBefore: Date
  ): boolean {
    return (
      ['parsed', 'ready'].includes(status) ||
      (status === 'failed' && errorCode === 'EMBEDDING_FAILED') ||
      (status === 'embedding' &&
        (embeddingStartedAt === undefined ||
          embeddingStartedAt === null ||
          embeddingStartedAt <= staleBefore))
    );
  }

  private async embedInOrder(texts: readonly string[], signal?: AbortSignal): Promise<number[][]> {
    const results = new Array<number[]>(texts.length);
    let nextIndex = 0;
    let stopped = false;
    let firstError: unknown;
    const run = async () => {
      while (!stopped && nextIndex < texts.length) {
        try {
          this.assertNotAborted(signal);
        } catch (error: unknown) {
          if (!stopped) firstError = error;
          stopped = true;
          return;
        }
        const index = nextIndex;
        nextIndex += 1;
        const text = texts[index];
        if (text === undefined) continue;
        try {
          results[index] = await this.embedder.embed(text, signal);
        } catch (error: unknown) {
          if (!stopped) firstError = signal?.aborted ? this.operationAborted() : error;
          stopped = true;
        }
      }
    };
    await Promise.allSettled(Array.from({ length: Math.min(4, texts.length) }, run));
    if (stopped) throw firstError;
    return results;
  }

  private assertNotAborted(signal: AbortSignal | undefined): void {
    if (signal?.aborted) throw this.operationAborted();
  }

  private operationAborted(): DomainError {
    return new DomainError('RAG_OPERATION_ABORTED', 'Document indexing was cancelled.', 499);
  }

  private documentNotReady(): DomainError {
    return new DomainError(
      'RAG_DOCUMENT_NOT_READY',
      'The selected document is not ready for course indexing.',
      409
    );
  }

  private embeddingBusy(): DomainError {
    return new DomainError(
      'RAG_EMBEDDING_BUSY',
      'Another worker is still indexing the selected document.',
      409
    );
  }
}
