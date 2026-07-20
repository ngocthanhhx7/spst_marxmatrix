import { model, Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  DocumentPageRecord,
  DocumentPageRecordSchema
} from './document-page.schema.js';

describe('DocumentPageRecordSchema', () => {
  it('accepts a valid blank PDF page so surrounding page numbers stay stable', async () => {
    const modelName = 'DocumentPageRecordBlankPageTest';
    const PageModel = model<DocumentPageRecord>(modelName, DocumentPageRecordSchema.clone());
    const page = new PageModel({
      documentId: new Types.ObjectId(),
      parseToken: new Types.ObjectId().toHexString(),
      pageNumber: 2,
      text: '',
      sourceChunkIds: []
    });

    await expect(page.validate()).resolves.toBeUndefined();
  });
});
