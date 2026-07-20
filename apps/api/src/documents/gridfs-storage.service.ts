import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { GridFSBucket, ObjectId } from 'mongodb';
import type { Connection } from 'mongoose';
import { Readable } from 'node:stream';

@Injectable()
export class GridFsStorageService {
  private readonly bucket: GridFSBucket;
  public constructor(@InjectConnection() connection: Connection, config: ConfigService) {
    if (connection.db === undefined) throw new Error('MongoDB connection is not ready.');
    this.bucket = new GridFSBucket(connection.db, {
      bucketName: config.getOrThrow<string>('GRIDFS_BUCKET_NAME')
    });
  }

  async store(
    buffer: Buffer,
    filename: string,
    checksum: string,
    ownerId: string
  ): Promise<{ id: ObjectId; created: boolean }> {
    const existing = await this.bucket
      .find({ 'metadata.checksum': checksum, 'metadata.ownerId': ownerId })
      .next();
    if (existing !== null) return { id: existing._id, created: false };
    const stream = this.bucket.openUploadStream(filename, {
      metadata: { checksum, ownerId, contentType: 'application/pdf' }
    });
    await new Promise<void>((resolve, reject) => {
      stream.once('error', reject);
      stream.once('finish', resolve);
      Readable.from(buffer).pipe(stream);
    });
    return { id: stream.id, created: true };
  }

  openDownload(id: ObjectId): Readable {
    return this.bucket.openDownloadStream(id);
  }

  async read(id: ObjectId): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const stream = this.openDownload(id);
    for await (const chunk of stream as unknown as AsyncIterable<unknown>) {
      if (Buffer.isBuffer(chunk)) chunks.push(chunk);
      else if (typeof chunk === 'string' || chunk instanceof Uint8Array)
        chunks.push(Buffer.from(chunk));
      else throw new Error('GridFS returned an invalid download chunk.');
    }
    return Buffer.concat(chunks);
  }

  async remove(id: ObjectId): Promise<void> {
    await this.bucket.delete(id);
  }
}
