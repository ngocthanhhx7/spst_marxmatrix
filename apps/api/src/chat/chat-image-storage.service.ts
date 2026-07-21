import { Injectable } from '@nestjs/common';
import { CHAT_MAX_IMAGE_BYTES } from '@marxmatrix/contracts';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { GridFSBucket, MongoRuntimeError, ObjectId } from 'mongodb';
import type { Connection } from 'mongoose';
import { basename } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DomainError } from '../common/domain-error.js';
import type { ChatImageMimeType } from './chat-image-validation.js';

export interface ChatImageStoreInput {
  ownerId: string;
  checksum: string;
  originalFileName: string;
  mimeType: ChatImageMimeType;
  buffer: Buffer;
}

@Injectable()
export class ChatImageStorageService {
  private readonly bucket: GridFSBucket;

  public constructor(@InjectConnection() connection: Connection, config: ConfigService) {
    if (connection.db === undefined) throw new Error('MongoDB connection is not ready.');
    const baseBucketName = config.getOrThrow<string>('GRIDFS_BUCKET_NAME');
    this.bucket = new GridFSBucket(connection.db, { bucketName: `${baseBucketName}_chat` });
  }

  public async store(input: ChatImageStoreInput): Promise<{ id: ObjectId }> {
    if (input.buffer.length === 0 || input.buffer.length > CHAT_MAX_IMAGE_BYTES)
      throw new DomainError(
        'CHAT_IMAGE_INVALID',
        'The image bytes are empty or exceed the configured limit.',
        400
      );
    const filename = basename(input.originalFileName.replaceAll('\\', '/'));
    const stream = this.bucket.openUploadStream(filename, {
      metadata: {
        ownerId: input.ownerId,
        checksum: input.checksum,
        contentType: input.mimeType
      }
    });
    try {
      await pipeline(Readable.from(input.buffer), stream);
    } catch (error) {
      await this.cleanupPartialUpload(stream.id);
      throw error;
    }
    return { id: stream.id };
  }

  public async read(id: ObjectId): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let byteSize = 0;
    const stream = this.bucket.openDownloadStream(id);
    for await (const chunk of stream as unknown as AsyncIterable<unknown>) {
      let buffer: Buffer;
      if (Buffer.isBuffer(chunk)) buffer = chunk;
      else if (typeof chunk === 'string' || chunk instanceof Uint8Array) buffer = Buffer.from(chunk);
      else {
        stream.destroy();
        throw new Error('GridFS returned an invalid download chunk.');
      }
      byteSize += buffer.length;
      if (byteSize > CHAT_MAX_IMAGE_BYTES) {
        stream.destroy();
        throw new DomainError(
          'CHAT_IMAGE_INVALID',
          'The stored image exceeds the configured limit.',
          400
        );
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  }

  public async remove(id: ObjectId): Promise<void> {
    try {
      await this.bucket.delete(id);
    } catch (error) {
      if (!isMissingGridFsFile(error)) throw error;
    }
  }

  private async cleanupPartialUpload(id: ObjectId): Promise<void> {
    try {
      await this.bucket.delete(id);
    } catch {
      // GridFS deletes orphan chunks before reporting a missing files document. Cleanup is best effort
      // so any cleanup error must not replace the original upload failure.
    }
  }
}

function isMissingGridFsFile(error: unknown): boolean {
  return error instanceof MongoRuntimeError && /^File not found for id /.test(error.message);
}
