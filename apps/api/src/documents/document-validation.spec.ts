/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, expect, it } from 'vitest';
import { DocumentValidationError, validatePdfUpload } from './document-validation.js';

const validPdf = Buffer.from('%PDF-1.7\nsynthetic-pdf');

describe('validatePdfUpload', () => {
  it('accepts a bounded PDF with a declared PDF MIME type and sanitizes its filename', () => {
    expect(
      validatePdfUpload({
        buffer: validPdf,
        originalname: '../../Q2 report?.pdf',
        mimetype: 'application/pdf',
        maxBytes: 1024,
        allowedMimeTypes: ['application/pdf']
      })
    ).toMatchObject({
      filename: 'Q2_report.pdf',
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
  });

  it.each([
    [
      'oversized',
      { buffer: validPdf, originalname: 'x.pdf', mimetype: 'application/pdf', maxBytes: 3 }
    ],
    [
      'extension',
      { buffer: validPdf, originalname: 'x.txt', mimetype: 'application/pdf', maxBytes: 1024 }
    ],
    [
      'declared MIME',
      { buffer: validPdf, originalname: 'x.pdf', mimetype: 'text/plain', maxBytes: 1024 }
    ],
    [
      'signature',
      {
        buffer: Buffer.from('not a PDF'),
        originalname: 'x.pdf',
        mimetype: 'application/pdf',
        maxBytes: 1024
      }
    ]
  ])('rejects an invalid %s', (_label, upload) => {
    expect(() => validatePdfUpload({ ...upload, allowedMimeTypes: ['application/pdf'] })).toThrow(
      DocumentValidationError
    );
  });
});
