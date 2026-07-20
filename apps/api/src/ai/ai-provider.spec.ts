import { describe, expect, it, vi } from 'vitest';
import {
  AIProviderError,
  GeminiAIProvider,
  MockAIProvider,
  UnavailableAIProvider
} from './ai-provider.js';

const chunk = {
  sourcePage: 1,
  sourceChunkId: '507f1f77bcf86cd799439011',
  text: 'Revenue for FY2025 was USD 100 million.'
};

const fact = {
  key: 'revenue',
  label: 'Revenue',
  value: 100,
  currency: 'USD',
  scale: 'millions',
  reportingPeriod: 'FY2025',
  classification: 'needs_review',
  extractionMode: 'ai_extracted',
  reviewStatus: 'pending_review',
  sourcePage: 1,
  sourceChunkId: chunk.sourceChunkId,
  evidenceText: 'Revenue for FY2025 was USD 100 million.',
  classificationReason: 'Reported revenue line item.',
  sensitivityCategory: 'standard',
  sensitivityClassification: null
};

describe('AI providers', () => {
  it('labels mock extraction as simulated and never returns configuration secrets in usage', async () => {
    const provider = new MockAIProvider();

    const result = await provider.extractFinancialFacts({
      documentId: '507f1f77bcf86cd799439012',
      pageNumbers: [1],
      chunks: [chunk]
    });

    expect(result.simulated).toBe(true);
    expect(result.model).toBe('mock-financial-extraction');
    expect(result.facts[0]).toMatchObject({
      extractionMode: 'ai_extracted',
      reviewStatus: 'pending_review',
      sourcePage: 1,
      sourceChunkId: chunk.sourceChunkId
    });
    expect(JSON.stringify(result.usage)).not.toContain('key');
  });

  it('fails safely when a live provider is unavailable', async () => {
    await expect(
      new UnavailableAIProvider().extractFinancialFacts({
        documentId: '507f1f77bcf86cd799439012',
        pageNumbers: [1],
        chunks: [chunk]
      })
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE', retryable: false });
  });

  it('retries a transient Gemini response once, validates structured output, and redacts usage', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { status: 429 }))
      .mockResolvedValueOnce({
        text: JSON.stringify({ facts: [fact] }),
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 7, totalTokenCount: 19 }
      });
    const provider = new GeminiAIProvider({
      apiKey: 'secret-never-returned',
      generationModel: 'gemini-test',
      timeoutMs: 1_000,
      maxRetries: 1,
      client: { models: { generateContent } },
      sleep: () => Promise.resolve()
    });

    const result = await provider.extractFinancialFacts({
      documentId: '507f1f77bcf86cd799439012',
      pageNumbers: [1],
      chunks: [chunk]
    });

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[0]?.[0]).toMatchObject({
      model: 'gemini-test',
      config: { responseMimeType: 'application/json' }
    });
    expect(result).toMatchObject({
      simulated: false,
      model: 'gemini-test',
      usage: { totalTokens: 19 }
    });
    expect(JSON.stringify(result.usage)).not.toContain('secret');
  });

  it('does not retry authentication failures or accept malformed structured output', async () => {
    const authProvider = new GeminiAIProvider({
      apiKey: 'secret',
      generationModel: 'gemini-test',
      timeoutMs: 1_000,
      maxRetries: 3,
      client: { models: { generateContent: vi.fn().mockRejectedValue({ status: 401 }) } },
      sleep: () => Promise.resolve()
    });
    await expect(
      authProvider.extractFinancialFacts({
        documentId: '507f1f77bcf86cd799439012',
        pageNumbers: [1],
        chunks: [chunk]
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<AIProviderError>>({
        code: 'AI_AUTH_FAILED',
        retryable: false
      })
    );

    const schemaProvider = new GeminiAIProvider({
      apiKey: 'secret',
      generationModel: 'gemini-test',
      timeoutMs: 1_000,
      maxRetries: 0,
      client: {
        models: { generateContent: vi.fn().mockResolvedValue({ text: '{"facts":[{}]}' }) }
      },
      sleep: () => Promise.resolve()
    });
    await expect(
      schemaProvider.extractFinancialFacts({
        documentId: '507f1f77bcf86cd799439012',
        pageNumbers: [1],
        chunks: [chunk]
      })
    ).rejects.toMatchObject({ code: 'AI_RESPONSE_INVALID', retryable: false });
  });
});
