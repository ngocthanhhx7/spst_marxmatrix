import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentsModule } from '../documents/documents.module.js';
import {
  DocumentPageRecord,
  DocumentPageRecordSchema
} from '../documents/schemas/document-page.schema.js';
import { DocumentRecord, DocumentRecordSchema } from '../documents/schemas/document.schema.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { AtlasVectorRepository } from './atlas-vector.repository.js';
import { CitationFirewall } from './citation-firewall.js';
import { MongoCourseCorpusScopeResolver } from './course-corpus-scope.resolver.js';
import {
  createConfiguredGeminiRagProvider,
  GeminiRagProvider,
  type RagUsageLogger
} from './gemini-rag.provider.js';
import {
  DeterministicRagResponseGenerator,
  RAG_CORPUS_SCOPE_RESOLVER,
  RAG_RESPONSE_GENERATOR,
  RAG_TEXT_EMBEDDER,
  RAG_VECTOR_REPOSITORY,
  RagService,
  UnavailableRagResponseGenerator,
  UnavailableRagTextEmbedder,
  createLocalDemoEmbedder
} from './rag.service.js';
import { EmbedDocumentHandler } from './embed-document.handler.js';
import { MongoLocalVectorRepository } from './mongo-local-vector.repository.js';
import { RagController } from './rag.controller.js';
import { RagIngestionService } from './rag-ingestion.service.js';
import { RagChunkRecord, RagChunkRecordSchema } from './schemas/rag-chunk.schema.js';
import { DemoCorpusBootstrap } from './demo-corpus.bootstrap.js';

const RAG_LIVE_PROVIDER = Symbol('RAG_LIVE_PROVIDER');
const RAG_LOGGER = Symbol('RAG_LOGGER');

@Module({
  imports: [
    DocumentsModule,
    IdentityModule,
    JobsModule,
    MongooseModule.forFeature([
      { name: DocumentRecord.name, schema: DocumentRecordSchema },
      { name: DocumentPageRecord.name, schema: DocumentPageRecordSchema },
      { name: RagChunkRecord.name, schema: RagChunkRecordSchema }
    ])
  ],
  controllers: [RagController],
  providers: [
    CitationFirewall,
    RagService,
    RagIngestionService,
    DemoCorpusBootstrap,
    EmbedDocumentHandler,
    MongoCourseCorpusScopeResolver,
    MongoLocalVectorRepository,
    AtlasVectorRepository,
    DeterministicRagResponseGenerator,
    UnavailableRagResponseGenerator,
    {
      provide: RAG_LOGGER,
      useFactory: (): RagUsageLogger => new Logger(GeminiRagProvider.name)
    },
    {
      provide: RAG_LIVE_PROVIDER,
      inject: [ConfigService, RAG_LOGGER],
      useFactory: (config: ConfigService, logger: RagUsageLogger): GeminiRagProvider | null => {
        return createConfiguredGeminiRagProvider(
          {
            demoMode: config.getOrThrow<boolean>('DEMO_MODE'),
            aiProvider: config.getOrThrow<'mock' | 'gemini'>('AI_PROVIDER'),
            apiKey: config.get<string>('GEMINI_API_KEY'),
            generationModel: config.getOrThrow<string>('GEMINI_GENERATION_MODEL'),
            embeddingModel: config.getOrThrow<string>('GEMINI_EMBEDDING_MODEL'),
            timeoutMs: config.getOrThrow<number>('AI_REQUEST_TIMEOUT_MS'),
            maxRetries: config.getOrThrow<number>('AI_MAX_RETRIES')
          },
          logger
        );
      }
    },
    {
      provide: RAG_TEXT_EMBEDDER,
      inject: [ConfigService, RAG_LIVE_PROVIDER],
      useFactory: (config: ConfigService, live: GeminiRagProvider | null) => {
        if (config.getOrThrow<boolean>('DEMO_MODE')) return createLocalDemoEmbedder();
        return live ?? new UnavailableRagTextEmbedder();
      }
    },
    {
      provide: RAG_RESPONSE_GENERATOR,
      inject: [
        ConfigService,
        DeterministicRagResponseGenerator,
        UnavailableRagResponseGenerator,
        RAG_LIVE_PROVIDER
      ],
      useFactory: (
        config: ConfigService,
        demo: DeterministicRagResponseGenerator,
        unavailable: UnavailableRagResponseGenerator,
        live: GeminiRagProvider | null
      ) => (config.getOrThrow<boolean>('DEMO_MODE') ? demo : (live ?? unavailable))
    },
    { provide: RAG_CORPUS_SCOPE_RESOLVER, useExisting: MongoCourseCorpusScopeResolver },
    {
      provide: RAG_VECTOR_REPOSITORY,
      inject: [ConfigService, MongoLocalVectorRepository, AtlasVectorRepository],
      useFactory: (
        config: ConfigService,
        local: MongoLocalVectorRepository,
        atlas: AtlasVectorRepository
      ) => (config.getOrThrow<'local' | 'atlas'>('RAG_VECTOR_PROVIDER') === 'atlas' ? atlas : local)
    }
  ],
  exports: [RagIngestionService]
})
export class RagModule {}
