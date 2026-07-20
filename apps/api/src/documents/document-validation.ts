import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';

export class DocumentValidationError extends Error {
  public constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'DocumentValidationError';
  }
}

export interface PdfUploadCandidate {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  maxBytes: number;
  allowedMimeTypes: readonly string[];
}

export interface ValidatedPdfUpload {
  buffer: Buffer;
  filename: string;
  checksum: string;
  mimeType: 'application/pdf';
  byteSize: number;
}

export function validatePdfUpload(candidate: PdfUploadCandidate): ValidatedPdfUpload {
  if (candidate.buffer.length === 0)
    throw new DocumentValidationError('EMPTY_FILE', 'The uploaded file is empty.');
  if (candidate.buffer.length > candidate.maxBytes)
    throw new DocumentValidationError(
      'FILE_TOO_LARGE',
      'The uploaded file exceeds the configured limit.'
    );
  if (extname(candidate.originalname).toLowerCase() !== '.pdf')
    throw new DocumentValidationError('INVALID_EXTENSION', 'Only .pdf files are accepted.');
  if (
    !candidate.allowedMimeTypes.includes(candidate.mimetype) ||
    candidate.mimetype !== 'application/pdf'
  )
    throw new DocumentValidationError(
      'INVALID_MIME_TYPE',
      'The declared MIME type must be application/pdf.'
    );
  if (!candidate.buffer.subarray(0, 5).equals(Buffer.from('%PDF-')))
    throw new DocumentValidationError('INVALID_PDF_SIGNATURE', 'The uploaded file is not a PDF.');
  const filename = sanitizeFilename(candidate.originalname);
  return {
    buffer: candidate.buffer,
    filename,
    checksum: createHash('sha256').update(candidate.buffer).digest('hex'),
    mimeType: 'application/pdf',
    byteSize: candidate.buffer.length
  };
}

export function sanitizeFilename(value: string): string {
  const base = basename(value.replaceAll('\\', '/'));
  const normalized = base
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._ -]/gu, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_ .]+|[_ .]+$/g, '');
  const withFallback = normalized.length === 0 ? 'document.pdf' : normalized;
  const extension = extname(withFallback).toLowerCase();
  const stem = (extension === '.pdf' ? withFallback.slice(0, -extension.length) : withFallback)
    .replace(/[_ .]+$/g, '')
    .slice(0, 251);
  return `${stem || 'document'}.pdf`;
}
