import { Injectable } from '@nestjs/common';
import { PERSONAL_COPILOT_COURSE_ID } from '@marxmatrix/contracts';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DomainError } from '../common/domain-error.js';
import { DocumentRecord } from '../documents/schemas/document.schema.js';

@Injectable()
export class PrivateCopilotScopeResolver {
  public constructor(
    @InjectModel(DocumentRecord.name) private readonly documents: Model<DocumentRecord>
  ) {}

  async resolve(ownerId: string, documentIds: readonly string[]) {
    if (
      !Types.ObjectId.isValid(ownerId) ||
      documentIds.length === 0 ||
      documentIds.length > 10 ||
      !documentIds.every((id) => Types.ObjectId.isValid(id))
    )
      throw this.scopeNotFound();
    const documents = await this.documents
      .find({
        _id: { $in: documentIds.map((id) => new Types.ObjectId(id)) },
        ownerId: new Types.ObjectId(ownerId),
        courseId: PERSONAL_COPILOT_COURSE_ID,
        type: 'textbook',
        status: 'ready',
        deletionState: 'active'
      })
      .select('+parsedPageToken');
    if (documents.length !== documentIds.length) throw this.scopeNotFound();
    const documentParseTokens = documents.map((document) => {
      if (document.parsedPageToken === null) throw this.scopeNotFound();
      return { documentId: document._id.toString(), parseToken: document.parsedPageToken };
    });
    return { ownerId, courseId: PERSONAL_COPILOT_COURSE_ID, documentParseTokens };
  }

  private scopeNotFound(): DomainError {
    return new DomainError(
      'RAG_DOCUMENT_SCOPE_NOT_FOUND',
      'Selected private Copilot documents were not found.',
      404
    );
  }
}
