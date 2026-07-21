import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatModelInput } from './chat-provider.js';
import {
  CHAT_ANSWER_PROMPT_VERSION,
  GeminiChatProvider,
  type GeminiChatClient,
  type GeminiChatProviderOptions
} from './gemini-chat.provider.js';

const model = 'gemini-test-model';
const apiKey = 'private-test-api-key';
const input: ChatModelInput = {
  text: 'Đọc biểu đồ lãi kép hiện tại',
  history: [
    {
      role: 'user',
      text: 'Câu hỏi lịch sử riêng tư',
      images: [{ mimeType: 'image/jpeg', bytes: Buffer.from('history-private-image') }]
    },
    { role: 'assistant', text: 'Câu trả lời lịch sử riêng tư', images: [] }
  ],
  images: [
    { mimeType: 'image/png', bytes: Buffer.from('current-private-image-one') },
    { mimeType: 'image/webp', bytes: Buffer.from('current-private-image-two') }
  ]
};

type GenerateContent = GeminiChatClient['models']['generateContent'];
function client(generateContent: GenerateContent): GeminiChatClient {
  return { models: { generateContent } };
}

function provider(
  generateContent: GenerateContent,
  overrides: Partial<GeminiChatProviderOptions> = {}
): GeminiChatProvider {
  return new GeminiChatProvider({
    apiKey,
    model,
    timeoutMs: 50,
    maxRetries: 0,
    client: client(generateContent),
    ...overrides
  });
}

function response(
  value: unknown,
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  }
) {
  const text = JSON.stringify(value);
  return usageMetadata === undefined ? { text } : { text, usageMetadata };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('GeminiChatProvider', () => {
  it.each(['finance', 'mixed'] as const)(
    'uses the trusted approved %s scope and finance cautions in the answer instruction',
    async (approvedScope) => {
      const generateContent = vi
        .fn<GenerateContent>()
        .mockResolvedValue(response({ answer: 'General information.', scope: approvedScope }));
      const chatProvider = provider(generateContent);

      await chatProvider.generate(input, approvedScope);

      const systemInstruction = String(generateContent.mock.calls[0]?.[0].config.systemInstruction);
      expect(systemInstruction).toContain(`The exact approved scope is ${approvedScope}.`);
      expect(systemInstruction).toContain('educational or general financial information');
      expect(systemInstruction).toContain('no personalized transaction or action instructions');
      expect(systemInstruction).toContain('no guaranteed-return claims');
      expect(systemInstruction).not.toContain(input.text);
      expect(systemInstruction).not.toContain(input.history[0]?.text);
    }
  );

  it('narrows output validation to actual external actions, not educational instructions', async () => {
    const generateContent = vi.fn<GenerateContent>().mockResolvedValue(response({ allowed: true }));

    await provider(generateContent).validateOutput(
      'Explain the steps for calculating compound interest.',
      'finance'
    );

    const systemInstruction = String(generateContent.mock.calls[0]?.[0].config.systemInstruction);
    expect(systemInstruction).toContain(
      'Reject claims or requests to actually execute external tools, transactions, or network actions.'
    );
    expect(systemInstruction).toContain(
      'Do not reject ordinary educational step-by-step explanations.'
    );
  });

  it('sends ordered history, current text, and inline images using structured JSON output', async () => {
    const generateContent = vi
      .fn<GenerateContent>()
      .mockResolvedValue(
        response(
          { answer: 'Đây là biểu đồ lãi kép.', scope: 'finance' },
          { promptTokenCount: 4, candidatesTokenCount: 5, totalTokenCount: 9 }
        )
      );

    await expect(provider(generateContent).generate(input, 'finance')).resolves.toEqual({
      answer: 'Đây là biểu đồ lãi kép.',
      scope: 'finance',
      model,
      promptVersion: CHAT_ANSWER_PROMPT_VERSION,
      usage: { inputTokens: 4, outputTokens: 5, totalTokens: 9 }
    });

    const request = generateContent.mock.calls[0]?.[0];
    expect(request?.contents).toEqual([
      {
        role: 'user',
        parts: [
          { text: 'Câu hỏi lịch sử riêng tư' },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: Buffer.from('history-private-image').toString('base64')
            }
          }
        ]
      },
      { role: 'model', parts: [{ text: 'Câu trả lời lịch sử riêng tư' }] },
      {
        role: 'user',
        parts: [
          { text: 'Đọc biểu đồ lãi kép hiện tại' },
          {
            inlineData: {
              mimeType: 'image/png',
              data: Buffer.from('current-private-image-one').toString('base64')
            }
          },
          {
            inlineData: {
              mimeType: 'image/webp',
              data: Buffer.from('current-private-image-two').toString('base64')
            }
          }
        ]
      }
    ]);
    expect(request?.config).toMatchObject({
      responseMimeType: 'application/json',
      temperature: 0
    });
    expect(request?.config.responseJsonSchema).toBeTypeOf('object');
    expect(request?.config.systemInstruction).toBeTypeOf('string');
    expect(request?.config.abortSignal).toBeInstanceOf(AbortSignal);
    expect(request?.config).not.toHaveProperty('tools');
    const systemInstruction = String(request?.config.systemInstruction);
    expect(systemInstruction).toContain('untrusted');
    expect(systemInstruction).toContain('education');
    expect(systemInstruction).toContain('finance');
    expect(systemInstruction).toContain('tools');
    expect(systemInstruction).toContain('URL');
    expect(systemInstruction).toContain('transactions');
    expect(systemInstruction).not.toContain(input.text);
    expect(systemInstruction).not.toContain(input.history[0]?.text);
    expect(JSON.stringify(request?.config)).not.toContain('current-private-image');
    expect(JSON.stringify(request?.config)).not.toContain(apiKey);
  });

  it('sends an image-only request without an empty text part', async () => {
    const bytes = Buffer.from([0, 1, 2, 255]);
    const generateContent = vi
      .fn<GenerateContent>()
      .mockResolvedValue(
        response({ answer: 'The chart shows compound growth.', scope: 'finance' })
      );

    await expect(
      provider(generateContent).generate(
        {
          text: '',
          history: [],
          images: [{ mimeType: 'image/png', bytes }]
        },
        'finance'
      )
    ).resolves.toMatchObject({
      answer: 'The chart shows compound growth.',
      scope: 'finance'
    });
    expect(generateContent.mock.calls[0]?.[0].contents).toEqual([
      {
        role: 'user',
        parts: [{ inlineData: { mimeType: 'image/png', data: bytes.toString('base64') } }]
      }
    ]);
  });

  it('parses strict classification, generation, and output-validation responses', async () => {
    const classifyCall = vi
      .fn<GenerateContent>()
      .mockResolvedValue(response({ domain: 'mixed', confidence: 0.75 }));
    const generateCall = vi
      .fn<GenerateContent>()
      .mockResolvedValue(response({ answer: 'Một câu trả lời.', scope: 'education' }));
    const validateCall = vi.fn<GenerateContent>().mockResolvedValue(response({ allowed: true }));

    await expect(provider(classifyCall).classify(input)).resolves.toEqual({
      domain: 'mixed',
      confidence: 0.75
    });
    await expect(provider(generateCall).generate(input, 'education')).resolves.toMatchObject({
      answer: 'Một câu trả lời.',
      scope: 'education'
    });
    await expect(
      provider(validateCall).validateOutput('Một câu trả lời.', 'education')
    ).resolves.toBe(true);
  });

  it('logs only the allowlisted generation metadata with nullable token counts', async () => {
    const logs: Record<string, unknown>[] = [];
    const generateContent = vi
      .fn<GenerateContent>()
      .mockResolvedValue(response({ answer: 'Nội dung trả lời riêng tư', scope: 'finance' }));

    await provider(generateContent, { log: (record) => logs.push(record) }).generate(
      input,
      'finance'
    );

    expect(logs).toHaveLength(1);
    const durationMs = logs[0]?.['durationMs'];
    expect(durationMs).toBeTypeOf('number');
    expect(logs[0]).toEqual({
      event: 'chat_generation_completed',
      provider: 'gemini',
      model,
      promptVersion: CHAT_ANSWER_PROMPT_VERSION,
      durationMs,
      imageCount: 2,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null
    });
    expect(Object.keys(logs[0] ?? {})).toEqual([
      'event',
      'provider',
      'model',
      'promptVersion',
      'durationMs',
      'imageCount',
      'inputTokens',
      'outputTokens',
      'totalTokens'
    ]);
    const serialized = JSON.stringify(logs);
    for (const secret of [
      apiKey,
      input.text,
      input.history[0]?.text ?? '',
      'Nội dung trả lời riêng tư',
      'current-private-image',
      'history-private-image',
      'filename'
    ])
      expect(serialized).not.toContain(secret);
  });

  it('honors a decimal Gemini quota delay with the required buffer', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const generateContent = vi
      .fn<GenerateContent>()
      .mockRejectedValueOnce({ status: 429, message: 'Please retry in 1.5s.' })
      .mockResolvedValueOnce(response({ domain: 'finance', confidence: 1 }));

    await expect(
      provider(generateContent, { sleep, maxRetries: 1 }).classify(input)
    ).resolves.toEqual({ domain: 'finance', confidence: 1 });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1_750);
  });

  it.each(['classify', 'generate', 'validateOutput'] as const)(
    'propagates caller cancellation through %s',
    async (operation) => {
      const generateContent = vi.fn<GenerateContent>((request) => {
        return new Promise((_resolve, reject) => {
          request.config.abortSignal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true
          });
        });
      });
      const controller = new AbortController();
      const chatProvider = provider(generateContent);
      const pending =
        operation === 'classify'
          ? chatProvider.classify(input, controller.signal)
          : operation === 'generate'
            ? chatProvider.generate(input, 'finance', controller.signal)
            : chatProvider.validateOutput('private answer', 'finance', controller.signal);
      await vi.waitFor(() => expect(generateContent).toHaveBeenCalledOnce());
      const internalSignal = generateContent.mock.calls[0]?.[0].config.abortSignal;

      controller.abort();

      await expect(pending).rejects.toMatchObject({ code: 'CHAT_OPERATION_ABORTED' });
      expect(internalSignal?.aborted).toBe(true);
    }
  );

  it('fails with a stable timeout and aborts the request signal', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const generateContent = vi.fn<GenerateContent>((request) => {
      requestSignal = request.config.abortSignal;
      return new Promise(() => undefined);
    });
    const pending = provider(generateContent, { timeoutMs: 25 }).classify(input);
    const rejection = expect(pending).rejects.toMatchObject({ code: 'CHAT_AI_TIMEOUT' });

    await vi.advanceTimersByTimeAsync(25);

    await rejection;
    expect(requestSignal?.aborted).toBe(true);
  });

  it.each([
    { status: 401 },
    { status: 403 },
    { status: 400, message: 'Request rejected: API_KEY_INVALID' }
  ] as const)('maps authentication failure %# without retrying', async (error) => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const generateContent = vi.fn<GenerateContent>().mockRejectedValue(error);

    await expect(
      provider(generateContent, { maxRetries: 3, sleep }).classify(input)
    ).rejects.toMatchObject({ code: 'CHAT_AI_AUTH_FAILED' });
    expect(generateContent).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it.each([
    ['classify', '{not-json'],
    ['classify', JSON.stringify({ domain: 'finance', confidence: 2 })],
    ['generate', JSON.stringify({ answer: '', scope: 'finance' })],
    ['validateOutput', JSON.stringify({ allowed: 'yes' })]
  ] as const)('fails closed for malformed %s output', async (operation, text) => {
    const chatProvider = provider(vi.fn<GenerateContent>().mockResolvedValue({ text }));
    const pending =
      operation === 'classify'
        ? chatProvider.classify(input)
        : operation === 'generate'
          ? chatProvider.generate(input, 'finance')
          : chatProvider.validateOutput('answer', 'finance');

    await expect(pending).rejects.toMatchObject({ code: 'CHAT_AI_RESPONSE_INVALID' });
  });

  it.each([429, 500, 503, 599])('retries allowlisted provider status %s', async (status) => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const generateContent = vi
      .fn<GenerateContent>()
      .mockRejectedValueOnce({ status })
      .mockResolvedValueOnce(response({ domain: 'education', confidence: 1 }));

    await expect(
      provider(generateContent, { maxRetries: 1, sleep }).classify(input)
    ).resolves.toMatchObject({ domain: 'education' });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it.each([400, 404, 600])('does not retry non-allowlisted provider status %s', async (status) => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const generateContent = vi.fn<GenerateContent>().mockRejectedValue({ status });

    await expect(
      provider(generateContent, { maxRetries: 3, sleep }).classify(input)
    ).rejects.toMatchObject({ code: 'CHAT_AI_REQUEST_FAILED' });
    expect(generateContent).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('stops after the configured retry maximum with bounded exponential backoff', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const generateContent = vi.fn<GenerateContent>().mockRejectedValue({ status: 503 });

    await expect(
      provider(generateContent, { maxRetries: 4, sleep }).classify(input)
    ).rejects.toMatchObject({ code: 'CHAT_AI_REQUEST_FAILED' });
    expect(generateContent).toHaveBeenCalledTimes(5);
    expect(sleep.mock.calls).toEqual([[250], [500], [1_000], [2_000]]);
  });

  it('clears the default backoff timer when the caller cancels', async () => {
    vi.useFakeTimers();
    const generateContent = vi.fn<GenerateContent>().mockRejectedValue({ status: 503 });
    const controller = new AbortController();
    const pending = provider(generateContent, { maxRetries: 1 }).classify(input, controller.signal);
    const rejection = expect(pending).rejects.toMatchObject({ code: 'CHAT_OPERATION_ABORTED' });
    await vi.advanceTimersByTimeAsync(0);
    expect(generateContent).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);

    controller.abort();

    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts retry sleep immediately when the caller cancels', async () => {
    const sleep = vi.fn<NonNullable<GeminiChatProviderOptions['sleep']>>(
      () => new Promise(() => undefined)
    );
    const generateContent = vi.fn<GenerateContent>().mockRejectedValue({ status: 503 });
    const controller = new AbortController();
    const pending = provider(generateContent, { maxRetries: 1, sleep }).classify(
      input,
      controller.signal
    );
    await vi.waitFor(() => expect(sleep).toHaveBeenCalledWith(250));

    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'CHAT_OPERATION_ABORTED' });
    expect(generateContent).toHaveBeenCalledOnce();
  });
});
