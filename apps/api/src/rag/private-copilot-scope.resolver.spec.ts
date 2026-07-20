import { describe, expect, it, vi } from 'vitest';
import { PERSONAL_COPILOT_COURSE_ID } from '@marxmatrix/contracts';
import { PrivateCopilotScopeResolver } from './private-copilot-scope.resolver.js';

const ownerId = '507f1f77bcf86cd799439011';
const otherOwnerId = '507f1f77bcf86cd799439012';
const documentId = '507f1f77bcf86cd799439013';

describe('PrivateCopilotScopeResolver', () => {
  it('resolves only ready private-Copilot documents owned by the requesting user', async () => {
    const select = vi.fn().mockResolvedValue([
      {
        _id: { toString: () => documentId },
        ownerId: { toString: () => ownerId },
        parsedPageToken: 'parse-v1'
      }
    ]);
    const find = vi.fn().mockReturnValue({ select });
    const resolver = new PrivateCopilotScopeResolver({ find } as never);

    await expect(resolver.resolve(ownerId, [documentId])).resolves.toEqual({
      ownerId,
      courseId: PERSONAL_COPILOT_COURSE_ID,
      documentParseTokens: [{ documentId, parseToken: 'parse-v1' }]
    });
    expect(find).toHaveBeenCalledWith({
      _id: { $in: [expect.anything()] },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Vitest asymmetric matcher.
      ownerId: expect.anything(),
      courseId: PERSONAL_COPILOT_COURSE_ID,
      type: 'textbook',
      status: 'ready',
      deletionState: 'active'
    });
  });

  it('does not resolve another owner’s document', async () => {
    const resolver = new PrivateCopilotScopeResolver({
      find: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue([]) })
    } as never);

    await expect(resolver.resolve(otherOwnerId, [documentId])).rejects.toMatchObject({
      code: 'RAG_DOCUMENT_SCOPE_NOT_FOUND'
    });
  });
});
