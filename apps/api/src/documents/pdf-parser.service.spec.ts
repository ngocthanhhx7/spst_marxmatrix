/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from 'vitest';
import { createSearchablePdfFixture } from '../../../../fixtures/pdfs/generate-fixtures.js';
import { PdfParserService } from './pdf-parser.service.js';

describe('PdfParserService', () => {
  it('extracts known text from a valid searchable PDF via the default PDF.js loader', async () => {
    const parser = new PdfParserService();

    await expect(
      parser.extract(createSearchablePdfFixture('Known PDF.js fixture text'))
    ).resolves.toEqual([{ pageNumber: 1, text: 'Known PDF.js fixture text' }]);
  });

  it('returns extracted pages ordered by page number', async () => {
    const parser = new PdfParserService({
      load: async () => ({
        numPages: 2,
        getPage: async (number: number) => ({
          getTextContent: async () => ({ items: [{ str: number === 1 ? 'first' : 'second' }] })
        })
      })
    });
    await expect(parser.extract(Buffer.from('%PDF-1.7'))).resolves.toEqual([
      { pageNumber: 1, text: 'first' },
      { pageNumber: 2, text: 'second' }
    ]);
  });

  it('reports OCR_UNSUPPORTED rather than pretending image-only PDFs contain text', async () => {
    let destroyed = false;
    const parser = new PdfParserService({
      load: async () => ({
        numPages: 1,
        getPage: async () => ({ getTextContent: async () => ({ items: [] }) }),
        destroy: () => {
          destroyed = true;
        }
      })
    });
    await expect(parser.extract(Buffer.from('%PDF-1.7'))).rejects.toMatchObject({
      code: 'OCR_UNSUPPORTED'
    });
    expect(destroyed).toBe(true);
  });
});
