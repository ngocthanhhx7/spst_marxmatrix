import { Injectable } from '@nestjs/common';
import type { RagSearchFilter, VectorRepository } from './local-vector-repository.js';
import type { RetrievedChunk } from '@marxmatrix/contracts';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { validateFilter } from './local-vector-repository.js';
import { RagChunkRecord } from './schemas/rag-chunk.schema.js';

interface AtlasResult {
  _id: Types.ObjectId;
  courseId: string;
  documentId: Types.ObjectId;
  parseToken: string;
  pageStart: number;
  pageEnd: number;
  text: string;
  score: number;
}

/** Atlas uses a server-side vector index and mandatory scalar scope filter; it never falls back locally. */
@Injectable()
export class AtlasVectorRepository implements VectorRepository {
  public constructor(
    @InjectModel(RagChunkRecord.name) private readonly chunks: Model<RagChunkRecord>
  ) {}

  async search(filter: RagSearchFilter): Promise<RetrievedChunk[]> {
    validateFilter(filter);
    const rows = await this.chunks
      .aggregate<AtlasResult>([
        {
          $vectorSearch: {
            index: 'rag_chunks_vector_index',
            path: 'embedding',
            queryVector: [...filter.queryVector],
            numCandidates: Math.min(200, Math.max(filter.limit * 20, 20)),
            limit: filter.limit,
            filter: {
              ownerId: new Types.ObjectId(filter.ownerId),
              courseId: filter.courseId,
              documentId: { $in: filter.documentIds.map((id) => new Types.ObjectId(id)) },
              $or: filter.documentParseTokens.map((entry) => ({
                documentId: new Types.ObjectId(entry.documentId),
                parseToken: entry.parseToken
              }))
            }
          }
        },
        {
          $project: {
            courseId: 1,
            documentId: 1,
            parseToken: 1,
            pageStart: 1,
            pageEnd: 1,
            text: 1,
            score: { $meta: 'vectorSearchScore' }
          }
        }
      ])
      .exec();
    return rows.map((row) => ({
      id: row._id.toString(),
      courseId: row.courseId,
      documentId: row.documentId.toString(),
      parseToken: row.parseToken,
      pageStart: row.pageStart,
      pageEnd: row.pageEnd,
      text: row.text,
      score: row.score
    }));
  }
}
