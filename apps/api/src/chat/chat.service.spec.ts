import type { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { decodeChatCursor } from './chat-cursor.js';
import { ChatRunRegistry } from './chat-run-registry.js';
import type { ChatScopePolicy } from './chat-scope-policy.js';
import { ChatService, titleFrom } from './chat.service.js';

type Row = Record<string, unknown> & { _id: Types.ObjectId };

const ownerId = oid(100);
const otherOwnerId = oid(200);
const conversationId = oid(300);

function oid(value: number): string {
  return value.toString(16).padStart(24, '0');
}

function objectId(value: number): Types.ObjectId {
  return new Types.ObjectId(oid(value));
}

function comparable(value: unknown): string | number | null | undefined {
  if (value instanceof Date) return value.getTime();
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (typeof value === 'string' || typeof value === 'number' || value == null) return value;
  return JSON.stringify(value);
}

function equal(left: unknown, right: unknown): boolean {
  return comparable(left) === comparable(right);
}

function matches(row: Row, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$or')
      return (condition as Record<string, unknown>[]).some((branch) => matches(row, branch));
    const actual = row[key];
    if (
      typeof condition === 'object' &&
      condition !== null &&
      !(condition instanceof Date) &&
      !(condition instanceof Types.ObjectId)
    ) {
      const operators = condition as Record<string, unknown>;
      return Object.entries(operators).every(([operator, expected]) => {
        if (operator === '$lt') return comparable(actual)! < comparable(expected)!;
        if (operator === '$lte') return comparable(actual)! <= comparable(expected)!;
        if (operator === '$gt') return comparable(actual)! > comparable(expected)!;
        if (operator === '$ne') return !equal(actual, expected);
        if (operator === '$in')
          return (expected as unknown[]).some((candidate) => equal(actual, candidate));
        throw new Error(`Unsupported fixture operator: ${operator}`);
      });
    }
    return equal(actual, condition);
  });
}

class Query<T extends Row> {
  private sortValue: Record<string, 1 | -1> | undefined;
  private limitValue: number | undefined;

  public constructor(
    private readonly load: () => T | T[] | null,
    private readonly selections: string[]
  ) {}

  public sort(value: Record<string, 1 | -1>): this {
    this.sortValue = value;
    return this;
  }

  public limit(value: number): this {
    this.limitValue = value;
    return this;
  }

  public select(value: string): this {
    this.selections.push(value);
    return this;
  }

  public lean(): this {
    return this;
  }

  public exec(): Promise<T | T[] | null> {
    const loaded = this.load();
    if (!Array.isArray(loaded)) return Promise.resolve(loaded);
    const rows = [...loaded];
    if (this.sortValue !== undefined) {
      const entries = Object.entries(this.sortValue);
      rows.sort((left, right) => {
        for (const [field, direction] of entries) {
          const leftValue = comparable(left[field]);
          const rightValue = comparable(right[field]);
          if (leftValue! < rightValue!) return -direction;
          if (leftValue! > rightValue!) return direction;
        }
        return 0;
      });
    }
    return Promise.resolve(this.limitValue === undefined ? rows : rows.slice(0, this.limitValue));
  }
}

class FixtureModel<T extends Row> {
  public readonly selections: string[] = [];
  public readonly calls: Array<{ method: string; filter?: Record<string, unknown> }> = [];

  public constructor(public readonly rows: T[]) {}

  public create = vi.fn((input: Record<string, unknown>): Promise<T> => {
    const now = new Date('2026-07-21T01:00:00.000Z');
    const created = {
      _id: objectId(999),
      createdAt: now,
      updatedAt: now,
      ...input
    } as unknown as T;
    this.rows.push(created);
    return Promise.resolve(created);
  });

  public find = vi.fn((filter: Record<string, unknown>) => {
    this.calls.push({ method: 'find', filter });
    return new Query(() => this.rows.filter((row) => matches(row, filter)), this.selections);
  });

  public findOne = vi.fn((filter: Record<string, unknown>) => {
    this.calls.push({ method: 'findOne', filter });
    return new Query(() => this.rows.find((row) => matches(row, filter)) ?? null, this.selections);
  });

  public findOneAndUpdate = vi.fn(
    (
      filter: Record<string, unknown>,
      update: { $set: Record<string, unknown> },
      options?: { returnDocument?: 'before' | 'after' }
    ) => {
      this.calls.push({ method: 'findOneAndUpdate', filter });
      return new Query(() => {
        const row = this.rows.find((candidate) => matches(candidate, filter));
        if (row === undefined) return null;
        const before = { ...row };
        Object.assign(row, update.$set);
        return options?.returnDocument === 'before' ? before : row;
      }, this.selections);
    }
  );

  public deleteMany = vi.fn((filter: Record<string, unknown>) => {
    this.calls.push({ method: 'deleteMany', filter });
    const retained = this.rows.filter((row) => !matches(row, filter));
    const deletedCount = this.rows.length - retained.length;
    this.rows.splice(0, this.rows.length, ...retained);
    return Promise.resolve({ deletedCount });
  });
}

function conversation(
  id: number,
  owner = ownerId,
  updatedAt = new Date('2026-07-21T02:00:00.000Z'),
  deletionState: 'active' | 'deleted' = 'active'
): Row & { activeRunId: string | null; activeRunStartedAt: Date | null } {
  return {
    _id: objectId(id),
    ownerId: new Types.ObjectId(owner),
    title: `Conversation ${id}`,
    activeRunId: 'private-run',
    activeRunStartedAt: new Date(),
    deletionState,
    deletedAt: deletionState === 'deleted' ? new Date() : null,
    createdAt: new Date('2026-07-20T02:00:00.000Z'),
    updatedAt
  };
}

function message(
  id: number,
  options: Partial<{
    ownerId: string;
    conversationId: string;
    role: 'user' | 'assistant';
    text: string;
    status: 'pending' | 'completed' | 'refused' | 'failed' | 'cancelled';
    attachmentIds: Types.ObjectId[];
    createdAt: Date;
  }> = {}
) {
  return {
    _id: objectId(id),
    ownerId: new Types.ObjectId(options.ownerId ?? ownerId),
    conversationId: new Types.ObjectId(options.conversationId ?? conversationId),
    role: options.role ?? 'user',
    text: options.text ?? `message ${id}`,
    attachmentIds: options.attachmentIds ?? [],
    status: options.status ?? 'completed',
    scope: null,
    reasonCode: null,
    replyToMessageId: null,
    providerModel: 'private-model',
    promptVersion: 'private-prompt',
    usage: { totalTokens: 123 },
    createdAt: options.createdAt ?? new Date(`2026-07-21T03:00:${id % 60}.000Z`),
    updatedAt: new Date()
  };
}

function attachment(
  id: number,
  messageId: number,
  options: Partial<{ ownerId: string; conversationId: string; bytes: Buffer }> = {}
) {
  const bytes = options.bytes ?? Buffer.from(`image-${id}`);
  return {
    _id: objectId(id),
    ownerId: new Types.ObjectId(options.ownerId ?? ownerId),
    conversationId: new Types.ObjectId(options.conversationId ?? conversationId),
    messageId: objectId(messageId),
    gridFsFileId: objectId(id + 10_000),
    originalFileName: `image-${id}.png`,
    mimeType: 'image/png' as const,
    byteSize: bytes.length,
    checksum: 'a'.repeat(64),
    createdAt: new Date(),
    updatedAt: new Date(),
    bytes
  };
}

function fixture(input?: {
  conversations?: ReturnType<typeof conversation>[];
  messages?: ReturnType<typeof message>[];
  attachments?: ReturnType<typeof attachment>[];
  maxMessages?: number;
  maxBytes?: number;
  policy?: Partial<ChatScopePolicy>;
}) {
  const conversations = new FixtureModel(input?.conversations ?? [conversation(300)]);
  const messages = new FixtureModel(input?.messages ?? []);
  const attachments = new FixtureModel(input?.attachments ?? []);
  const events: string[] = [];
  const buffers = new Map(
    attachments.rows.map((item) => [item.gridFsFileId.toHexString(), item.bytes])
  );
  const storage = {
    store: vi.fn((input: { buffer: Buffer }) => {
      const id = objectId(9_000 + buffers.size);
      buffers.set(id.toHexString(), input.buffer);
      return Promise.resolve({ id });
    }),
    read: vi.fn((id: Types.ObjectId) =>
      Promise.resolve(buffers.get(id.toHexString()) ?? Buffer.alloc(0))
    ),
    remove: vi.fn((id: Types.ObjectId) => {
      events.push(`remove:${id.toHexString()}`);
      return Promise.resolve();
    })
  };
  const originalAttachmentDelete = attachments.deleteMany;
  attachments.deleteMany = vi.fn(async (filter: Record<string, unknown>) => {
    events.push('delete:attachments');
    return originalAttachmentDelete(filter);
  });
  const originalMessageDelete = messages.deleteMany;
  messages.deleteMany = vi.fn(async (filter: Record<string, unknown>) => {
    events.push('delete:messages');
    return originalMessageDelete(filter);
  });
  const config = {
    getOrThrow: vi.fn((key: string) => {
      if (key === 'CHAT_MAX_CONTEXT_MESSAGES') return input?.maxMessages ?? 20;
      if (key === 'CHAT_MAX_CONTEXT_BYTES') return input?.maxBytes ?? 100_000;
      if (key === 'CHAT_MAX_RUN_AGE_MS') return 180_000;
      if (key === 'CHAT_RATE_LIMIT_PER_MINUTE') return 10;
      throw new Error(`Unexpected config key: ${key}`);
    })
  } as unknown as ConfigService;
  const runs = new ChatRunRegistry();
  const service = new ChatService(
    conversations as never,
    messages as never,
    attachments as never,
    storage as never,
    config,
    input?.policy as ChatScopePolicy | undefined,
    runs
  );
  return { service, conversations, messages, attachments, storage, events, runs };
}

describe('titleFrom', () => {
  it('normalizes Unicode whitespace and truncates to exactly 80 characters', () => {
    const text = `  Giáo\n\tdục   ${'ộ'.repeat(100)}  `;
    const result = titleFrom(text, false);

    expect(result).toHaveLength(80);
    expect(result.startsWith('Giáo dục ộ')).toBe(true);
    expect(result).not.toMatch(/\s{2,}/);
  });

  it('uses exact image and empty fallbacks', () => {
    expect(titleFrom(' \n ', true)).toBe('Cuộc trò chuyện có hình ảnh');
    expect(titleFrom('', false)).toBe('Cuộc trò chuyện mới');
  });
});

describe('ChatService CRUD and public mapping', () => {
  it('creates an active owner-scoped conversation with the exact default title', async () => {
    const { service, conversations } = fixture({ conversations: [] });

    await expect(service.create(ownerId)).resolves.toEqual({
      id: oid(999),
      title: 'Cuộc trò chuyện mới',
      createdAt: '2026-07-21T01:00:00.000Z',
      updatedAt: '2026-07-21T01:00:00.000Z'
    });
    expect(conversations.create).toHaveBeenCalledWith({
      ownerId: new Types.ObjectId(ownerId),
      title: 'Cuộc trò chuyện mới',
      activeRunId: null,
      activeRunStartedAt: null,
      deletionState: 'active',
      deletedAt: null
    });
  });

  it('lists only active owner records and exposes no private fields', async () => {
    const { service, conversations } = fixture({
      conversations: [
        conversation(301),
        conversation(302, otherOwnerId),
        conversation(303, ownerId, new Date(), 'deleted')
      ]
    });

    const result = await service.list(ownerId, { limit: 20 });

    expect(result).toEqual({
      conversations: [
        {
          id: oid(301),
          title: 'Conversation 301',
          createdAt: '2026-07-20T02:00:00.000Z',
          updatedAt: '2026-07-21T02:00:00.000Z'
        }
      ],
      nextCursor: null
    });
    expect(conversations.find).toHaveBeenCalledWith({
      ownerId: new Types.ObjectId(ownerId),
      deletionState: 'active'
    });
  });

  it('paginates equal conversation timestamps without skips or duplicates', async () => {
    const timestamp = new Date('2026-07-21T06:00:00.000Z');
    const { service, conversations } = fixture({
      conversations: [
        conversation(1, ownerId, timestamp),
        conversation(2, ownerId, timestamp),
        conversation(3, ownerId, timestamp)
      ]
    });

    const first = await service.list(ownerId, { limit: 2 });
    const second = await service.list(ownerId, { limit: 2, cursor: first.nextCursor! });

    expect(first.conversations.map(({ id }) => id)).toEqual([oid(3), oid(2)]);
    expect(decodeChatCursor(first.nextCursor!)).toEqual({
      timestamp: timestamp.toISOString(),
      id: oid(2)
    });
    expect(second.conversations.map(({ id }) => id)).toEqual([oid(1)]);
    expect(conversations.find.mock.calls[1]?.[0]).toMatchObject({
      ownerId: new Types.ObjectId(ownerId),
      deletionState: 'active',
      $or: [{ updatedAt: { $lt: timestamp } }, { updatedAt: timestamp, _id: { $lt: objectId(2) } }]
    });
  });

  it('opens messages chronologically with attachment display metadata only', async () => {
    const firstAttachment = attachment(501, 401);
    const { service, attachments } = fixture({
      messages: [
        message(402, { role: 'assistant', createdAt: new Date('2026-07-21T03:00:02.000Z') }),
        message(401, {
          attachmentIds: [firstAttachment._id],
          createdAt: new Date('2026-07-21T03:00:01.000Z')
        }),
        message(403, { ownerId: otherOwnerId })
      ],
      attachments: [firstAttachment, attachment(502, 403, { ownerId: otherOwnerId })]
    });

    const result = await service.get(ownerId, conversationId, { limit: 20 });

    expect(result.messages.map(({ id }) => id)).toEqual([oid(401), oid(402)]);
    expect(result.messages[0]).toEqual({
      id: oid(401),
      conversationId,
      role: 'user',
      text: 'message 401',
      attachments: [
        {
          id: oid(501),
          originalFileName: 'image-501.png',
          mimeType: 'image/png',
          byteSize: firstAttachment.byteSize
        }
      ],
      status: 'completed',
      scope: null,
      reasonCode: null,
      replyToMessageId: null,
      createdAt: '2026-07-21T03:00:01.000Z'
    });
    expect(attachments.find).toHaveBeenCalledWith({
      ownerId: new Types.ObjectId(ownerId),
      conversationId: new Types.ObjectId(conversationId),
      messageId: { $in: [objectId(401), objectId(402)] }
    });
    expect(JSON.stringify(result)).not.toContain('gridFsFileId');
    expect(JSON.stringify(result)).not.toContain('private-model');
  });

  it('paginates equal message timestamps with a strict ascending id tie-break', async () => {
    const timestamp = new Date('2026-07-21T07:00:00.000Z');
    const { service, messages } = fixture({
      messages: [
        message(11, { createdAt: timestamp }),
        message(12, { createdAt: timestamp }),
        message(13, { createdAt: timestamp })
      ]
    });

    const first = await service.get(ownerId, conversationId, { limit: 2 });
    const second = await service.get(ownerId, conversationId, {
      limit: 2,
      cursor: first.nextCursor!
    });

    expect(first.messages.map(({ id }) => id)).toEqual([oid(11), oid(12)]);
    expect(decodeChatCursor(first.nextCursor!)).toEqual({
      timestamp: timestamp.toISOString(),
      id: oid(12)
    });
    expect(second.messages.map(({ id }) => id)).toEqual([oid(13)]);
    expect(messages.find.mock.calls[1]?.[0]).toMatchObject({
      ownerId: new Types.ObjectId(ownerId),
      conversationId: new Types.ObjectId(conversationId),
      $or: [{ createdAt: { $gt: timestamp } }, { createdAt: timestamp, _id: { $gt: objectId(12) } }]
    });
  });

  it.each([
    ['cross-owner', otherOwnerId, conversationId],
    ['absent', ownerId, oid(777)],
    ['malformed', ownerId, 'not-an-object-id']
  ])('returns the same not-found boundary for %s get', async (_case, requester, id) => {
    const { service } = fixture();

    await expect(service.get(requester, id, { limit: 20 })).rejects.toMatchObject({
      code: 'CHAT_CONVERSATION_NOT_FOUND',
      message: 'Chat conversation was not found.',
      statusCode: 404
    });
  });

  it('hides an owned tombstone from get', async () => {
    const { service } = fixture({
      conversations: [conversation(300, ownerId, new Date(), 'deleted')]
    });

    await expect(service.get(ownerId, conversationId, { limit: 20 })).rejects.toMatchObject({
      code: 'CHAT_CONVERSATION_NOT_FOUND'
    });
  });
});

describe('ChatService delete', () => {
  it('tombstones first, cancels the durable run fence, removes bytes, then metadata', async () => {
    const image = attachment(601, 401);
    const { service, conversations, attachments, messages, events, runs } = fixture({
      messages: [message(401)],
      attachments: [image]
    });
    const cancel = vi.spyOn(runs, 'cancel');

    await service.delete(ownerId, conversationId);

    const deletionTime = conversations.findOneAndUpdate.mock.calls[0]?.[1].$set['deletedAt'];
    expect(deletionTime).toBeInstanceOf(Date);
    expect(conversations.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: new Types.ObjectId(conversationId),
        ownerId: new Types.ObjectId(ownerId),
        deletionState: 'active'
      },
      {
        $set: {
          deletionState: 'deleted',
          deletedAt: deletionTime,
          activeRunId: null,
          activeRunStartedAt: null
        }
      },
      expect.objectContaining({ returnDocument: 'before' })
    );
    expect(events).toEqual([
      `remove:${image.gridFsFileId.toHexString()}`,
      'delete:attachments',
      'delete:messages'
    ]);
    expect(attachments.selections).toContain('+gridFsFileId');
    expect(attachments.deleteMany).toHaveBeenCalledWith({
      ownerId: new Types.ObjectId(ownerId),
      conversationId: new Types.ObjectId(conversationId)
    });
    expect(messages.deleteMany).toHaveBeenCalledWith({
      ownerId: new Types.ObjectId(ownerId),
      conversationId: new Types.ObjectId(conversationId)
    });
    expect(cancel).toHaveBeenCalledWith(ownerId, 'private-run');
    expect(conversations.rows).toHaveLength(1);
    expect(conversations.rows[0]?.['deletionState']).toBe('deleted');
  });

  it('retries owned tombstone cleanup idempotently', async () => {
    const image = attachment(602, 401);
    const { service, storage } = fixture({
      conversations: [conversation(300, ownerId, new Date(), 'deleted')],
      messages: [message(401)],
      attachments: [image]
    });

    await expect(service.delete(ownerId, conversationId)).resolves.toBeUndefined();

    expect(storage.remove).toHaveBeenCalledWith(image.gridFsFileId);
  });

  it('never cleans up a cross-owner or absent conversation', async () => {
    const foreignImage = attachment(603, 401);
    const { service, storage, attachments, messages } = fixture({
      attachments: [foreignImage]
    });

    await expect(service.delete(otherOwnerId, conversationId)).rejects.toMatchObject({
      code: 'CHAT_CONVERSATION_NOT_FOUND'
    });
    expect(storage.remove).not.toHaveBeenCalled();
    expect(attachments.deleteMany).not.toHaveBeenCalled();
    expect(messages.deleteMany).not.toHaveBeenCalled();
  });

  it('retains the tombstone and all metadata when byte cleanup fails, then retries', async () => {
    const image = attachment(604, 401);
    const state = fixture({ messages: [message(401)], attachments: [image] });
    state.storage.remove.mockRejectedValueOnce(new Error('GridFS unavailable'));

    await expect(state.service.delete(ownerId, conversationId)).rejects.toThrow(
      'GridFS unavailable'
    );
    expect(state.conversations.rows[0]?.['deletionState']).toBe('deleted');
    expect(state.attachments.rows).toHaveLength(1);
    expect(state.messages.rows).toHaveLength(1);

    await expect(state.service.delete(ownerId, conversationId)).resolves.toBeUndefined();
    expect(state.storage.remove).toHaveBeenCalledTimes(2);
    expect(state.attachments.rows).toHaveLength(0);
    expect(state.messages.rows).toHaveLength(0);
  });
});

describe('ChatService context selection', () => {
  it('requires an owned active conversation and owned current message', async () => {
    const { service } = fixture({ messages: [message(401, { ownerId: otherOwnerId })] });

    await expect(service.context(ownerId, conversationId, oid(401))).rejects.toMatchObject({
      code: 'CHAT_CONVERSATION_NOT_FOUND'
    });
    await expect(service.context(otherOwnerId, conversationId, oid(401))).rejects.toMatchObject({
      code: 'CHAT_CONVERSATION_NOT_FOUND'
    });
  });

  it('uses the current message as input and retains only newest completed history chronologically', async () => {
    const current = message(410, {
      text: 'current',
      status: 'pending',
      createdAt: new Date('2026-07-21T09:00:00.000Z')
    });
    const sameTime = new Date('2026-07-21T08:00:00.000Z');
    const { service, messages } = fixture({
      maxMessages: 3,
      messages: [
        message(401, { text: 'older', createdAt: new Date('2026-07-21T07:00:00.000Z') }),
        message(402, { text: 'same-low', createdAt: sameTime }),
        message(403, { text: 'same-high', createdAt: sameTime }),
        message(404, { text: 'failed', status: 'failed' }),
        message(405, { text: 'cancelled', status: 'cancelled' }),
        message(406, { text: 'refused', status: 'refused' }),
        message(407, { text: 'pending', status: 'pending' }),
        current
      ]
    });

    const result = await service.context(ownerId, conversationId, oid(410));

    expect(result).toEqual({
      text: 'current',
      images: [],
      history: [
        { role: 'user', text: 'older', images: [] },
        { role: 'user', text: 'same-low', images: [] },
        { role: 'user', text: 'same-high', images: [] }
      ]
    });
    expect(messages.find).toHaveBeenCalledWith({
      ownerId: new Types.ObjectId(ownerId),
      conversationId: new Types.ObjectId(conversationId),
      status: 'completed',
      $or: [
        { createdAt: { $lt: current.createdAt } },
        { createdAt: current.createdAt, _id: { $lt: current._id } }
      ]
    });
  });

  it('rejects an assistant current message and never includes future completed turns for regeneration', async () => {
    const currentTime = new Date('2026-07-21T11:00:00.000Z');
    const current = message(410, { text: 'retry this', createdAt: currentTime });
    const { service } = fixture({
      messages: [
        message(401, { text: 'past', createdAt: new Date('2026-07-21T10:00:00.000Z') }),
        current,
        message(411, { text: 'future', createdAt: new Date('2026-07-21T12:00:00.000Z') }),
        message(412, { role: 'assistant', text: 'assistant current', createdAt: currentTime })
      ]
    });

    await expect(service.context(ownerId, conversationId, oid(412))).rejects.toMatchObject({
      code: 'CHAT_CONVERSATION_NOT_FOUND'
    });
    await expect(service.context(ownerId, conversationId, oid(410))).resolves.toMatchObject({
      history: [{ text: 'past' }]
    });
  });

  it('counts UTF-8 bytes and keeps the newest fitting history prefix', async () => {
    const { service } = fixture({
      maxMessages: 10,
      maxBytes: 6,
      messages: [
        message(401, { text: 'old' }),
        message(402, { text: 'đ', createdAt: new Date('2026-07-21T09:00:00.000Z') }),
        message(403, { text: '🙂', createdAt: new Date('2026-07-21T10:00:00.000Z') }),
        message(410, {
          text: 'mandatory current',
          status: 'pending',
          createdAt: new Date('2026-07-21T11:00:00.000Z')
        })
      ]
    });

    const result = await service.context(ownerId, conversationId, oid(410));

    expect(result.history.map(({ text }) => text)).toEqual(['đ', '🙂']);
    expect(Buffer.byteLength(result.history.map(({ text }) => text).join(''), 'utf8')).toBe(6);
    expect(result.text).toBe('mandatory current');
  });

  it('prioritizes current images and fills the four-image cap from newest retained turns', async () => {
    const currentAttachments = [attachment(701, 410), attachment(702, 410)];
    const newestAttachments = [attachment(703, 403), attachment(704, 403), attachment(705, 403)];
    const olderAttachment = attachment(706, 402);
    const { service, storage, attachments } = fixture({
      messages: [
        message(402, { text: 'older', attachmentIds: [olderAttachment._id] }),
        message(403, {
          text: 'newest',
          attachmentIds: newestAttachments.map(({ _id }) => _id),
          createdAt: new Date('2026-07-21T10:00:00.000Z')
        }),
        message(410, {
          text: 'current',
          status: 'pending',
          attachmentIds: currentAttachments.map(({ _id }) => _id),
          createdAt: new Date('2026-07-21T11:00:00.000Z')
        })
      ],
      attachments: [...currentAttachments, ...newestAttachments, olderAttachment]
    });

    const result = await service.context(ownerId, conversationId, oid(410));

    expect(result.images).toHaveLength(2);
    expect(result.history.flatMap(({ images }) => images)).toHaveLength(2);
    expect(result.history[0]?.images).toHaveLength(0);
    expect(result.history[1]?.images).toHaveLength(2);
    expect(storage.read).toHaveBeenCalledTimes(4);
    expect(
      attachments.selections.filter((selection) => selection === '+gridFsFileId').length
    ).toBeGreaterThanOrEqual(2);
    for (const call of attachments.find.mock.calls) {
      expect(call[0]).toMatchObject({
        ownerId: new Types.ObjectId(ownerId),
        conversationId: new Types.ObjectId(conversationId)
      });
    }
  });

  it('does not query images for turns excluded by the text byte budget', async () => {
    const excluded = attachment(707, 401);
    const retained = attachment(708, 402);
    const { service, attachments, storage } = fixture({
      maxBytes: 3,
      messages: [
        message(401, { text: 'old', attachmentIds: [excluded._id] }),
        message(402, {
          text: 'new',
          attachmentIds: [retained._id],
          createdAt: new Date('2026-07-21T10:00:00.000Z')
        }),
        message(410, {
          text: 'current',
          status: 'pending',
          createdAt: new Date('2026-07-21T11:00:00.000Z')
        })
      ],
      attachments: [excluded, retained]
    });

    await service.context(ownerId, conversationId, oid(410));

    expect(storage.read).not.toHaveBeenCalled();
    expect(
      attachments.find.mock.calls.some(([filter]) => equal(filter['messageId'], excluded.messageId))
    ).toBe(false);
  });
});

describe('ChatService answer orchestration', () => {
  it('persists one user and assistant attempt, emits terminal progress, and clears its exact run fence', async () => {
    const policy = {
      answer: vi.fn().mockResolvedValue({
        status: 'completed',
        text: 'Lãi kép là lãi tính trên cả gốc và lãi tích lũy.',
        scope: 'finance',
        candidate: {
          model: 'test-model',
          promptVersion: 'v1',
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
        }
      })
    } as unknown as ChatScopePolicy;
    const state = fixture({ policy });
    state.conversations.rows[0]!.activeRunId = null;
    state.conversations.rows[0]!.activeRunStartedAt = null;
    const events: string[] = [];

    const result = await state.service.send(
      ownerId,
      conversationId,
      { text: 'Giải thích lãi kép', files: [] },
      (event) => events.push(event.type)
    );

    expect(events).toEqual(['checking_scope', 'generating', 'final']);
    expect(result.message).toMatchObject({ status: 'completed', scope: 'finance' });
    expect(state.conversations.rows[0]!.activeRunId).toBeNull();
    expect(state.messages.rows.filter(({ role }) => role === 'user')).toHaveLength(1);
    expect(state.messages.rows.filter(({ role }) => role === 'assistant')).toHaveLength(1);
  });

  it('does not create a second user or image bytes when regenerating an owned user message', async () => {
    const policy = {
      answer: vi.fn().mockResolvedValue({
        status: 'refused',
        text: 'Bạn muốn hỏi nội dung giáo dục hay tài chính cụ thể nào?',
        scope: 'ambiguous',
        reasonCode: 'scope_ambiguous'
      })
    } as unknown as ChatScopePolicy;
    const image = attachment(501, 401);
    const original = message(401, { text: 'Đọc biểu đồ này', attachmentIds: [image._id] });
    const state = fixture({ messages: [original], attachments: [image], policy });
    state.conversations.rows[0]!.activeRunId = null;
    state.conversations.rows[0]!.activeRunStartedAt = null;

    await state.service.regenerate(ownerId, conversationId, oid(401), vi.fn());

    expect(state.messages.rows.filter(({ role }) => role === 'user')).toHaveLength(1);
    expect(state.storage.remove).not.toHaveBeenCalled();
    expect(state.storage.read).toHaveBeenCalled();
  });

  it('retains durable image bytes and marks the assistant attempt failed when generation fails', async () => {
    const policy = {
      answer: vi.fn().mockRejectedValue(new Error('provider detail'))
    } as unknown as ChatScopePolicy;
    const state = fixture({ policy });
    state.conversations.rows[0]!.activeRunId = null;
    state.conversations.rows[0]!.activeRunStartedAt = null;
    const file = {
      buffer: Buffer.from('image'),
      originalFileName: 'chart.png',
      mimeType: 'image/png' as const,
      byteSize: 5,
      checksum: 'a'.repeat(64)
    };

    await expect(
      state.service.send(ownerId, conversationId, { text: 'Đọc biểu đồ', files: [file] }, vi.fn())
    ).rejects.toThrow('provider detail');

    expect(state.storage.remove).not.toHaveBeenCalled();
    expect(state.messages.rows.find(({ role }) => role === 'assistant')?.status).toBe('failed');
    expect(state.attachments.rows).toHaveLength(1);
  });

  it('rejects a live run, reclaims a stale run, and aborts only the exact owner run on cancellation', async () => {
    let rejectAnswer: ((reason: unknown) => void) | undefined;
    const policy = {
      answer: vi.fn(
        (_input: unknown, signal?: AbortSignal) =>
          new Promise((_, reject) => {
            rejectAnswer = reject;
            signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          })
      )
    } as unknown as ChatScopePolicy;
    const state = fixture({ policy });
    const staleController = state.runs.register(ownerId, 'private-run');

    await expect(
      state.service.send(ownerId, conversationId, { text: 'x', files: [] }, vi.fn())
    ).rejects.toMatchObject({ code: 'CHAT_RUN_ACTIVE' });
    expect(staleController.signal.aborted).toBe(false);
    state.conversations.rows[0]!.activeRunStartedAt = new Date(0);
    const events: Array<{ runId: string }> = [];
    const pending = state.service.send(
      ownerId,
      conversationId,
      { text: 'x', files: [] },
      (event) => {
        if ('runId' in event) events.push(event);
      }
    );
    await vi.waitFor(() => expect(staleController.signal.aborted).toBe(true));
    await vi.waitFor(() => expect(events[0]?.runId).toBeDefined());
    await state.service.cancel(ownerId, conversationId, events[0]!.runId);
    rejectAnswer?.(new Error('aborted'));
    await expect(pending).rejects.toThrow('aborted');
    expect(state.conversations.rows[0]!.activeRunId).toBeNull();
  });

  it('sets the title from only the first durable user message', async () => {
    const policy = {
      answer: vi.fn().mockResolvedValue({
        status: 'refused',
        text: 'Bạn muốn hỏi nội dung giáo dục hay tài chính cụ thể nào?',
        scope: 'ambiguous',
        reasonCode: 'scope_ambiguous'
      })
    } as unknown as ChatScopePolicy;
    const state = fixture({ policy });
    state.conversations.rows[0]!['title'] = 'Cuộc trò chuyện mới';
    state.conversations.rows[0]!.activeRunId = null;
    state.conversations.rows[0]!.activeRunStartedAt = null;

    await state.service.send(
      ownerId,
      conversationId,
      { text: 'Tiêu đề đầu tiên', files: [] },
      vi.fn()
    );
    await state.service.send(
      ownerId,
      conversationId,
      { text: 'Tiêu đề không được thay', files: [] },
      vi.fn()
    );

    expect(state.conversations.rows[0]?.['title']).toBe('Tiêu đề đầu tiên');

    const unchanged = fixture({ policy });
    unchanged.conversations.rows[0]!['title'] = 'Cuộc trò chuyện mới';
    unchanged.conversations.rows[0]!.activeRunId = null;
    unchanged.conversations.rows[0]!.activeRunStartedAt = null;
    await unchanged.service.send(
      ownerId,
      conversationId,
      { text: 'Cuộc trò chuyện mới', files: [] },
      vi.fn()
    );
    await unchanged.service.send(
      ownerId,
      conversationId,
      { text: 'Không được đổi tên', files: [] },
      vi.fn()
    );
    expect(unchanged.conversations.rows[0]?.['title']).toBe('Cuộc trò chuyện mới');
  });
});
