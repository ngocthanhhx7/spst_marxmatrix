import { Inject, Injectable } from '@nestjs/common';
import {
  CHAT_PROVIDER,
  type ChatCandidate,
  type ChatModelInput,
  type ChatProvider
} from './chat-provider.js';

const AMBIGUOUS_TEXT = 'Bạn muốn hỏi nội dung giáo dục hay tài chính cụ thể nào?';
const OUT_OF_SCOPE_TEXT = 'Mình chỉ có thể hỗ trợ các câu hỏi về giáo dục và tài chính.';

export type ChatPolicyResult =
  | {
      status: 'completed';
      text: string;
      scope: 'education' | 'finance' | 'mixed';
      candidate: ChatCandidate;
    }
  | {
      status: 'refused';
      text: typeof AMBIGUOUS_TEXT;
      scope: 'ambiguous';
      reasonCode: 'scope_ambiguous';
    }
  | {
      status: 'refused';
      text: typeof OUT_OF_SCOPE_TEXT;
      scope: 'out_of_scope';
      reasonCode: 'out_of_scope';
    };

@Injectable()
export class ChatScopePolicy {
  public constructor(@Inject(CHAT_PROVIDER) private readonly provider: ChatProvider) {}

  public async answer(input: ChatModelInput, signal?: AbortSignal): Promise<ChatPolicyResult> {
    const decision = await this.provider.classify(input, signal);
    if (decision.domain === 'ambiguous') return ambiguousRefusal();
    if (decision.domain === 'out_of_scope') return outOfScopeRefusal();

    const candidate = await this.provider.generate(input, decision.domain, signal);
    if (candidate.scope !== decision.domain) return outOfScopeRefusal();

    const allowed = await this.provider.validateOutput(candidate.answer, decision.domain, signal);
    if (!allowed) return outOfScopeRefusal();

    return {
      status: 'completed',
      text: candidate.answer,
      scope: candidate.scope,
      candidate
    };
  }
}

function ambiguousRefusal(): ChatPolicyResult {
  return {
    status: 'refused',
    text: AMBIGUOUS_TEXT,
    scope: 'ambiguous',
    reasonCode: 'scope_ambiguous'
  };
}

function outOfScopeRefusal(): ChatPolicyResult {
  return {
    status: 'refused',
    text: OUT_OF_SCOPE_TEXT,
    scope: 'out_of_scope',
    reasonCode: 'out_of_scope'
  };
}
