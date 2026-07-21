import type { ConfigService } from '@nestjs/config';
import { CHAT_MAX_IMAGE_BYTES } from '@marxmatrix/contracts';
import { MongoRuntimeError, ObjectId } from 'mongodb';
import type { Connection } from 'mongoose';
import { Readable, Writable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatImageStorageService } from './chat-image-storage.service.js';

const gridFs = vi.hoisted(() => ({
  bucketName: undefined as string | undefined,
  filename: undefined as string | undefined,
  uploadOptions: undefined as { metadata?: unknown } | undefined,
  uploadedBytes: Buffer.alloc(0),
  uploadId: undefined as ObjectId | undefined,
  uploadCalls: 0,
  downloadChunks: [] as Buffer[],
  uploadError: undefined as Error | undefined,
  persistBeforeUploadError: false,
  deleteError: undefined as Error | undefined,
  deletedIds: [] as ObjectId[]
}));

vi.mock('mongodb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongodb')>();

  class GridFSBucketMock {
    public constructor(_database: unknown, options: { bucketName?: string }) {
      gridFs.bucketName = options.bucketName;
    }

    public openUploadStream(filename: string, options: { metadata?: unknown }) {
      gridFs.filename = filename;
      gridFs.uploadOptions = options;
      gridFs.uploadCalls += 1;
      const id = new actual.ObjectId();
      gridFs.uploadId = id;
      const chunks: Buffer[] = [];
      const stream = new Writable({
        write(chunk: Buffer, _encoding, callback) {
          if (gridFs.uploadError) {
            if (gridFs.persistBeforeUploadError) chunks.push(Buffer.from(chunk));
            gridFs.uploadedBytes = Buffer.concat(chunks);
            callback(gridFs.uploadError);
          }
          else {
            chunks.push(Buffer.from(chunk));
            callback();
          }
        },
        final(callback) {
          gridFs.uploadedBytes = Buffer.concat(chunks);
          callback();
        }
      });
      return Object.assign(stream, { id });
    }

    public openDownloadStream() {
      return Readable.from(gridFs.downloadChunks);
    }

    public delete(id: ObjectId): Promise<void> {
      gridFs.deletedIds.push(id);
      if (gridFs.deleteError) return Promise.reject(gridFs.deleteError);
      return Promise.resolve();
    }
  }

  return { ...actual, GridFSBucket: GridFSBucketMock };
});

const connection = { db: {} } as Connection;
const config = {
  getOrThrow: vi.fn((key: string) => {
    if (key !== 'GRIDFS_BUCKET_NAME') throw new Error(`Unexpected config key: ${key}`);
    return 'uploads';
  })
} as unknown as ConfigService;

describe('ChatImageStorageService', () => {
  beforeEach(() => {
    gridFs.bucketName = undefined;
    gridFs.filename = undefined;
    gridFs.uploadOptions = undefined;
    gridFs.uploadedBytes = Buffer.alloc(0);
    gridFs.uploadId = undefined;
    gridFs.uploadCalls = 0;
    gridFs.downloadChunks = [];
    gridFs.uploadError = undefined;
    gridFs.persistBeforeUploadError = false;
    gridFs.deleteError = undefined;
    gridFs.deletedIds = [];
  });

  it('uses a separate private chat bucket and records only redacted metadata', async () => {
    const service = new ChatImageStorageService(connection, config);
    const buffer = Buffer.from('bytes');
    const stored = await service.store({
      ownerId: '507f1f77bcf86cd799439011',
      checksum: 'a'.repeat(64),
      originalFileName: '../chart.png',
      mimeType: 'image/png',
      buffer
    });

    expect(stored.id).toBeInstanceOf(ObjectId);
    expect(gridFs.bucketName).toBe('uploads_chat');
    expect(gridFs.filename).toBe('chart.png');
    expect(gridFs.uploadedBytes).toEqual(buffer);
    expect(gridFs.uploadOptions?.metadata).toEqual({
      ownerId: '507f1f77bcf86cd799439011',
      checksum: 'a'.repeat(64),
      contentType: 'image/png'
    });
  });

  it('reads all download chunks into a buffer', async () => {
    gridFs.downloadChunks = [Buffer.from('private '), Buffer.from('bytes')];
    const service = new ChatImageStorageService(connection, config);

    await expect(service.read(new ObjectId())).resolves.toEqual(Buffer.from('private bytes'));
  });

  it('treats the exact GridFS missing-file error as success during removal', async () => {
    gridFs.deleteError = new MongoRuntimeError('File not found for id 507f1f77bcf86cd799439011');
    const service = new ChatImageStorageService(connection, config);

    await expect(service.remove(new ObjectId())).resolves.toBeUndefined();
  });

  it('propagates unrelated removal errors', async () => {
    const failure = new Error('File not found for id but not from MongoDB');
    gridFs.deleteError = failure;
    const service = new ChatImageStorageService(connection, config);

    await expect(service.remove(new ObjectId())).rejects.toBe(failure);
  });

  it('propagates upload stream errors', async () => {
    gridFs.uploadError = new Error('upload failed');
    const service = new ChatImageStorageService(connection, config);

    await expect(
      service.store({
        ownerId: '507f1f77bcf86cd799439011',
        checksum: 'a'.repeat(64),
        originalFileName: 'chart.png',
        mimeType: 'image/png',
        buffer: Buffer.from('bytes')
      })
    ).rejects.toThrow('upload failed');
  });

  it('cleans partial GridFS chunks without replacing the original upload error', async () => {
    const failure = new Error('original upload failure');
    gridFs.uploadError = failure;
    gridFs.persistBeforeUploadError = true;
    gridFs.deleteError = new MongoRuntimeError(
      'File not found for id 507f1f77bcf86cd799439011'
    );
    const service = new ChatImageStorageService(connection, config);

    await expect(
      service.store({
        ownerId: '507f1f77bcf86cd799439011',
        checksum: 'a'.repeat(64),
        originalFileName: 'chart.png',
        mimeType: 'image/png',
        buffer: Buffer.from('partially persisted bytes')
      })
    ).rejects.toBe(failure);
    expect(gridFs.uploadedBytes.length).toBeGreaterThan(0);
    expect(gridFs.deletedIds).toEqual([gridFs.uploadId]);
  });

  it('rejects storing an image above the byte limit before opening an upload', async () => {
    const service = new ChatImageStorageService(connection, config);

    await expect(
      service.store({
        ownerId: '507f1f77bcf86cd799439011',
        checksum: 'a'.repeat(64),
        originalFileName: 'chart.png',
        mimeType: 'image/png',
        buffer: Buffer.alloc(CHAT_MAX_IMAGE_BYTES + 1)
      })
    ).rejects.toMatchObject({ code: 'CHAT_IMAGE_INVALID' });
    expect(gridFs.uploadCalls).toBe(0);
  });

  it('aborts a download once accumulated bytes exceed the image limit', async () => {
    gridFs.downloadChunks = [
      Buffer.alloc(Math.ceil(CHAT_MAX_IMAGE_BYTES / 2)),
      Buffer.alloc(Math.ceil(CHAT_MAX_IMAGE_BYTES / 2) + 1)
    ];
    const service = new ChatImageStorageService(connection, config);

    await expect(service.read(new ObjectId())).rejects.toMatchObject({
      code: 'CHAT_IMAGE_INVALID'
    });
  });
});
