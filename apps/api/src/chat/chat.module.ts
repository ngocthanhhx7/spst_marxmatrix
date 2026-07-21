import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { CHAT_MAX_IMAGE_BYTES, CHAT_MAX_IMAGES } from '@marxmatrix/contracts';
import { DomainError } from '../common/domain-error.js';
import { IdentityModule } from '../identity/identity.module.js';
import { ChatController } from './chat.controller.js';
import { ChatImageStorageService } from './chat-image-storage.service.js';
import {
  CHAT_PROVIDER,
  type ChatCandidate,
  type ChatProvider,
  type ChatScopeDecision
} from './chat-provider.js';
import { ChatRateLimiter } from './chat-rate-limiter.js';
import { ChatRunRegistry } from './chat-run-registry.js';
import { ChatScopePolicy } from './chat-scope-policy.js';
import { ChatService } from './chat.service.js';
import { GeminiChatProvider } from './gemini-chat.provider.js';
import {
  ChatAttachmentRecord,
  ChatAttachmentRecordSchema
} from './schemas/chat-attachment.schema.js';
import {
  ChatConversationRecord,
  ChatConversationRecordSchema
} from './schemas/chat-conversation.schema.js';
import { ChatMessageRecord, ChatMessageRecordSchema } from './schemas/chat-message.schema.js';

const CHAT_LOGGER = Symbol('CHAT_LOGGER');

class UnavailableChatProvider implements ChatProvider {
  public classify(): Promise<ChatScopeDecision> {
    return Promise.reject(unavailable());
  }

  public generate(): Promise<ChatCandidate> {
    return Promise.reject(unavailable());
  }

  public validateOutput(): Promise<boolean> {
    return Promise.reject(unavailable());
  }
}

@Module({
  imports: [
    IdentityModule,
    MongooseModule.forFeature([
      { name: ChatConversationRecord.name, schema: ChatConversationRecordSchema },
      { name: ChatMessageRecord.name, schema: ChatMessageRecordSchema },
      { name: ChatAttachmentRecord.name, schema: ChatAttachmentRecordSchema }
    ]),
    MulterModule.register({
      limits: { files: CHAT_MAX_IMAGES, fileSize: CHAT_MAX_IMAGE_BYTES }
    })
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatImageStorageService,
    ChatScopePolicy,
    ChatRunRegistry,
    ChatRateLimiter,
    {
      provide: CHAT_LOGGER,
      useFactory: (): Logger => new Logger(GeminiChatProvider.name)
    },
    {
      provide: CHAT_PROVIDER,
      inject: [ConfigService, CHAT_LOGGER],
      useFactory: (config: ConfigService, logger: Logger): ChatProvider => {
        const enabled = config.getOrThrow<boolean>('CHAT_ENABLED');
        const apiKey = config.get<string>('GEMINI_API_KEY')?.trim();
        const model = config.get<string>('GEMINI_CHAT_MODEL')?.trim();
        if (
          !enabled ||
          apiKey === undefined ||
          apiKey.length === 0 ||
          model === undefined ||
          model.length === 0
        )
          return new UnavailableChatProvider();
        return new GeminiChatProvider({
          apiKey,
          model,
          timeoutMs: config.getOrThrow<number>('CHAT_AI_TIMEOUT_MS'),
          maxRetries: config.getOrThrow<number>('CHAT_AI_MAX_RETRIES'),
          log: (record) => logger.log(record)
        });
      }
    }
  ]
})
export class ChatModule {}

function unavailable(): DomainError {
  return new DomainError('CHAT_AI_UNAVAILABLE', 'Chat AI is not configured.', 503);
}
