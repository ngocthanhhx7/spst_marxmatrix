import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import {
  CHAT_MAX_IMAGES,
  chatConversationListSchema,
  chatCursorQuerySchema,
  type ChatConversationDetail,
  type ChatConversationSummary,
  type ChatMessage
} from '@marxmatrix/contracts';
import { Model, Types } from 'mongoose';
import type { z } from 'zod';
import { DomainError } from '../common/domain-error.js';
import { decodeChatCursor, encodeChatCursor } from './chat-cursor.js';
import { ChatImageStorageService } from './chat-image-storage.service.js';
import type { ChatImagePart, ChatModelInput } from './chat-provider.js';
import { ChatAttachmentRecord } from './schemas/chat-attachment.schema.js';
import { ChatConversationRecord } from './schemas/chat-conversation.schema.js';
import { ChatMessageRecord } from './schemas/chat-message.schema.js';

export type ChatCursorQuery = z.infer<typeof chatCursorQuerySchema>;
export type ChatConversationList = z.infer<typeof chatConversationListSchema>;

type ConversationView = ChatConversationRecord & { _id: Types.ObjectId };
type MessageView = ChatMessageRecord & { _id: Types.ObjectId };
type AttachmentView = ChatAttachmentRecord & { _id: Types.ObjectId };

const defaultTitle = 'Cuộc trò chuyện mới';

@Injectable()
export class ChatService {
  public constructor(
    @InjectModel(ChatConversationRecord.name)
    private readonly conversations: Model<ChatConversationRecord>,
    @InjectModel(ChatMessageRecord.name) private readonly messages: Model<ChatMessageRecord>,
    @InjectModel(ChatAttachmentRecord.name)
    private readonly attachments: Model<ChatAttachmentRecord>,
    private readonly storage: ChatImageStorageService,
    private readonly config: ConfigService
  ) {}

  public async create(ownerId: string): Promise<ChatConversationSummary> {
    const conversation = await this.conversations.create({
      ownerId: this.objectId(ownerId),
      title: defaultTitle,
      activeRunId: null,
      activeRunStartedAt: null,
      deletionState: 'active',
      deletedAt: null
    });
    return this.summary(conversation);
  }

  public async list(ownerId: string, query: ChatCursorQuery): Promise<ChatConversationList> {
    const ownerObjectId = this.objectId(ownerId);
    const filter: Record<string, unknown> = {
      ownerId: ownerObjectId,
      deletionState: 'active'
    };
    if (query.cursor !== undefined) {
      const cursor = decodeChatCursor(query.cursor);
      const timestamp = new Date(cursor.timestamp);
      const id = new Types.ObjectId(cursor.id);
      filter['$or'] = [
        { updatedAt: { $lt: timestamp } },
        { updatedAt: timestamp, _id: { $lt: id } }
      ];
    }
    const found = (await this.conversations
      .find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(query.limit + 1)
      .lean()
      .exec()) as unknown as ConversationView[];
    const hasMore = found.length > query.limit;
    const page = found.slice(0, query.limit);
    const last = page.at(-1);
    return {
      conversations: page.map((conversation) => this.summary(conversation)),
      nextCursor:
        hasMore && last !== undefined
          ? encodeChatCursor({ timestamp: this.iso(last.updatedAt), id: last._id.toString() })
          : null
    };
  }

  public async get(
    ownerId: string,
    conversationId: string,
    query: ChatCursorQuery
  ): Promise<ChatConversationDetail> {
    const ownerObjectId = this.objectId(ownerId);
    const conversationObjectId = this.objectId(conversationId);
    const conversation = await this.activeConversation(ownerObjectId, conversationObjectId);
    const filter: Record<string, unknown> = {
      ownerId: ownerObjectId,
      conversationId: conversationObjectId
    };
    if (query.cursor !== undefined) {
      const cursor = decodeChatCursor(query.cursor);
      const timestamp = new Date(cursor.timestamp);
      const id = new Types.ObjectId(cursor.id);
      filter['$or'] = [
        { createdAt: { $gt: timestamp } },
        { createdAt: timestamp, _id: { $gt: id } }
      ];
    }
    const found = (await this.messages
      .find(filter)
      .sort({ createdAt: 1, _id: 1 })
      .limit(query.limit + 1)
      .lean()
      .exec()) as unknown as MessageView[];
    const hasMore = found.length > query.limit;
    const page = found.slice(0, query.limit);
    const attachmentRows =
      page.length === 0
        ? []
        : ((await this.attachments
            .find({
              ownerId: ownerObjectId,
              conversationId: conversationObjectId,
              messageId: { $in: page.map(({ _id }) => _id) }
            })
            .lean()
            .exec()) as unknown as AttachmentView[]);
    const attachmentById = new Map(
      attachmentRows.map((attachment) => [attachment._id.toString(), attachment])
    );
    const last = page.at(-1);
    return {
      ...this.summary(conversation),
      messages: page.map((message) => this.publicMessage(message, attachmentById)),
      nextCursor:
        hasMore && last !== undefined
          ? encodeChatCursor({ timestamp: this.iso(last.createdAt), id: last._id.toString() })
          : null
    };
  }

  public async delete(ownerId: string, conversationId: string): Promise<void> {
    const ownerObjectId = this.objectId(ownerId);
    const conversationObjectId = this.objectId(conversationId);
    const tombstoned = (await this.conversations
      .findOneAndUpdate(
        {
          _id: conversationObjectId,
          ownerId: ownerObjectId,
          deletionState: 'active'
        },
        {
          $set: {
            deletionState: 'deleted',
            deletedAt: new Date(),
            activeRunId: null,
            activeRunStartedAt: null
          }
        },
        { returnDocument: 'after' }
      )
      .select('+deletionState')
      .lean()
      .exec()) as unknown as ConversationView | null;
    if (tombstoned === null) {
      const existingTombstone = (await this.conversations
        .findOne({
          _id: conversationObjectId,
          ownerId: ownerObjectId,
          deletionState: 'deleted'
        })
        .select('+deletionState')
        .lean()
        .exec()) as unknown as ConversationView | null;
      if (existingTombstone === null) this.notFound();
    }
    const owned = { ownerId: ownerObjectId, conversationId: conversationObjectId };
    const storedAttachments = (await this.attachments
      .find(owned)
      .select('+gridFsFileId')
      .lean()
      .exec()) as unknown as AttachmentView[];
    for (const attachment of storedAttachments) await this.storage.remove(attachment.gridFsFileId);
    await this.attachments.deleteMany(owned);
    await this.messages.deleteMany(owned);
  }

  public async context(
    ownerId: string,
    conversationId: string,
    currentMessageId: string
  ): Promise<ChatModelInput> {
    const ownerObjectId = this.objectId(ownerId);
    const conversationObjectId = this.objectId(conversationId);
    const currentObjectId = this.objectId(currentMessageId);
    await this.activeConversation(ownerObjectId, conversationObjectId);
    const current = (await this.messages
      .findOne({
        _id: currentObjectId,
        ownerId: ownerObjectId,
        conversationId: conversationObjectId
      })
      .lean()
      .exec()) as unknown as MessageView | null;
    if (current === null) this.notFound();

    const currentImages = await this.imagesFor(
      ownerObjectId,
      conversationObjectId,
      current,
      CHAT_MAX_IMAGES,
      Number.POSITIVE_INFINITY
    );
    let remainingImages = CHAT_MAX_IMAGES - currentImages.images.length;
    const maxMessages = this.config.getOrThrow<number>('CHAT_MAX_CONTEXT_MESSAGES');
    const maxBytes = this.config.getOrThrow<number>('CHAT_MAX_CONTEXT_BYTES');
    const candidates = (await this.messages
      .find({
        ownerId: ownerObjectId,
        conversationId: conversationObjectId,
        _id: { $ne: currentObjectId },
        status: 'completed'
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(maxMessages)
      .lean()
      .exec()) as unknown as MessageView[];

    let usedBytes = 0;
    const newestHistory: ChatModelInput['history'] = [];
    for (const candidate of candidates) {
      const textBytes = Buffer.byteLength(candidate.text, 'utf8');
      if (usedBytes + textBytes > maxBytes) break;
      usedBytes += textBytes;
      const loaded = await this.imagesFor(
        ownerObjectId,
        conversationObjectId,
        candidate,
        remainingImages,
        maxBytes - usedBytes
      );
      usedBytes += loaded.byteSize;
      remainingImages -= loaded.images.length;
      newestHistory.push({ role: candidate.role, text: candidate.text, images: loaded.images });
    }
    return {
      text: current.text,
      images: currentImages.images,
      history: newestHistory.reverse()
    };
  }

  private async activeConversation(
    ownerId: Types.ObjectId,
    conversationId: Types.ObjectId
  ): Promise<ConversationView> {
    const conversation = (await this.conversations
      .findOne({ _id: conversationId, ownerId, deletionState: 'active' })
      .lean()
      .exec()) as unknown as ConversationView | null;
    if (conversation === null) this.notFound();
    return conversation;
  }

  private async imagesFor(
    ownerId: Types.ObjectId,
    conversationId: Types.ObjectId,
    message: MessageView,
    imageLimit: number,
    byteLimit: number
  ): Promise<{ images: ChatImagePart[]; byteSize: number }> {
    if (imageLimit <= 0 || message.attachmentIds.length === 0)
      return { images: [], byteSize: 0 };
    const rows = (await this.attachments
      .find({
        _id: { $in: message.attachmentIds },
        ownerId,
        conversationId,
        messageId: message._id
      })
      .select('+gridFsFileId')
      .lean()
      .exec()) as unknown as AttachmentView[];
    const byId = new Map(rows.map((attachment) => [attachment._id.toString(), attachment]));
    const images: ChatImagePart[] = [];
    let byteSize = 0;
    for (const attachmentId of message.attachmentIds) {
      if (images.length >= imageLimit) break;
      const attachment = byId.get(attachmentId.toString());
      if (attachment === undefined || byteSize + attachment.byteSize > byteLimit) break;
      const bytes = await this.storage.read(attachment.gridFsFileId);
      if (byteSize + bytes.length > byteLimit) break;
      images.push({ mimeType: attachment.mimeType, bytes });
      byteSize += bytes.length;
    }
    return { images, byteSize };
  }

  private publicMessage(
    message: MessageView,
    attachmentById: ReadonlyMap<string, AttachmentView>
  ): ChatMessage {
    return {
      id: message._id.toString(),
      conversationId: message.conversationId.toString(),
      role: message.role,
      text: message.text,
      attachments: message.attachmentIds.flatMap((id) => {
        const attachment = attachmentById.get(id.toString());
        return attachment === undefined
          ? []
          : [
              {
                id: attachment._id.toString(),
                originalFileName: attachment.originalFileName,
                mimeType: attachment.mimeType,
                byteSize: attachment.byteSize
              }
            ];
      }),
      status: message.status,
      scope: message.scope,
      reasonCode: message.reasonCode,
      replyToMessageId: message.replyToMessageId?.toString() ?? null,
      createdAt: this.iso(message.createdAt)
    };
  }

  private summary(conversation: ConversationView): ChatConversationSummary {
    return {
      id: conversation._id.toString(),
      title: conversation.title,
      createdAt: this.iso(conversation.createdAt),
      updatedAt: this.iso(conversation.updatedAt)
    };
  }

  private objectId(value: string): Types.ObjectId {
    if (!/^[a-f\d]{24}$/i.test(value)) this.notFound();
    return new Types.ObjectId(value);
  }

  private iso(value: Date): string {
    return value.toISOString();
  }

  private notFound(): never {
    throw new DomainError(
      'CHAT_CONVERSATION_NOT_FOUND',
      'Chat conversation was not found.',
      404
    );
  }
}

export function titleFrom(text: string, hasImages: boolean): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 0
    ? normalized.slice(0, 80)
    : hasImages
      ? 'Cuộc trò chuyện có hình ảnh'
      : defaultTitle;
}
