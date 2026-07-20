import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { RetrievedChunk } from '@marxmatrix/contracts';
import { Model, Types } from 'mongoose';
import {
  cosineSimilarity,
  type RagSearchFilter,
  type VectorRepository,
  validateFilter
} from './local-vector-repository.js';
import { RagChunkRecord } from './schemas/rag-chunk.schema.js';

const MAX_CANDIDATES = 200;

/** Mongo-backed local search. It is deliberately bounded and never queries outside the caller's scope. */
@Injectable()
export class MongoLocalVectorRepository implements VectorRepository {
  public constructor(
    @InjectModel(RagChunkRecord.name) private readonly chunks: Model<RagChunkRecord>
  ) {}

  async search(filter: RagSearchFilter): Promise<RetrievedChunk[]> {
    validateFilter(filter);
    const documentIds = filter.documentIds.map((id) => new Types.ObjectId(id));
    const currentTokens = filter.documentParseTokens.map((entry) => ({
      documentId: new Types.ObjectId(entry.documentId),
      parseToken: entry.parseToken
    }));
    const candidates = await this.chunks
      .find({
        ownerId: new Types.ObjectId(filter.ownerId),
        courseId: filter.courseId,
        documentId: { $in: documentIds },
        $or: currentTokens
      })
      .sort({ updatedAt: -1, _id: 1 })
      .limit(MAX_CANDIDATES);
    return candidates
      .map((chunk) => ({
        id: chunk._id.toString(),
        courseId: chunk.courseId,
        documentId: chunk.documentId.toString(),
        parseToken: chunk.parseToken,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        text: chunk.text,
        score: cosineSimilarity(filter.queryVector, chunk.embedding)
      }))
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .slice(0, filter.limit);
  }
}
