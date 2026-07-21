import type { AuthenticatedUser } from '../identity/authenticated-user.js';
import { DomainError } from '../common/domain-error.js';
import { describe, expect, it, vi } from 'vitest';
import { ChatController } from './chat.controller.js';
import type { ChatRateLimiter } from './chat-rate-limiter.js';
import type { ChatRunRegistry } from './chat-run-registry.js';
import type { ChatService } from './chat.service.js';

const user: AuthenticatedUser = {
  id: '507f1f77bcf86cd799439011',
  email: 'learner@example.com',
  role: 'student'
};
const conversationId = '507f1f77bcf86cd799439012';
const messageId = '507f1f77bcf86cd799439013';
const runId = '550e8400-e29b-41d4-a716-446655440000';
const assistantMessage = {
  id: '507f1f77bcf86cd799439014',
  conversationId,
  role: 'assistant' as const,
  text: 'Lãi kép là lãi phát sinh trên cả vốn và lãi đã tích lũy.',
  attachments: [],
  status: 'completed' as const,
  scope: 'finance' as const,
  reasonCode: null,
  replyToMessageId: messageId,
  createdAt: '2026-07-21T00:00:00.000Z'
};

function responseFixture() {
  const writes: string[] = [];
  let close: (() => void) | undefined;
  const response = {
    headersSent: false,
    writableEnded: false,
    status: vi.fn(function (this: { headersSent: boolean }) {
      return this;
    }),
    type: vi.fn(function (this: { headersSent: boolean }) {
      this.headersSent = true;
      return this;
    }),
    setHeader: vi.fn(),
    write: vi.fn((value: string) => {
      writes.push(value);
      return true;
    }),
    end: vi.fn(function (this: { writableEnded: boolean }) {
      this.writableEnded = true;
    }),
    once: vi.fn((event: string, callback: () => void) => {
      if (event === 'close') close = callback;
    })
  };
  return { response, writes, close: () => close?.() };
}

function requestFixture() {
  let close: (() => void) | undefined;
  return {
    request: {
      once: vi.fn((event: string, callback: () => void) => {
        if (event === 'close') close = callback;
      })
    },
    close: () => close?.()
  };
}

function fixture() {
  const service = {
    create: vi.fn<ChatService['create']>(),
    list: vi.fn<ChatService['list']>(),
    get: vi.fn<ChatService['get']>(),
    delete: vi.fn<ChatService['delete']>(),
    send: vi.fn<ChatService['send']>(),
    regenerate: vi.fn<ChatService['regenerate']>(),
    cancel: vi.fn<ChatService['cancel']>()
  };
  const limiter = { consume: vi.fn<ChatRateLimiter['consume']>() };
  const registry = { cancel: vi.fn<ChatRunRegistry['cancel']>() };
  const controller = new ChatController(service as never, limiter as never, registry as never);
  return { controller, service, limiter, registry };
}

describe('ChatController', () => {
  it('writes newline-delimited progress and exactly one terminal event', async () => {
    const { controller, service, limiter } = fixture();
    const { response, writes } = responseFixture();
    const { request } = requestFixture();
    service.send.mockImplementation((_owner, _id, _input, emit) => {
      emit({ type: 'checking_scope', runId });
      emit({ type: 'generating', runId });
      emit({ type: 'final', runId, message: assistantMessage });
      return Promise.resolve({ runId, message: assistantMessage });
    });

    await controller.send(
      user,
      conversationId,
      { text: 'Giải thích lãi kép' },
      [],
      response as never,
      request as never
    );

    expect(limiter.consume).toHaveBeenCalledWith(user.id);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.type).toHaveBeenCalledWith('application/x-ndjson');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-transform');
    expect(response.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(writes.map((line) => JSON.parse(line) as unknown)).toHaveLength(3);
    expect(writes.every((line) => line.endsWith('\n'))).toBe(true);
    expect(response.end).toHaveBeenCalledOnce();
  });

  it('does not start NDJSON when an operation is rejected before its first event', async () => {
    const { controller, service } = fixture();
    const { response } = responseFixture();
    const { request } = requestFixture();
    const error = new DomainError('CHAT_RUN_ACTIVE', 'A response is already running.', 409);
    service.send.mockRejectedValue(error);

    await expect(
      controller.send(
        user,
        conversationId,
        { text: 'Lãi kép' },
        [],
        response as never,
        request as never
      )
    ).rejects.toBe(error);
    expect(response.type).not.toHaveBeenCalled();
    expect(response.end).not.toHaveBeenCalled();
  });

  it('redacts an unexpected post-header failure into one valid terminal error', async () => {
    const { controller, service } = fixture();
    const { response, writes } = responseFixture();
    const { request } = requestFixture();
    service.send.mockImplementation((_owner, _id, _input, emit) => {
      emit({ type: 'checking_scope', runId });
      return Promise.reject(new Error('private provider detail'));
    });

    await controller.send(
      user,
      conversationId,
      { text: 'Lãi kép' },
      [],
      response as never,
      request as never
    );

    expect(writes.map((line): unknown => JSON.parse(line) as unknown)).toEqual([
      { type: 'checking_scope', runId },
      {
        type: 'error',
        runId,
        code: 'CHAT_AI_REQUEST_FAILED',
        message: 'Chat AI request failed.'
      }
    ]);
    expect(JSON.stringify(writes)).not.toContain('private provider detail');
    expect(response.end).toHaveBeenCalledOnce();
  });

  it('cancels only an active streamed run when the client closes', async () => {
    const { controller, service, registry } = fixture();
    const connection = responseFixture();
    const { request } = requestFixture();
    let resolveSend: (() => void) | undefined;
    service.send.mockImplementation(async (_owner, _id, _input, emit) => {
      emit({ type: 'checking_scope', runId });
      await new Promise<void>((resolve) => {
        resolveSend = resolve;
      });
      return { runId, message: assistantMessage };
    });

    const pending = controller.send(
      user,
      conversationId,
      { text: 'Lãi kép' },
      [],
      connection.response as never,
      request as never
    );
    await vi.waitFor(() => expect(connection.response.write).toHaveBeenCalledOnce());
    connection.close();
    expect(registry.cancel).toHaveBeenCalledWith(user.id, runId);
    resolveSend?.();
    await pending;
  });

  it('forwards regeneration and explicit cancellation with owner scope', async () => {
    const { controller, service, limiter } = fixture();
    const { response } = responseFixture();
    const { request } = requestFixture();
    service.regenerate.mockImplementation((_owner, _conversation, _message, emit) => {
      emit({ type: 'final', runId, message: assistantMessage });
      return Promise.resolve({ runId, message: assistantMessage });
    });

    await controller.regenerate(
      user,
      conversationId,
      messageId,
      response as never,
      request as never
    );
    await controller.cancel(user, conversationId, runId);

    expect(limiter.consume).toHaveBeenCalledWith(user.id);
    expect(service.regenerate).toHaveBeenCalledWith(
      user.id,
      conversationId,
      messageId,
      expect.any(Function)
    );
    expect(service.cancel).toHaveBeenCalledWith(user.id, conversationId, runId);
  });
});
