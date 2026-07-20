import { describe, expect, it, vi } from 'vitest';
import {
  createConfiguredGeminiRagProvider,
  GeminiRagProvider,
  RAG_EMBEDDING_DIMENSION,
  type GeminiRagClient
} from './gemini-rag.provider.js';

const documentId = '507f1f77bcf86cd799439012';
const chunkId = '507f1f77bcf86cd799439013';

function client(overrides: Partial<GeminiRagClient['models']> = {}): GeminiRagClient {
  return {
    models: {
      embedContent: vi.fn().mockResolvedValue({
        embeddings: [{ values: new Array<number>(RAG_EMBEDDING_DIMENSION).fill(0.25) }]
      }),
      generateContent: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          mode: 'query',
          answer: 'Gia tri thang du duoc trinh bay trong giao trinh.',
          simulated: false,
          claims: [{ text: 'Gia tri thang du.', citationIndexes: [0] }],
          citations: [
            {
              chunkId,
              documentId,
              pageStart: 4,
              pageEnd: 4,
              quote: 'Gia tri thang du'
            }
          ],
          warning: null
        }),
        usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18 }
      }),
      ...overrides
    }
  };
}

function provider(
  testClient = client(),
  options: Partial<ConstructorParameters<typeof GeminiRagProvider>[0]> = {}
) {
  return new GeminiRagProvider({
    apiKey: 'test-key',
    generationModel: 'gemini-test',
    embeddingModel: 'gemini-embedding-test',
    timeoutMs: 40,
    maxRetries: 1,
    client: testClient,
    sleep: vi.fn().mockResolvedValue(undefined),
    ...options
  });
}

describe('GeminiRagProvider', () => {
  it('selects a live provider only outside demo mode with an explicit Gemini key', () => {
    const logger = { log: () => undefined };
    const base = {
      aiProvider: 'gemini' as const,
      apiKey: 'test-key',
      generationModel: 'gemini-test',
      embeddingModel: 'gemini-embedding-test',
      timeoutMs: 40,
      maxRetries: 0
    };
    expect(createConfiguredGeminiRagProvider({ ...base, demoMode: true }, logger)).toBeNull();
    expect(
      createConfiguredGeminiRagProvider({ ...base, demoMode: false, aiProvider: 'mock' }, logger)
    ).toBeNull();
    expect(
      createConfiguredGeminiRagProvider({ ...base, demoMode: false, apiKey: undefined }, logger)
    ).toBeNull();
    expect(createConfiguredGeminiRagProvider({ ...base, demoMode: false }, logger)).toBeInstanceOf(
      GeminiRagProvider
    );
  });

  it('fails closed with a stable unavailable code when no key is supplied', () => {
    try {
      new GeminiRagProvider({
        apiKey: ' ',
        generationModel: 'gemini-test',
        embeddingModel: 'gemini-embedding-test',
        timeoutMs: 40,
        maxRetries: 0
      });
      throw new Error('Expected GeminiRagProvider to reject missing credentials.');
    } catch (error: unknown) {
      expect(error).toMatchObject({
        code: 'RAG_AI_UNAVAILABLE',
        statusCode: 503
      });
    }
  });

  it('uses the Embedding 2 query prefix without the retired taskType field', async () => {
    const testClient = client();
    await expect(provider(testClient).embedQuery('gia tri')).resolves.toHaveLength(
      RAG_EMBEDDING_DIMENSION
    );
    type EmbedInput = {
      model: string;
      contents: string;
      config: { outputDimensionality: number; taskType?: string };
    };
    const models = Reflect.get(testClient, 'models') as {
      embedContent: GeminiRagClient['models']['embedContent'];
    };
    const embedMock = Reflect.get(models, 'embedContent') as {
      mock?: { calls: EmbedInput[][] };
    };
    const invocation = embedMock.mock?.calls[0]?.[0];
    expect(invocation?.model).toBe('gemini-embedding-test');
    expect(invocation?.contents).toBe('task: search result | query: gia tri');
    expect(invocation?.config).not.toHaveProperty('taskType');
    expect(invocation?.config?.outputDimensionality).toBe(RAG_EMBEDDING_DIMENSION);
    expect(RAG_EMBEDDING_DIMENSION).toBe(768);
  });

  it('uses the Embedding 2 document prefix without the retired taskType field', async () => {
    const testClient = client();
    await provider(testClient).embed('noi dung');
    const embedMock = Reflect.get(testClient.models, 'embedContent') as ReturnType<typeof vi.fn>;
    const invocation = embedMock.mock.calls[0]?.[0] as
      | { contents: string; config: Record<string, unknown> }
      | undefined;

    expect(invocation?.contents).toBe('title: none | text: noi dung');
    expect(invocation?.config).not.toHaveProperty('taskType');
  });

  it('embeds document chunks in bounded batches while preserving one vector per input', async () => {
    const embedContent = vi.fn<GeminiRagClient['models']['embedContent']>(({ contents }) => {
      if (!Array.isArray(contents)) throw new Error('Expected batched Gemini contents.');
      return Promise.resolve({
        embeddings: contents.map((content) => {
          const text = content.parts[0]?.text ?? '';
          const value = Number(text.match(/chunk (\d+)$/)?.[1]);
          return { values: new Array<number>(RAG_EMBEDDING_DIMENSION).fill(value) };
        })
      });
    });
    const texts = Array.from({ length: 35 }, (_, index) => `chunk ${index + 1}`);

    const embeddings = await provider(client({ embedContent })).embedMany(texts);

    expect(embedContent).toHaveBeenCalledTimes(2);
    expect(
      (embedContent.mock.calls[0]?.[0].contents as unknown[] | undefined)?.length
    ).toBe(32);
    expect((embedContent.mock.calls[1]?.[0].contents as unknown[] | undefined)?.length).toBe(3);
    expect(embedContent.mock.calls[0]?.[0].contents).toEqual(
      texts.slice(0, 32).map((text) => ({
        role: 'user',
        parts: [{ text: `title: none | text: ${text}` }]
      }))
    );
    expect(embeddings.map((embedding) => embedding[0])).toEqual(
      texts.map((_text, index) => index + 1)
    );
  });

  it('rejects a batch response that omits an input embedding', async () => {
    const testClient = client({
      embedContent: vi.fn().mockResolvedValue({
        embeddings: [{ values: new Array<number>(RAG_EMBEDDING_DIMENSION).fill(0.25) }]
      })
    });

    await expect(provider(testClient).embedMany(['first', 'second'])).rejects.toMatchObject({
      code: 'RAG_EMBEDDING_INVALID'
    });
  });

  it('rejects an embedding whose dimension cannot match the persisted vector index', async () => {
    const testClient = client({
      embedContent: vi.fn().mockResolvedValue({ embeddings: [{ values: [1, 2] }] })
    });
    await expect(provider(testClient).embed('document')).rejects.toMatchObject({
      code: 'RAG_EMBEDDING_INVALID'
    });
  });

  it('aborts an active embedding request without retrying it', async () => {
    const embedContent = vi.fn<GeminiRagClient['models']['embedContent']>(
      ({ config }) =>
        new Promise((_resolve, reject) => {
          config.abortSignal.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true }
          );
        })
    );
    const sleep = vi.fn().mockResolvedValue(undefined);
    const controller = new AbortController();
    const request = provider(client({ embedContent }), { maxRetries: 2, sleep }).embed(
      'document',
      controller.signal
    );

    controller.abort();

    await expect(request).rejects.toMatchObject({ code: 'RAG_OPERATION_ABORTED' });
    expect(embedContent).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('returns a schema-validated grounded candidate with token-only usage metadata', async () => {
    const logs: Record<string, unknown>[] = [];
    const result = await provider(client(), { log: (record) => logs.push(record) }).generate(
      {
        courseId: 'MLN112',
        documentIds: [documentId],
        mode: 'query',
        question: 'Gia tri thang du la gi?'
      },
      [
        {
          id: chunkId,
          courseId: 'MLN112',
          documentId,
          parseToken: 'parse-token',
          pageStart: 4,
          pageEnd: 4,
          text: 'Gia tri thang du la phan gia tri moi doi ra.',
          score: 0.9
        }
      ]
    );
    expect(result).toMatchObject({ mode: 'query', simulated: false, warning: null });
    expect(result.citations).toHaveLength(1);
    const log = logs[0];
    expect(log).toMatchObject({
      event: 'rag_generation_completed',
      inputTokens: 11,
      outputTokens: 7,
      totalTokens: 18
    });
    expect(log?.['durationMs']).toEqual(expect.any(Number));
    expect(JSON.stringify(logs)).not.toContain('test-key');
    expect(JSON.stringify(logs)).not.toContain('Gia tri thang du la phan');
  });

  it('does not retry authentication failures', async () => {
    const generateContent = vi.fn().mockRejectedValue({ status: 401 });
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      provider(client({ generateContent }), { maxRetries: 1, sleep }).generate(
        { courseId: 'MLN112', documentIds: [documentId], mode: 'query', question: 'Gia tri?' },
        [
          {
            id: chunkId,
            courseId: 'MLN112',
            documentId,
            parseToken: 'parse-token',
            pageStart: 4,
            pageEnd: 4,
            text: 'Gia tri thang du la phan gia tri moi doi ra.',
            score: 0.9
          }
        ]
      )
    ).rejects.toMatchObject({ code: 'RAG_AI_AUTH_FAILED' });
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries transient generation failures with bounded backoff', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          mode: 'query',
          answer: 'Gia tri thang du.',
          simulated: false,
          claims: [{ text: 'Gia tri thang du.', citationIndexes: [0] }],
          citations: [{ chunkId, documentId, pageStart: 4, pageEnd: 4, quote: 'Gia tri thang du' }],
          warning: null
        })
      });
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      provider(client({ generateContent }), { maxRetries: 1, sleep }).generate(
        { courseId: 'MLN112', documentIds: [documentId], mode: 'query', question: 'Gia tri?' },
        [
          {
            id: chunkId,
            courseId: 'MLN112',
            documentId,
            parseToken: 'parse-token',
            pageStart: 4,
            pageEnd: 4,
            text: 'Gia tri thang du la phan gia tri moi doi ra.',
            score: 0.9
          }
        ]
      )
    ).resolves.toMatchObject({ simulated: false });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it('maps timeout and malformed structured output to stable public failures', async () => {
    const hanging = client({
      generateContent: vi.fn<GeminiRagClient['models']['generateContent']>(
        () => new Promise(() => undefined)
      )
    });
    await expect(
      provider(hanging, { timeoutMs: 5, maxRetries: 0 }).generate(
        { courseId: 'MLN112', documentIds: [documentId], mode: 'query', question: 'Gia tri?' },
        [
          {
            id: chunkId,
            courseId: 'MLN112',
            documentId,
            parseToken: 'parse-token',
            pageStart: 4,
            pageEnd: 4,
            text: 'Gia tri thang du la phan gia tri moi doi ra.',
            score: 0.9
          }
        ]
      )
    ).rejects.toMatchObject({ code: 'RAG_AI_TIMEOUT' });
    await expect(
      provider(
        client({
          generateContent: vi
            .fn<GeminiRagClient['models']['generateContent']>()
            .mockResolvedValue({ text: '{not-json' })
        })
      ).generate(
        { courseId: 'MLN112', documentIds: [documentId], mode: 'query', question: 'Gia tri?' },
        [
          {
            id: chunkId,
            courseId: 'MLN112',
            documentId,
            parseToken: 'parse-token',
            pageStart: 4,
            pageEnd: 4,
            text: 'Gia tri thang du la phan gia tri moi doi ra.',
            score: 0.9
          }
        ]
      )
    ).rejects.toMatchObject({ code: 'RAG_AI_RESPONSE_INVALID' });
  });
});
