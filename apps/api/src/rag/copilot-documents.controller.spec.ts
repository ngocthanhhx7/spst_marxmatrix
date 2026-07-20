import { describe, expect, it, vi } from 'vitest';
import { CopilotDocumentsController } from './copilot-documents.controller.js';

const ownerId = '507f1f77bcf86cd799439011';
const documentId = '507f1f77bcf86cd799439012';

describe('CopilotDocumentsController', () => {
  it('deletes a private Copilot document through the authenticated owner', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const controller = new CopilotDocumentsController({ delete: remove } as never, {} as never);

    await expect(controller.delete({ id: ownerId } as never, documentId)).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledWith(ownerId, documentId);
  });
});
