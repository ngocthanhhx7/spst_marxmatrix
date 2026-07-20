import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AI_PROVIDER,
  GeminiAIProvider,
  MockAIProvider,
  UnavailableAIProvider,
  type AIProvider
} from './ai-provider.js';

@Module({
  providers: [
    {
      provide: AI_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AIProvider => {
        const provider = config.getOrThrow<'mock' | 'gemini'>('AI_PROVIDER');
        if (provider === 'mock') return new MockAIProvider();
        const apiKey = config.get<string>('GEMINI_API_KEY');
        if (apiKey === undefined || apiKey.trim().length === 0) return new UnavailableAIProvider();
        return new GeminiAIProvider({
          apiKey,
          generationModel: config.getOrThrow<string>('GEMINI_GENERATION_MODEL'),
          timeoutMs: config.getOrThrow<number>('AI_REQUEST_TIMEOUT_MS'),
          maxRetries: config.getOrThrow<number>('AI_MAX_RETRIES')
        });
      }
    }
  ],
  exports: [AI_PROVIDER]
})
export class AiModule {}
