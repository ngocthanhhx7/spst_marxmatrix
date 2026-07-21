import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/api/api-error.js';
import { chatApi, consumeChatStream } from './chat.api.js';

const { request, response } = vi.hoisted(() => ({ request: vi.fn(), response: vi.fn() }));

vi.mock('../../shared/api/runtime.js', () => ({ apiClient: { request, response } }));

const runId = '550e8400-e29b-41d4-a716-446655440000';
const conversationId = '507f1f77bcf86cd799439011';
const messageId = '507f1f77bcf86cd799439012';

function chunkedResponse(chunks: readonly Uint8Array[] | readonly string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks)
          controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
        controller.close();
      }
    })
  );
}

function errorEvent(code = 'X'): string {
  return JSON.stringify({ type: 'error', runId, code, message: 'Y' });
}

async function expectInvalid(response: Response): Promise<void> {
  await expect(consumeChatStream(response, vi.fn())).rejects.toMatchObject({
    name: ApiError.name,
    code: 'CHAT_AI_RESPONSE_INVALID'
  });
}

describe('chatApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses records split across arbitrary response chunks', async () => {
    const stream = chunkedResponse([
      `{"type":"checking_scope","runId":"${runId}"}\n{"type":`,
      `"error","runId":"${runId}","code":"X","message":"Y"}\n`
    ]);
    const events: Array<{ type: string }> = [];

    await consumeChatStream(stream, (event) => events.push(event));

    expect(events.map(({ type }) => type)).toEqual(['checking_scope', 'error']);
  });

  it('builds an image-only multipart message in original image order', async () => {
    const first = new File(['first'], 'first.png', { type: 'image/png' });
    const second = new File(['second'], 'second.webp', { type: 'image/webp' });
    response.mockResolvedValue(chunkedResponse([`${errorEvent()}\n`]));

    await chatApi.sendMessage(
      conversationId,
      { text: '', images: [first, second] },
      vi.fn(),
      new AbortController().signal
    );

    const init = response.mock.calls[0]?.[1] as RequestInit;
    const body = init.body as FormData;
    expect(body.get('text')).toBe('');
    expect(body.getAll('images')).toEqual([first, second]);
    expect(new Headers(init.headers).has('content-type')).toBe(false);
  });

  it('uses encoded cursors and the approved REST endpoints', async () => {
    const cursor = 'next cursor/with?characters';
    request.mockResolvedValue({});
    response.mockResolvedValue(chunkedResponse([`${errorEvent()}\n`]));
    const signal = new AbortController().signal;

    await chatApi.createConversation();
    await chatApi.listConversations(cursor);
    await chatApi.getConversation(conversationId, cursor);
    await chatApi.deleteConversation(conversationId);
    await chatApi.regenerate(conversationId, messageId, vi.fn(), signal);
    await chatApi.cancel(conversationId, runId);

    expect(request.mock.calls).toEqual([
      ['/chat/conversations', { method: 'POST' }],
      [`/chat/conversations?cursor=${encodeURIComponent(cursor)}`],
      [`/chat/conversations/${conversationId}?cursor=${encodeURIComponent(cursor)}`],
      [`/chat/conversations/${conversationId}`, { method: 'DELETE' }],
      [`/chat/conversations/${conversationId}/runs/${runId}/cancel`, { method: 'POST' }]
    ]);
    expect(response).toHaveBeenCalledWith(
      `/chat/conversations/${conversationId}/messages/${messageId}/regenerate`,
      { method: 'POST', signal }
    );
  });

  it('rejects malformed, missing-terminal, post-terminal, and truncated streams', async () => {
    await expectInvalid(chunkedResponse(['not-json\n']));
    await expectInvalid(chunkedResponse([`{"type":"checking_scope","runId":"${runId}"}\n`]));
    await expectInvalid(
      chunkedResponse([`${errorEvent()}\n{"type":"checking_scope","runId":"${runId}"}\n`])
    );
    await expectInvalid(chunkedResponse([`{"type":"checking_scope","runId":"${runId}"`]));
  });

  it('rejects a truncated UTF-8 record', async () => {
    await expectInvalid(chunkedResponse([Uint8Array.of(0xe2, 0x82)]));
  });

  it('rejects events that switch run ids within one response stream', async () => {
    const otherRunId = 'a28f1b60-f41c-4f85-ae58-e0d061f3c5ad';
    await expectInvalid(
      chunkedResponse([
        `{"type":"checking_scope","runId":"${runId}"}\n`,
        `{"type":"error","runId":"${otherRunId}","code":"X","message":"Y"}\n`
      ])
    );
  });

  it('propagates AbortError from the response request', async () => {
    const abort = new DOMException('Aborted', 'AbortError');
    response.mockRejectedValue(abort);
    const controller = new AbortController();

    await expect(
      chatApi.sendMessage(
        conversationId,
        { text: 'Explain interest.', images: [] },
        vi.fn(),
        controller.signal
      )
    ).rejects.toBe(abort);
  });
});
