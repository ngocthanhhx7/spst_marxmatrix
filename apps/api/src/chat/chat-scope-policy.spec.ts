import { describe, expect, it, vi } from 'vitest';
import type { ChatCandidate, ChatModelInput, ChatProvider } from './chat-provider.js';
import { ChatScopePolicy } from './chat-scope-policy.js';

const input: ChatModelInput = { text: 'Giải thích lãi kép', history: [], images: [] };

function candidate(
  answer = 'Lãi kép là lãi tính trên cả vốn lẫn lãi đã tích lũy.',
  scope: ChatCandidate['scope'] = 'finance'
): ChatCandidate {
  return {
    answer,
    scope,
    model: 'gemini-test-model',
    promptVersion: 'chat-answer-v1',
    usage: { inputTokens: 4, outputTokens: 5, totalTokens: 9 }
  };
}

function chatProvider(overrides: Partial<ChatProvider>): ChatProvider {
  return {
    classify: vi.fn().mockResolvedValue({ domain: 'finance', confidence: 1 }),
    generate: vi.fn().mockResolvedValue(candidate()),
    validateOutput: vi.fn().mockResolvedValue(true),
    ...overrides
  };
}

describe('ChatScopePolicy', () => {
  it('passes the classified approved scope into generation before the caller signal', async () => {
    const controller = new AbortController();
    const generate = vi.fn().mockResolvedValue(candidate());
    const policy = new ChatScopePolicy(chatProvider({ generate }));

    await policy.answer(input, controller.signal);

    expect(generate).toHaveBeenCalledWith(input, 'finance', controller.signal);
  });

  it.each([
    ['ambiguous', 'Bạn muốn hỏi nội dung giáo dục hay tài chính cụ thể nào?', 'scope_ambiguous'],
    ['out_of_scope', 'Mình chỉ có thể hỗ trợ các câu hỏi về giáo dục và tài chính.', 'out_of_scope']
  ] as const)(
    'fails closed for %s without generation or output validation',
    async (domain, text, reasonCode) => {
      const generate = vi.fn<ChatProvider['generate']>();
      const validateOutput = vi.fn<ChatProvider['validateOutput']>();
      const policy = new ChatScopePolicy(
        chatProvider({
          classify: vi.fn().mockResolvedValue({ domain, confidence: 1 }),
          generate,
          validateOutput
        })
      );

      await expect(policy.answer(input)).resolves.toEqual({
        status: 'refused',
        text,
        scope: domain,
        reasonCode
      });
      expect(generate).not.toHaveBeenCalled();
      expect(validateOutput).not.toHaveBeenCalled();
    }
  );

  it('replaces a generated answer rejected by the output gate', async () => {
    const unsafe = candidate('unsafe private answer');
    const policy = new ChatScopePolicy(
      chatProvider({
        generate: vi.fn().mockResolvedValue(unsafe),
        validateOutput: vi.fn().mockResolvedValue(false)
      })
    );

    await expect(policy.answer(input)).resolves.toEqual({
      status: 'refused',
      text: 'Mình chỉ có thể hỗ trợ các câu hỏi về giáo dục và tài chính.',
      scope: 'out_of_scope',
      reasonCode: 'out_of_scope'
    });
  });

  it.each([
    ['education', 'finance'],
    ['finance', 'education'],
    ['mixed', 'education']
  ] as const)(
    'fails closed when candidate scope %s/%s is incoherent',
    async (approved, generated) => {
      const validateOutput = vi.fn<ChatProvider['validateOutput']>();
      const policy = new ChatScopePolicy(
        chatProvider({
          classify: vi.fn().mockResolvedValue({ domain: approved, confidence: 1 }),
          generate: vi.fn().mockResolvedValue(candidate('scope-drift answer', generated)),
          validateOutput
        })
      );

      await expect(policy.answer(input)).resolves.toMatchObject({
        status: 'refused',
        scope: 'out_of_scope',
        reasonCode: 'out_of_scope'
      });
      expect(validateOutput).not.toHaveBeenCalled();
    }
  );

  it('runs classify, generate, and output validation in order before exposing an approved answer', async () => {
    const calls: string[] = [];
    const controller = new AbortController();
    const approvedCandidate = candidate();
    const provider: ChatProvider = {
      classify: vi.fn<ChatProvider['classify']>((_input, signal) => {
        calls.push('classify');
        expect(signal).toBe(controller.signal);
        return Promise.resolve({ domain: 'finance', confidence: 0.9 });
      }),
      generate: vi.fn<ChatProvider['generate']>((_input, approvedScope, signal) => {
        calls.push('generate');
        expect(approvedScope).toBe('finance');
        expect(signal).toBe(controller.signal);
        return Promise.resolve(approvedCandidate);
      }),
      validateOutput: vi.fn<ChatProvider['validateOutput']>((answer, approvedScope, signal) => {
        calls.push('validateOutput');
        expect(answer).toBe(approvedCandidate.answer);
        expect(approvedScope).toBe('finance');
        expect(signal).toBe(controller.signal);
        return Promise.resolve(true);
      })
    };

    await expect(new ChatScopePolicy(provider).answer(input, controller.signal)).resolves.toEqual({
      status: 'completed',
      text: approvedCandidate.answer,
      scope: 'finance',
      candidate: approvedCandidate
    });
    expect(calls).toEqual(['classify', 'generate', 'validateOutput']);
  });
});
