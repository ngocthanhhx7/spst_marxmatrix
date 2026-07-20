import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { CreateDocumentMetadata, DocumentMetadata, DocumentPage } from '@marxmatrix/contracts';
import { MongoRuntimeError } from 'mongodb';
import { Model, Types } from 'mongoose';
import { DomainError } from '../common/domain-error.js';
import { JobService } from '../jobs/jobs.service.js';
import { DocumentValidationError, validatePdfUpload } from './document-validation.js';
import { GridFsStorageService } from './gridfs-storage.service.js';
import { PdfParserService, PdfParsingError } from './pdf-parser.service.js';
import { DocumentPageRecord } from './schemas/document-page.schema.js';
import { DocumentRecord, type StoredDocument } from './schemas/document.schema.js';

interface UploadedPdf {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export type ParseDocumentResult = 'completed' | 'already-complete' | 'busy';

/** Must stay aligned with the queue worker's default job lease. */
export const DOCUMENT_PARSE_LEASE_MS = 30_000;

@Injectable()
export class DocumentsService {
  public constructor(
    @InjectModel(DocumentRecord.name) private readonly documents: Model<DocumentRecord>,
    @InjectModel(DocumentPageRecord.name) private readonly pages: Model<DocumentPageRecord>,
    private readonly storage: GridFsStorageService,
    private readonly jobs: JobService,
    private readonly config: ConfigService
  ) {}

  async upload(
    ownerId: string,
    metadata: CreateDocumentMetadata,
    file: UploadedPdf,
    courseId?: string
  ): Promise<DocumentMetadata> {
    let validated;
    try {
      validated = validatePdfUpload({
        ...file,
        maxBytes: this.config.getOrThrow<number>('DOCUMENT_MAX_SIZE_MB') * 1024 * 1024,
        allowedMimeTypes: this.config
          .getOrThrow<string>('DOCUMENT_ALLOWED_MIME_TYPES')
          .split(',')
          .map((value) => value.trim())
      });
    } catch (error: unknown) {
      if (error instanceof DocumentValidationError)
        throw new DomainError(error.code, error.message, 400);
      throw error;
    }
    const ownerObjectId = this.ownerObjectId(ownerId);
    const existingForOwner = await this.findOne(
      { ownerId: ownerObjectId, checksum: validated.checksum },
      false
    );
    if (existingForOwner !== null) {
      this.assertNotDeleting(existingForOwner);
      return this.enqueueOrMarkFailed(existingForOwner);
    }
    const stored = await this.storage.store(
      validated.buffer,
      validated.filename,
      validated.checksum,
      ownerObjectId.toString()
    );
    let created: StoredDocument | undefined;
    try {
      created = await this.documents.create({
        ownerId: ownerObjectId,
        title: metadata.title,
        courseId: courseId ?? null,
        type: metadata.type,
        status: 'uploaded',
        mimeType: validated.mimeType,
        originalFileName: validated.filename,
        byteSize: validated.byteSize,
        checksum: validated.checksum,
        gridFsFileId: stored.id,
        pageCount: 0,
        errorCode: null,
        errorMessage: null
      });
      return this.enqueueOrMarkFailed(created);
    } catch (error: unknown) {
      if (this.isDuplicate(error)) {
        const concurrent = await this.findOne(
          { ownerId: ownerObjectId, checksum: validated.checksum },
          true
        );
        if (concurrent !== null) {
          if (stored.created && concurrent.gridFsFileId.toString() !== stored.id.toString())
            await this.storage.remove(stored.id);
          this.assertNotDeleting(concurrent);
          return this.enqueueOrMarkFailed(concurrent);
        }
      }
      if (created !== undefined)
        await this.documents.deleteOne({ _id: created._id, ownerId: ownerObjectId });
      if (stored.created) await this.storage.remove(stored.id);
      throw error;
    }
  }

  async list(ownerId: string): Promise<DocumentMetadata[]> {
    return (
      await this.documents
        .find({ ownerId: this.ownerObjectId(ownerId), deletionState: 'active' })
        .sort({ updatedAt: -1 })
    ).map((item) => this.metadata(item));
  }

  async listForCourse(ownerId: string, courseId: string): Promise<DocumentMetadata[]> {
    return (
      await this.documents
        .find({
          ownerId: this.ownerObjectId(ownerId),
          courseId,
          deletionState: 'active'
        })
        .sort({ updatedAt: -1 })
    ).map((item) => this.metadata(item));
  }

  async detail(ownerId: string, id: string): Promise<DocumentMetadata> {
    return this.metadata(await this.owned(ownerId, id, false));
  }

  async status(ownerId: string, id: string): Promise<DocumentMetadata> {
    return this.detail(ownerId, id);
  }

  async page(ownerId: string, id: string, pageNumber: number): Promise<DocumentPage> {
    const document = await this.owned(ownerId, id, false);
    if (document.parsedPageToken == null)
      throw new DomainError('DOCUMENT_PAGE_NOT_FOUND', 'Document page was not found.', 404);
    const page = await this.pages.findOne({
      documentId: document._id,
      pageNumber: Number(pageNumber),
      parseToken: document.parsedPageToken
    });
    if (page === null)
      throw new DomainError('DOCUMENT_PAGE_NOT_FOUND', 'Document page was not found.', 404);
    return {
      documentId: document._id.toString(),
      pageNumber: page.pageNumber,
      text: page.text,
      sourceChunkIds: page.sourceChunkIds.map((chunk) => chunk.toString())
    };
  }

  async download(ownerId: string, id: string) {
    const document = await this.owned(ownerId, id, true);
    return {
      filename: document.originalFileName,
      stream: this.storage.openDownload(document.gridFsFileId)
    };
  }

  async delete(ownerId: string, id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id))
      throw new DomainError('DOCUMENT_NOT_FOUND', 'Document was not found.', 404);
    const ownerObjectId = this.ownerObjectId(ownerId);
    const document = await this.claimForDelete({
      _id: new Types.ObjectId(id),
      ownerId: ownerObjectId,
      $or: [
        { deletionState: { $ne: 'deleting' } },
        { deletionClaimedAt: { $lte: new Date(Date.now() - 5 * 60_000) } }
      ]
    });
    if (document === null)
      throw new DomainError('DOCUMENT_NOT_FOUND', 'Document was not found.', 404);
    try {
      await this.pages.deleteMany({ documentId: document._id });
      await this.removeBytesIdempotently(document.gridFsFileId);
      await this.documents.deleteOne({
        _id: document._id,
        ownerId: ownerObjectId,
        deletionState: 'deleting'
      });
    } catch (error: unknown) {
      await this.documents.updateOne(
        { _id: document._id, ownerId: ownerObjectId, deletionState: 'deleting' },
        // Keep partially deleted records invisible. An epoch claim makes the
        // idempotent cleanup path immediately reclaimable by the owner.
        { $set: { deletionClaimedAt: new Date(0) } }
      );
      throw error;
    }
  }

  async parseDocument(documentId: string, parser: PdfParserService): Promise<ParseDocumentResult> {
    if (!Types.ObjectId.isValid(documentId))
      throw new DomainError('DOCUMENT_NOT_FOUND', 'Document was not found.', 404);
    const document = await this.findOne({ _id: new Types.ObjectId(documentId) }, true);
    if (document === null)
      throw new DomainError('DOCUMENT_NOT_FOUND', 'Document was not found.', 404);
    if (['parsed', 'embedding', 'ready'].includes(document.status)) {
      await this.enqueueEmbeddingIfCourse(document);
      if (document.parsedPageToken != null)
        await this.pages.deleteMany({
          documentId: document._id,
          parseToken: { $ne: document.parsedPageToken }
        });
      return 'already-complete';
    }
    const parsingStartedAt = new Date();
    const claimToken = new Types.ObjectId().toHexString();
    const claimed = await this.documents.findOneAndUpdate(
      {
        _id: document._id,
        deletionState: 'active',
        $or: [
          { status: { $in: ['uploaded', 'failed'] } },
          {
            status: 'parsing',
            parsingStartedAt: { $lte: new Date(Date.now() - DOCUMENT_PARSE_LEASE_MS) }
          }
        ]
      },
      {
        $set: {
          status: 'parsing',
          parsingStartedAt,
          parsingToken: claimToken,
          errorCode: null,
          errorMessage: null
        }
      },
      { returnDocument: 'after', projection: '+gridFsFileId +parsingToken +parsingStartedAt' }
    );
    if (claimed === null) {
      const current = await this.findOne({ _id: document._id }, false);
      return current !== null && ['parsed', 'embedding', 'ready'].includes(current.status)
        ? 'already-complete'
        : 'busy';
    }
    let activeToken = claimToken;
    let beganPageWrites = false;
    let published = false;
    try {
      const extractedPages = await parser.extract(await this.storage.read(claimed.gridFsFileId));
      const commitToken = new Types.ObjectId().toHexString();
      const commitClaim = await this.documents.findOneAndUpdate(
        {
          _id: claimed._id,
          status: 'parsing',
          deletionState: 'active',
          parsingToken: claimToken
        },
        { $set: { parsingToken: commitToken, parsingStartedAt: new Date() } },
        { returnDocument: 'after', projection: '+gridFsFileId +parsingToken +parsingStartedAt' }
      );
      if (commitClaim === null) return 'busy';
      activeToken = commitToken;
      beganPageWrites = true;
      await this.pages.deleteMany({ documentId: claimed._id, parseToken: commitToken });
      await this.pages.insertMany(
        extractedPages.map((page) => ({
          documentId: claimed._id,
          parseToken: commitToken,
          pageNumber: page.pageNumber,
          text: page.text,
          sourceChunkIds: []
        }))
      );
      const completed = await this.documents.updateOne(
        {
          _id: claimed._id,
          status: 'parsing',
          deletionState: 'active',
          parsingToken: commitToken
        },
        {
          $set: {
            status: 'parsed',
            pageCount: extractedPages.length,
            parsedPageToken: commitToken,
            errorCode: null,
            errorMessage: null,
            parsingStartedAt: null,
            parsingToken: null
          }
        }
      );
      if (completed.matchedCount === 0) {
        await this.pages.deleteMany({ documentId: claimed._id, parseToken: activeToken });
        return 'busy';
      }
      published = true;
      await this.pages.deleteMany({
        documentId: claimed._id,
        parseToken: { $ne: commitToken }
      });
      if (typeof claimed.courseId === 'string')
        await this.enqueueEmbedding(claimed._id.toString(), claimed.courseId, commitToken);
      return 'completed';
    } catch (error: unknown) {
      if (published) throw error;
      const parsingError = error instanceof PdfParsingError ? error : undefined;
      const failed = await this.documents.updateOne(
        {
          _id: claimed._id,
          status: 'parsing',
          deletionState: 'active',
          parsingToken: activeToken
        },
        {
          $set: {
            status: 'failed',
            parsingStartedAt: null,
            parsingToken: null,
            errorCode: parsingError?.code ?? 'PDF_PARSE_FAILED',
            errorMessage: parsingError?.message ?? 'The PDF could not be parsed.'
          }
        }
      );
      if (beganPageWrites && failed.matchedCount !== 0)
        await this.pages.deleteMany({ documentId: claimed._id, parseToken: activeToken });
      throw error;
    }
  }

  private async owned(
    ownerId: string,
    id: string,
    includeStorage: boolean
  ): Promise<StoredDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new DomainError('DOCUMENT_NOT_FOUND', 'Document was not found.', 404);
    const document = await this.findOne(
      {
        _id: new Types.ObjectId(id),
        ownerId: this.ownerObjectId(ownerId),
        deletionState: 'active'
      },
      includeStorage
    );
    if (document === null)
      throw new DomainError('DOCUMENT_NOT_FOUND', 'Document was not found.', 404);
    return document;
  }

  private async findOne(
    filter: Record<string, unknown>,
    includeStorage: boolean
  ): Promise<StoredDocument | null> {
    const query = this.documents.findOne(filter) as unknown as {
      select?: (projection: string) => Promise<StoredDocument | null>;
      then?: PromiseLike<StoredDocument | null>['then'];
    };
    if (query.select !== undefined)
      return query.select(
        includeStorage
          ? '+gridFsFileId +parsedPageToken +deletionState'
          : '+parsedPageToken +deletionState'
      );
    return Promise.resolve(query as unknown as StoredDocument | null);
  }

  private async claimForDelete(filter: Record<string, unknown>): Promise<StoredDocument | null> {
    const query = this.documents.findOneAndUpdate(
      filter,
      { $set: { deletionState: 'deleting', deletionClaimedAt: new Date() } },
      { returnDocument: 'after' }
    ) as unknown as {
      select?: (projection: string) => Promise<StoredDocument | null>;
      then?: PromiseLike<StoredDocument | null>['then'];
    };
    if (query.select !== undefined) return query.select('+gridFsFileId');
    return Promise.resolve(query as unknown as StoredDocument | null);
  }
  private async removeBytesIdempotently(id: Types.ObjectId): Promise<void> {
    try {
      await this.storage.remove(id);
    } catch (error: unknown) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: unknown }).code
          : undefined;
      const missingGridFsFile =
        error instanceof MongoRuntimeError && error.message.startsWith('File not found for id ');
      if (code !== 'ENOENT' && code !== 'FileNotFound' && !missingGridFsFile) throw error;
    }
  }

  private ownerObjectId(ownerId: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(ownerId))
      throw new DomainError('DOCUMENT_NOT_FOUND', 'Document was not found.', 404);
    return new Types.ObjectId(ownerId);
  }

  private assertNotDeleting(document: StoredDocument): void {
    if (document.deletionState === 'deleting')
      throw new DomainError(
        'DOCUMENT_DELETION_IN_PROGRESS',
        'A matching document deletion is still in progress. Retry shortly.',
        409
      );
  }

  private metadata(document: StoredDocument): DocumentMetadata {
    return {
      id: document._id.toString(),
      title: document.title,
      type: document.type,
      status: document.status,
      mimeType: document.mimeType,
      originalFileName: document.originalFileName,
      byteSize: document.byteSize,
      checksum: document.checksum,
      pageCount: document.pageCount,
      errorCode: document.errorCode,
      errorMessage: document.errorMessage,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString()
    };
  }
  private async enqueueOrMarkFailed(document: StoredDocument): Promise<DocumentMetadata> {
    if (['parsed', 'embedding', 'ready'].includes(document.status)) return this.metadata(document);
    try {
      await this.jobs.enqueue({
        type: 'parse_pdf',
        payload: { documentId: document._id.toString() },
        idempotencyKey: `parse_pdf:${document._id.toString()}`
      });
      if (document.status === 'failed' && document.errorCode === 'JOB_ENQUEUE_FAILED') {
        await this.documents.updateOne(
          { _id: document._id, status: 'failed', errorCode: 'JOB_ENQUEUE_FAILED' },
          { $set: { status: 'uploaded', errorCode: null, errorMessage: null } }
        );
        document.status = 'uploaded';
        document.errorCode = null;
        document.errorMessage = null;
      }
      return this.metadata(document);
    } catch {
      await this.documents.updateOne(
        { _id: document._id },
        {
          $set: {
            status: 'failed',
            errorCode: 'JOB_ENQUEUE_FAILED',
            errorMessage: 'Document processing could not be queued. Retry the upload to recover.'
          }
        }
      );
      document.status = 'failed';
      document.errorCode = 'JOB_ENQUEUE_FAILED';
      document.errorMessage =
        'Document processing could not be queued. Retry the upload to recover.';
      return this.metadata(document);
    }
  }
  private async enqueueEmbeddingIfCourse(document: StoredDocument): Promise<void> {
    if (typeof document.courseId !== 'string' || document.parsedPageToken === null) return;
    await this.enqueueEmbedding(
      document._id.toString(),
      document.courseId,
      document.parsedPageToken
    );
  }
  private async enqueueEmbedding(
    documentId: string,
    courseId: string,
    parseToken: string
  ): Promise<void> {
    await this.jobs.enqueue({
      type: 'embed_document',
      payload: { documentId },
      idempotencyKey: `embed_document:${documentId}:${courseId}:${parseToken}`
    });
  }
  private isDuplicate(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000
    );
  }
}
