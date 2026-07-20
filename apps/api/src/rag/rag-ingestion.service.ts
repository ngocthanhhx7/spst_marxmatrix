import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DomainError } from '../common/domain-error.js';
import { DocumentPageRecord } from '../documents/schemas/document-page.schema.js';
import { DocumentRecord } from '../documents/schemas/document.schema.js';
import { chunkDocumentPages } from './chunker.js';
import type { TextEmbedder } from './deterministic-embedder.js';
import { RAG_TEXT_EMBEDDER } from './rag.service.js';
import { RAG_EMBEDDING_DIMENSION } from './gemini-rag.provider.js';
import { RagChunkRecord } from './schemas/rag-chunk.schema.js';

@Injectable()
export class RagIngestionService {
  public constructor(
    @InjectModel(DocumentRecord.name) private readonly documents: Model<DocumentRecord>,
    @InjectModel(DocumentPageRecord.name) private readonly pages: Model<DocumentPageRecord>,
    @InjectModel(RagChunkRecord.name) private readonly chunks: Model<RagChunkRecord>,
    @Inject(RAG_TEXT_EMBEDDER) private readonly embedder: TextEmbedder
  ) {}

  async reindexDocument(documentId: string): Promise<void> {
    if (!Types.ObjectId.isValid(documentId)) throw this.documentNotReady();
    const document = await this.documents
      .findById(new Types.ObjectId(documentId))
      .select('+parsedPageToken');
    if (
      document === null ||
      document.courseId === null ||
      document.parsedPageToken === null ||
      !['parsed', 'embedding', 'ready'].includes(document.status)
    )
      throw this.documentNotReady();
    const claim = await this.documents
      .findOneAndUpdate(
        {
          _id: document._id,
          courseId: document.courseId,
          parsedPageToken: document.parsedPageToken,
          deletionState: 'active'
        },
        { $set: { status: 'embedding', errorCode: null, errorMessage: null } },
        { returnDocument: 'after' }
      )
      .select('+parsedPageToken');
    if (claim === null) throw this.documentNotReady();
    const courseId = claim.courseId;
    const parseToken = claim.parsedPageToken;
    if (courseId === null || parseToken === null) throw this.documentNotReady();
    const pages = await this.pages
      .find({ documentId: claim._id, parseToken })
      .sort({ pageNumber: 1, _id: 1 });
    const drafts = chunkDocumentPages(
      pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text }))
    );
    if (drafts.length === 0)
      throw new DomainError('RAG_DOCUMENT_EMPTY', 'The document has no indexable text.', 422);
    const embeddings = await Promise.all(drafts.map((draft) => this.embedder.embed(draft.text)));
    const stillCurrent = await this.documents.exists({
      _id: claim._id,
      courseId,
      parsedPageToken: parseToken,
      deletionState: 'active'
    });
    if (stillCurrent === null) throw this.documentNotReady();
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
        deletionState: 'active'
      },
      { $set: { status: 'ready', errorCode: null, errorMessage: null } }
    );
    if (completed.matchedCount === 0) throw this.documentNotReady();
  }

  private documentNotReady(): DomainError {
    return new DomainError(
      'RAG_DOCUMENT_NOT_READY',
      'The selected document is not ready for course indexing.',
      409
    );
  }
}
