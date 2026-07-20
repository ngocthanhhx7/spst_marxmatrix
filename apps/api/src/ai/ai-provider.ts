import { GoogleGenAI } from '@google/genai';
import {
  aiExtractedFinancialFactSchema,
  financialExtractionInputSchema,
  financialExtractionResultSchema,
  type FinancialExtractionInput,
  type FinancialExtractionResult
} from '@marxmatrix/contracts';
import { z } from 'zod';

export const AI_PROVIDER = Symbol('AI_PROVIDER');
export const FINANCIAL_EXTRACTION_PROMPT_VERSION = 'financial-extraction-v1';

export interface AIProvider {
  readonly financialExtractionPromptVersion: string;
  extractFinancialFacts(input: FinancialExtractionInput): Promise<FinancialExtractionResult>;
}

export type AIProviderErrorCode =
  | 'AI_UNAVAILABLE'
  | 'AI_AUTH_FAILED'
  | 'AI_TIMEOUT'
  | 'AI_RESPONSE_INVALID'
  | 'AI_REQUEST_FAILED';

/** Stable, redacted error boundary between an external model and application jobs. */
export class AIProviderError extends Error {
  public constructor(
    readonly code: AIProviderErrorCode,
    readonly retryable: boolean
  ) {
    super(
      code === 'AI_UNAVAILABLE'
        ? 'AI features are not configured.'
        : code === 'AI_AUTH_FAILED'
          ? 'AI authentication failed.'
          : code === 'AI_TIMEOUT'
            ? 'AI request timed out.'
            : code === 'AI_RESPONSE_INVALID'
              ? 'AI returned an invalid structured response.'
              : 'AI request failed.'
    );
    this.name = 'AIProviderError';
  }
}

type GeminiResponse = {
  text?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

interface GeminiClient {
  models: {
    generateContent(input: {
      model: string;
      contents: string;
      config: {
        responseMimeType: 'application/json';
        responseJsonSchema: unknown;
        systemInstruction: string;
        temperature: number;
        abortSignal: AbortSignal;
      };
    }): Promise<GeminiResponse>;
  };
}

interface GeminiProviderOptions {
  apiKey: string;
  generationModel: string;
  timeoutMs: number;
  maxRetries: number;
  client?: GeminiClient;
  sleep?: (milliseconds: number) => Promise<void>;
}

const generatedFactsSchema = z.object({ facts: z.array(aiExtractedFinancialFactSchema) }).strict();
const generatedFactsJsonSchema = z.toJSONSchema(generatedFactsSchema);

export class UnavailableAIProvider implements AIProvider {
  public readonly financialExtractionPromptVersion = FINANCIAL_EXTRACTION_PROMPT_VERSION;

  extractFinancialFacts(_input: FinancialExtractionInput): Promise<FinancialExtractionResult> {
    void _input;
    return Promise.reject(new AIProviderError('AI_UNAVAILABLE', false));
  }
}

export class MockAIProvider implements AIProvider {
  public readonly financialExtractionPromptVersion = FINANCIAL_EXTRACTION_PROMPT_VERSION;

  extractFinancialFacts(input: FinancialExtractionInput): Promise<FinancialExtractionResult> {
    const parsed = financialExtractionInputSchema.parse(input);
    const source = parsed.chunks[0];
    if (source === undefined) throw new AIProviderError('AI_RESPONSE_INVALID', false);
    return Promise.resolve(
      financialExtractionResultSchema.parse({
        facts: [
          {
            key: 'reported_financial_line',
            label: 'Reported financial line item',
            value: 0,
            currency: 'USD',
            scale: 'ones',
            reportingPeriod: 'Unconfirmed reporting period',
            classification: 'needs_review',
            extractionMode: 'ai_extracted',
            reviewStatus: 'pending_review',
            sourcePage: source.sourcePage,
            sourceChunkId: source.sourceChunkId,
            evidenceText: source.text.slice(0, 5000),
            classificationReason: 'Simulated extraction requires human review.',
            sensitivityCategory: 'standard',
            sensitivityClassification: null
          }
        ],
        simulated: true,
        model: 'mock-financial-extraction',
        promptVersion: this.financialExtractionPromptVersion,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      })
    );
  }
}

/** Backend-only Gemini adapter. Its returned usage is intentionally token counts only. */
export class GeminiAIProvider implements AIProvider {
  public readonly financialExtractionPromptVersion = FINANCIAL_EXTRACTION_PROMPT_VERSION;
  private readonly client: GeminiClient;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  public constructor(private readonly options: GeminiProviderOptions) {
    if (options.apiKey.trim().length === 0) throw new AIProviderError('AI_UNAVAILABLE', false);
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1)
      throw new RangeError('AI timeout must be a positive integer.');
    if (!Number.isInteger(options.maxRetries) || options.maxRetries < 0 || options.maxRetries > 10)
      throw new RangeError('AI retries must be an integer between 0 and 10.');
    this.client =
      options.client ?? (new GoogleGenAI({ apiKey: options.apiKey }) as unknown as GeminiClient);
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  }

  async extractFinancialFacts(input: FinancialExtractionInput): Promise<FinancialExtractionResult> {
    const parsedInput = financialExtractionInputSchema.parse(input);
    let attempt = 0;
    while (true) {
      try {
        const response = await this.withTimeout((signal) =>
          this.client.models.generateContent({
            model: this.options.generationModel,
            contents: this.userPrompt(parsedInput),
            config: {
              responseMimeType: 'application/json',
              responseJsonSchema: generatedFactsJsonSchema,
              systemInstruction:
                'Extract only explicitly stated financial facts. Every fact needs exact page, source chunk, and evidence. Return JSON only. All facts must be pending human review.',
              temperature: 0,
              abortSignal: signal
            }
          })
        );
        const result = generatedFactsSchema.safeParse(this.parseJson(response.text));
        if (!result.success) throw new AIProviderError('AI_RESPONSE_INVALID', false);
        return financialExtractionResultSchema.parse({
          facts: result.data.facts,
          simulated: false,
          model: this.options.generationModel,
          promptVersion: this.financialExtractionPromptVersion,
          usage: this.redactedUsage(response.usageMetadata)
        });
      } catch (error: unknown) {
        const classified = this.classify(error);
        if (!classified.retryable || attempt >= this.options.maxRetries) throw classified;
        await this.sleep(Math.min(1_000 * 2 ** attempt, 8_000));
        attempt += 1;
      }
    }
  }

  private userPrompt(input: FinancialExtractionInput): string {
    return JSON.stringify({
      documentId: input.documentId,
      pageNumbers: input.pageNumbers,
      chunks: input.chunks.map((chunk) => ({
        sourcePage: chunk.sourcePage,
        sourceChunkId: chunk.sourceChunkId,
        text: chunk.text
      }))
    });
  }

  private async withTimeout(
    operation: (signal: AbortSignal) => Promise<GeminiResponse>
  ): Promise<GeminiResponse> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new AIProviderError('AI_TIMEOUT', true));
          }, this.options.timeoutMs);
        })
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private parseJson(text: string | undefined): unknown {
    if (text === undefined || text.trim().length === 0)
      throw new AIProviderError('AI_RESPONSE_INVALID', false);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AIProviderError('AI_RESPONSE_INVALID', false);
    }
  }

  private redactedUsage(
    usage: GeminiResponse['usageMetadata']
  ): FinancialExtractionResult['usage'] {
    if (usage === undefined) return undefined;
    const result: NonNullable<FinancialExtractionResult['usage']> = {};
    if (this.isTokenCount(usage.promptTokenCount)) result.inputTokens = usage.promptTokenCount;
    if (this.isTokenCount(usage.candidatesTokenCount))
      result.outputTokens = usage.candidatesTokenCount;
    if (this.isTokenCount(usage.totalTokenCount)) result.totalTokens = usage.totalTokenCount;
    return result;
  }

  private isTokenCount(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
  }

  private classify(error: unknown): AIProviderError {
    if (error instanceof AIProviderError) return error;
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? (error as { status?: unknown }).status
        : undefined;
    if (status === 401 || status === 403) return new AIProviderError('AI_AUTH_FAILED', false);
    if (status === 429 || (typeof status === 'number' && status >= 500 && status <= 599))
      return new AIProviderError('AI_REQUEST_FAILED', true);
    return new AIProviderError('AI_REQUEST_FAILED', true);
  }
}
