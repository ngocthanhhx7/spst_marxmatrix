import {
  CHAT_MAX_IMAGE_BYTES,
  CHAT_MAX_IMAGES,
  CHAT_MAX_MULTIPART_BYTES
} from '@marxmatrix/contracts';
import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';
import sharp from 'sharp';
import { DomainError } from '../common/domain-error.js';

export type ChatImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ChatImageUploadCandidate {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export interface ValidatedChatImage {
  buffer: Buffer;
  originalFileName: string;
  mimeType: ChatImageMimeType;
  byteSize: number;
  checksum: string;
}

export const CHAT_MAX_IMAGE_PIXELS = 25_000_000;

const signatures: Record<ChatImageMimeType, (value: Buffer) => boolean> = {
  'image/jpeg': (value) =>
    value.length >= 3 && value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff,
  'image/png': (value) =>
    value.length >= 8 &&
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).equals(
      value.subarray(0, 8)
    ),
  'image/webp': (value) =>
    value.length >= 12 &&
    value.subarray(0, 4).toString('ascii') === 'RIFF' &&
    value.subarray(8, 12).toString('ascii') === 'WEBP'
};

const allowedExtensions: Record<ChatImageMimeType, readonly string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp']
};

const decoderFormats: Record<ChatImageMimeType, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function invalid(message: string): never {
  throw new DomainError('CHAT_IMAGE_INVALID', message, 400);
}

function isChatImageMimeType(value: string): value is ChatImageMimeType {
  return Object.hasOwn(signatures, value);
}

function sanitizeFileName(value: string): string {
  const normalized = value.normalize('NFKC');
  if (/\p{Cc}|[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(normalized))
    invalid('The image filename contains unsafe formatting characters.');
  const safeName = basename(normalized.replaceAll('\\', '/'));
  if (safeName.length === 0 || safeName.length > 255) invalid('The image filename is invalid.');
  return safeName;
}

async function verifyImageDecode(buffer: Buffer, mimeType: ChatImageMimeType): Promise<void> {
  try {
    const decoder = sharp(buffer, {
      failOn: 'warning',
      limitInputPixels: CHAT_MAX_IMAGE_PIXELS,
      sequentialRead: true
    });
    const [metadata] = await Promise.all([decoder.metadata(), decoder.clone().stats()]);
    if (metadata.format !== decoderFormats[mimeType])
      invalid('The decoded image format does not match its MIME type.');
  } catch (error) {
    if (error instanceof DomainError) throw error;
    invalid('The uploaded image could not be decoded safely.');
  }
}

export async function validateChatImages(
  files: readonly ChatImageUploadCandidate[]
): Promise<ValidatedChatImage[]> {
  if (files.length > CHAT_MAX_IMAGES)
    invalid(`A message may contain at most ${CHAT_MAX_IMAGES} images.`);

  const totalBytes = files.reduce((sum, file) => sum + file.buffer.length, 0);
  if (totalBytes > CHAT_MAX_MULTIPART_BYTES)
    invalid('The complete image upload exceeds the configured limit.');

  return Promise.all(files.map(async (file) => {
    if (file.buffer.length === 0 || file.buffer.length > CHAT_MAX_IMAGE_BYTES)
      invalid('An uploaded image is empty or exceeds the configured limit.');
    if (!isChatImageMimeType(file.mimetype) || !signatures[file.mimetype](file.buffer))
      invalid('The image MIME type does not match its content.');

    const originalFileName = sanitizeFileName(file.originalname);
    const extension = extname(originalFileName).toLowerCase();
    if (!allowedExtensions[file.mimetype].includes(extension))
      invalid('The image filename extension does not match its MIME type.');

    await verifyImageDecode(file.buffer, file.mimetype);

    return {
      buffer: file.buffer,
      originalFileName,
      mimeType: file.mimetype,
      byteSize: file.buffer.length,
      checksum: createHash('sha256').update(file.buffer).digest('hex')
    };
  }));
}
