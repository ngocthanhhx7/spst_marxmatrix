import { Inject, Injectable, Optional } from '@nestjs/common';

export interface ParsedPdfPage {
  pageNumber: number;
  text: string;
}
interface PdfTextContent {
  items: ReadonlyArray<{ str?: unknown }>;
}
interface PdfPage {
  getTextContent(): Promise<PdfTextContent>;
}
interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy?(): Promise<void> | void;
}
interface PdfLoader {
  load(buffer: Buffer): Promise<PdfDocument>;
}
export const PDF_LOADER = Symbol('PDF_LOADER');

export class PdfParsingError extends Error {
  public constructor(
    public readonly code: 'OCR_UNSUPPORTED' | 'PDF_PARSE_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'PdfParsingError';
  }
}

class PdfJsLoader implements PdfLoader {
  async load(buffer: Buffer): Promise<PdfDocument> {
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as {
      getDocument(input: { data: Uint8Array; disableWorker: boolean }): {
        promise: Promise<PdfDocument>;
      };
    };
    return pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true }).promise;
  }
}

@Injectable()
export class PdfParserService {
  private readonly loader: PdfLoader;
  public constructor(@Optional() @Inject(PDF_LOADER) loader?: PdfLoader) {
    this.loader = loader ?? new PdfJsLoader();
  }

  async extract(buffer: Buffer): Promise<ParsedPdfPage[]> {
    try {
      const pdf = await this.loader.load(buffer);
      const pages: ParsedPdfPage[] = [];
      try {
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          const text = content.items
            .map((item) => (typeof item.str === 'string' ? item.str.trim() : ''))
            .filter((item) => item.length > 0)
            .join(' ');
          pages.push({ pageNumber, text });
        }
        if (pages.length === 0 || pages.every((page) => page.text.length === 0))
          throw new PdfParsingError(
            'OCR_UNSUPPORTED',
            'This PDF has no extractable text and OCR is not enabled.'
          );
        return pages;
      } finally {
        await pdf.destroy?.();
      }
    } catch (error: unknown) {
      if (error instanceof PdfParsingError) throw error;
      throw new PdfParsingError('PDF_PARSE_FAILED', 'The PDF could not be parsed.');
    }
  }
}
