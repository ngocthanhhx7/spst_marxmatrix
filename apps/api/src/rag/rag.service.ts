import { Inject, Injectable } from '@nestjs/common';
import {
  ragQuerySchema,
  type RagQuery,
  type RagResponse,
  type RetrievedChunk
} from '@marxmatrix/contracts';
import { DomainError } from '../common/domain-error.js';
import { CitationFirewall, RAG_INSUFFICIENT_EVIDENCE_WARNING } from './citation-firewall.js';
import { DeterministicTextEmbedder, type TextEmbedder } from './deterministic-embedder.js';
import type { VectorRepository } from './local-vector-repository.js';

const MAX_RETRIEVED_CHUNKS = 6;
const MAX_CONTEXT_CHARACTERS = 12_000;

export const RAG_TEXT_EMBEDDER = Symbol('RAG_TEXT_EMBEDDER');
export const RAG_RESPONSE_GENERATOR = Symbol('RAG_RESPONSE_GENERATOR');
export const RAG_VECTOR_REPOSITORY = Symbol('RAG_VECTOR_REPOSITORY');
export const RAG_CORPUS_SCOPE_RESOLVER = Symbol('RAG_CORPUS_SCOPE_RESOLVER');

export interface RagResponseGenerator {
  generate(input: RagQuery, context: readonly RetrievedChunk[]): Promise<RagResponse>;
}

/** Live providers may use the retrieval-query embedding task while demo adapters remain minimal. */
export interface QueryTextEmbedder extends TextEmbedder {
  embedQuery?(text: string): Promise<number[]>;
}

/** Resolves the published course corpus owner before vector retrieval; it is not the requesting student. */
export interface CourseCorpusScopeResolver {
  resolve(
    courseId: string,
    documentIds: readonly string[]
  ): Promise<{
    ownerId: string;
    documentParseTokens: { documentId: string; parseToken: string }[];
  }>;
}

@Injectable()
export class DeterministicRagResponseGenerator implements RagResponseGenerator {
  generate(input: RagQuery, context: readonly RetrievedChunk[]): Promise<RagResponse> {
    if (context.length === 0)
      return Promise.resolve({
        mode: input.mode,
        answer: RAG_INSUFFICIENT_EVIDENCE_WARNING,
        simulated: true,
        claims: [],
        citations: [],
        warning: RAG_INSUFFICIENT_EVIDENCE_WARNING
      });
    const citations = context.map((chunk) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      quote: chunk.text.slice(0, 500)
    }));
    const answer = responseForMode(input.mode, input.question, context);
    return Promise.resolve({
      mode: input.mode,
      answer,
      simulated: true,
      claims: context.map((chunk, index) => ({
        text: chunk.text.slice(0, 800),
        citationIndexes: [index]
      })),
      citations,
      warning: null
    });
  }
}

/** Live Gemini RAG adapters are intentionally not emulated in production. */
export class UnavailableRagTextEmbedder implements TextEmbedder {
  embed(_text: string): Promise<number[]> {
    void _text;
    return Promise.reject(
      new DomainError('RAG_AI_UNAVAILABLE', 'Grounded Copilot is not configured.', 503)
    );
  }
}

export class UnavailableRagResponseGenerator implements RagResponseGenerator {
  generate(_input: RagQuery, _context: readonly RetrievedChunk[]): Promise<RagResponse> {
    void _input;
    void _context;
    return Promise.reject(
      new DomainError('RAG_AI_UNAVAILABLE', 'Grounded Copilot is not configured.', 503)
    );
  }
}

@Injectable()
export class RagService {
  public constructor(
    @Inject(RAG_VECTOR_REPOSITORY) private readonly vectors: VectorRepository,
    @Inject(RAG_TEXT_EMBEDDER) private readonly embedder: QueryTextEmbedder,
    @Inject(RAG_RESPONSE_GENERATOR) private readonly generator: RagResponseGenerator,
    private readonly firewall: CitationFirewall,
    @Inject(RAG_CORPUS_SCOPE_RESOLVER) private readonly corpusScope: CourseCorpusScopeResolver
  ) {}

  async query(requestingUserId: string, request: RagQuery): Promise<RagResponse> {
    if (requestingUserId.trim().length === 0)
      throw new RangeError('An authenticated user is required.');
    const parsed = ragQuerySchema.parse(request);
    const corpus = await this.corpusScope.resolve(parsed.courseId, parsed.documentIds);
    const queryVector = await (this.embedder.embedQuery?.(parsed.question) ??
      this.embedder.embed(parsed.question));
    const retrieved = await this.vectors.search({
      ownerId: corpus.ownerId,
      courseId: parsed.courseId,
      documentIds: parsed.documentIds,
      documentParseTokens: corpus.documentParseTokens,
      queryVector,
      limit: MAX_RETRIEVED_CHUNKS
    });
    const boundedContext = boundContext(retrieved);
    const candidate = await this.generator.generate(parsed, boundedContext);
    return this.firewall.validate(
      candidate,
      boundedContext.map((chunk) => ({ ...chunk, ownerId: corpus.ownerId })),
      { ownerId: corpus.ownerId, courseId: parsed.courseId, documentIds: parsed.documentIds }
    );
  }
}

function boundContext(chunks: readonly RetrievedChunk[]): RetrievedChunk[] {
  const bounded: RetrievedChunk[] = [];
  let length = 0;
  for (const chunk of chunks) {
    if (
      bounded.length >= MAX_RETRIEVED_CHUNKS ||
      length + chunk.text.length > MAX_CONTEXT_CHARACTERS
    )
      break;
    bounded.push(chunk);
    length += chunk.text.length;
  }
  return bounded;
}

function responseForMode(
  mode: RagQuery['mode'],
  question: string,
  context: readonly RetrievedChunk[]
): string {
  const source = context[0];
  if (source === undefined) return RAG_INSUFFICIENT_EVIDENCE_WARNING;
  const excerpt = source.text.slice(0, 700);
  if (mode === 'outline') return `Dàn ý theo tài liệu: ${excerpt}`;
  if (mode === 'comparison') return `So sánh dựa trên đoạn trích: ${excerpt}`;
  if (mode === 'critique') return `Phê bình có căn cứ về “${question}”: ${excerpt}`;
  return `Trả lời có căn cứ cho “${question}”: ${excerpt}`;
}

export function createLocalDemoEmbedder(): TextEmbedder {
  return new DeterministicTextEmbedder();
}
