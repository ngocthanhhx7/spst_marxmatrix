import { describe, expect, it } from 'vitest';
import { documentMetadataSchema } from './documents.js';

describe('document contracts', () => {
  it('exposes safe metadata without internal GridFS identifiers', () => {
    const metadata = documentMetadataSchema.parse({
      id: '507f1f77bcf86cd799439011',
      title: 'Báo cáo',
      type: 'financial_report',
      status: 'parsed',
      mimeType: 'application/pdf',
      originalFileName: 'bao-cao.pdf',
      byteSize: 42,
      checksum: 'a'.repeat(64),
      pageCount: 2,
      errorCode: null,
      errorMessage: null,
      createdAt: '2026-07-19T00:00:00.000Z',
      updatedAt: '2026-07-19T00:00:00.000Z'
    });
    expect(metadata).not.toHaveProperty('gridFsFileId');
  });
});
