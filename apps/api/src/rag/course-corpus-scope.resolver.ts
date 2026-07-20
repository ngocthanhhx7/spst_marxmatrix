import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DocumentPage, RagCourseDocument } from '@marxmatrix/contracts';
import { Model, Types } from 'mongoose';
import { DomainError } from '../common/domain-error.js';
import { DocumentRecord } from '../documents/schemas/document.schema.js';
import { DocumentPageRecord } from '../documents/schemas/document-page.schema.js';
import type { CourseCorpusScopeResolver } from './rag.service.js';

@Injectable()
export class MongoCourseCorpusScopeResolver implements CourseCorpusScopeResolver {
  public constructor(
    @InjectModel(DocumentRecord.name) private readonly documents: Model<DocumentRecord>,
    @InjectModel(DocumentPageRecord.name) private readonly pages: Model<DocumentPageRecord>
  ) {}

  async resolve(
    courseId: string,
    documentIds: readonly string[]
  ): Promise<{
    ownerId: string;
    documentParseTokens: { documentId: string; parseToken: string }[];
  }> {
    const documents = await this.publishedDocuments(courseId, documentIds);
    const ownerIds = new Set(documents.map((document) => document.ownerId.toString()));
    if (ownerIds.size !== 1)
      throw new DomainError(
        'RAG_DOCUMENT_SCOPE_INVALID',
        'Selected materials are not part of one published course corpus.',
        404
      );
    const ownerId = ownerIds.values().next().value;
    if (ownerId === undefined) throw this.scopeNotFound();
    const documentParseTokens = documents.map((document) => {
      if (document.parsedPageToken === null) throw this.scopeNotFound();
      return { documentId: document._id.toString(), parseToken: document.parsedPageToken };
    });
    return { ownerId, documentParseTokens };
  }

  async eligibleDocuments(courseId: string): Promise<RagCourseDocument[]> {
    const documents = await this.documents
      .find({ courseId, status: 'ready', type: 'textbook', deletionState: 'active' })
      .sort({ title: 1, _id: 1 })
      .select({ _id: 1, title: 1, pageCount: 1 });
    return documents.map((document) => ({
      id: document._id.toString(),
      title: document.title,
      pageCount: document.pageCount
    }));
  }

  async page(documentId: string, pageNumber: number, courseId: string): Promise<DocumentPage> {
    if (!Types.ObjectId.isValid(documentId) || !Number.isInteger(pageNumber) || pageNumber < 1)
      throw this.scopeNotFound();
    const document = await this.documents
      .findOne({
        _id: new Types.ObjectId(documentId),
        courseId,
        status: 'ready',
        type: 'textbook',
        deletionState: 'active'
      })
      .select('+parsedPageToken');
    if (document === null || document.parsedPageToken === null) throw this.scopeNotFound();
    const page = await this.pages.findOne({
      documentId: document._id,
      parseToken: document.parsedPageToken,
      pageNumber
    });
    if (page === null) throw this.scopeNotFound();
    return {
      documentId: document._id.toString(),
      pageNumber: page.pageNumber,
      text: page.text,
      sourceChunkIds: page.sourceChunkIds.map((chunkId) => chunkId.toString())
    };
  }

  private async publishedDocuments(courseId: string, documentIds: readonly string[]) {
    if (
      documentIds.length === 0 ||
      documentIds.length > 10 ||
      !documentIds.every((id) => Types.ObjectId.isValid(id))
    )
      throw this.scopeNotFound();
    const documents = await this.documents
      .find({
        _id: { $in: documentIds.map((id) => new Types.ObjectId(id)) },
        courseId,
        status: 'ready',
        type: 'textbook',
        deletionState: 'active'
      })
      .select('+parsedPageToken');
    if (documents.length !== documentIds.length) throw this.scopeNotFound();
    return documents;
  }

  private scopeNotFound(): DomainError {
    return new DomainError(
      'RAG_DOCUMENT_SCOPE_NOT_FOUND',
      'Selected course materials were not found.',
      404
    );
  }
}
