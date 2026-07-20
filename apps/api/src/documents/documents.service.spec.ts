/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from 'vitest';
import { MongoRuntimeError } from 'mongodb';
import { DocumentsService } from './documents.service.js';

describe('DocumentsService', () => {
  it('chains a published course textbook parse to an embed job keyed by its committed parse token', async () => {
    const enqueued: Array<{ type: string; idempotencyKey: string }> = [];
    const document = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      gridFsFileId: { toString: () => '507f1f77bcf86cd799439013' },
      courseId: 'MLN112',
      status: 'uploaded',
      deletionState: 'active',
      parsedPageToken: null as string | null,
      parsingToken: null as string | null
    };
    const service = new DocumentsService(
      {
        findOne: async () => document,
        findOneAndUpdate: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
          Object.assign(document, update.$set);
          return document;
        },
        updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
          Object.assign(document, update.$set);
          return { matchedCount: 1 };
        }
      } as never,
      { deleteMany: async () => undefined, insertMany: async () => undefined } as never,
      { read: async () => Buffer.from('%PDF-1.7') } as never,
      {
        enqueue: async (input: { type: string; idempotencyKey: string }) => {
          enqueued.push(input);
          return {};
        }
      } as never,
      {} as never
    );

    await expect(
      service.parseDocument('507f1f77bcf86cd799439011', {
        extract: async () => [{ pageNumber: 1, text: 'Project-authored course demo.' }]
      } as never)
    ).resolves.toBe('completed');
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]?.type).toBe('embed_document');
    expect(enqueued[0]?.idempotencyKey).toMatch(/^embed_document:507f1f77bcf86cd799439011:MLN112:/);
  });

  it('rejects a checksum re-upload while the prior document deletion is incomplete', async () => {
    let stores = 0;
    const service = new DocumentsService(
      {
        findOne: () => ({
          select: async () => ({ deletionState: 'deleting' })
        })
      } as never,
      {} as never,
      {
        store: async () => {
          stores += 1;
        }
      } as never,
      {} as never,
      {
        getOrThrow: (key: string) => (key === 'DOCUMENT_MAX_SIZE_MB' ? 1 : 'application/pdf')
      } as never
    );

    await expect(
      service.upload(
        '507f1f77bcf86cd799439012',
        { title: 'Report', type: 'financial_report' },
        {
          buffer: Buffer.from('%PDF-1.7\nreport'),
          originalname: 'report.pdf',
          mimetype: 'application/pdf'
        }
      )
    ).rejects.toMatchObject({ code: 'DOCUMENT_DELETION_IN_PROGRESS', statusCode: 409 });
    expect(stores).toBe(0);
  });

  it('never exposes uncommitted pages when a document has no committed page token', async () => {
    let pageQueries = 0;
    const service = new DocumentsService(
      {
        findOne: async () => ({
          _id: { toString: () => '507f1f77bcf86cd799439011' },
          parsedPageToken: null
        })
      } as never,
      {
        findOne: async () => {
          pageQueries += 1;
          return { pageNumber: 1, text: 'stale', sourceChunkIds: [] };
        }
      } as never,
      {} as never,
      {} as never,
      {} as never
    );

    await expect(
      service.page('507f1f77bcf86cd799439012', '507f1f77bcf86cd799439011', 1)
    ).rejects.toThrow('Document page was not found.');
    expect(pageQueries).toBe(0);
  });

  it('reuses a checksum-backed GridFS file and compensates a new upload when metadata persistence fails', async () => {
    const operations: string[] = [];
    const documents = {
      findOne: async () => null,
      create: async () => {
        throw new Error('metadata down');
      }
    };
    const storage = {
      store: async () => {
        operations.push('store');
        return { id: { toString: () => '507f1f77bcf86cd799439011' }, created: true };
      },
      remove: async () => operations.push('remove')
    };
    const jobs = { enqueue: async () => undefined };
    const service = new DocumentsService(
      documents as never,
      {} as never,
      storage as never,
      jobs as never,
      {
        getOrThrow: (key: string) => (key === 'DOCUMENT_MAX_SIZE_MB' ? 1 : 'application/pdf')
      } as never
    );
    await expect(
      service.upload(
        '507f1f77bcf86cd799439012',
        { title: 'Report', type: 'financial_report' },
        {
          buffer: Buffer.from('%PDF-1.7\nreport'),
          originalname: 'report.pdf',
          mimetype: 'application/pdf'
        }
      )
    ).rejects.toThrow('metadata down');
    expect(operations).toEqual(['store', 'remove']);
  });

  it('atomically deletes an owner document and its owner-scoped GridFS bytes', async () => {
    const operations: string[] = [];
    const document = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      ownerId: { toString: () => '507f1f77bcf86cd799439012' },
      gridFsFileId: { toString: () => '507f1f77bcf86cd799439013' }
    };
    const documents = {
      findOneAndUpdate: async () => document,
      deleteOne: async () => undefined
    };
    const pages = { deleteMany: async () => ({ acknowledged: true }) };
    const storage = { remove: async () => operations.push('remove') };
    const service = new DocumentsService(
      documents as never,
      pages as never,
      storage as never,
      {} as never,
      {
        getOrThrow: (key: string) => (key === 'DOCUMENT_MAX_SIZE_MB' ? 1 : 'application/pdf')
      } as never
    );
    await service.delete('507f1f77bcf86cd799439012', '507f1f77bcf86cd799439011');
    expect(operations).toEqual(['remove']);
  });

  it('keeps a partially deleted document hidden and immediately retryable', async () => {
    const updates: Array<{ $set?: Record<string, unknown> }> = [];
    const document = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      ownerId: { toString: () => '507f1f77bcf86cd799439012' },
      gridFsFileId: { toString: () => '507f1f77bcf86cd799439013' }
    };
    const service = new DocumentsService(
      {
        findOneAndUpdate: async () => document,
        deleteOne: async () => {
          throw new Error('metadata delete unavailable');
        },
        updateOne: async (_filter: unknown, update: { $set?: Record<string, unknown> }) => {
          updates.push(update);
        }
      } as never,
      { deleteMany: async () => undefined } as never,
      { remove: async () => undefined } as never,
      {} as never,
      {} as never
    );

    await expect(
      service.delete('507f1f77bcf86cd799439012', '507f1f77bcf86cd799439011')
    ).rejects.toThrow('metadata delete unavailable');
    expect(updates).toHaveLength(1);
    expect(updates[0]?.$set).not.toHaveProperty('deletionState', 'active');
    expect(updates[0]?.$set?.['deletionClaimedAt']).toEqual(new Date(0));
  });

  it('treats the MongoDB driver missing-file error as an idempotent delete retry', async () => {
    let metadataDeletes = 0;
    const service = new DocumentsService(
      {
        findOneAndUpdate: async () => ({
          _id: { toString: () => '507f1f77bcf86cd799439011' },
          gridFsFileId: { toString: () => '507f1f77bcf86cd799439013' }
        }),
        deleteOne: async () => {
          metadataDeletes += 1;
        },
        updateOne: async () => undefined
      } as never,
      { deleteMany: async () => undefined } as never,
      {
        remove: async () => {
          throw new MongoRuntimeError('File not found for id 507f1f77bcf86cd799439013');
        }
      } as never,
      {} as never,
      {} as never
    );

    await expect(
      service.delete('507f1f77bcf86cd799439012', '507f1f77bcf86cd799439011')
    ).resolves.toBeUndefined();
    expect(metadataDeletes).toBe(1);
  });

  it('retains metadata and bytes with an actionable status when job enqueue fails after persistence', async () => {
    const operations: string[] = [];
    const document = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      title: 'Report',
      type: 'financial_report',
      status: 'uploaded',
      mimeType: 'application/pdf',
      originalFileName: 'report.pdf',
      byteSize: 20,
      checksum: 'a'.repeat(64),
      pageCount: 0,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const documents = {
      findOne: async () => null,
      create: async () => document,
      updateOne: async () => operations.push('failed')
    };
    const storage = {
      store: async () => ({ id: { toString: () => '507f1f77bcf86cd799439013' }, created: true }),
      remove: async () => operations.push('bytes')
    };
    const service = new DocumentsService(
      documents as never,
      {} as never,
      storage as never,
      {
        enqueue: async () => {
          throw new Error('queue unavailable');
        }
      } as never,
      {
        getOrThrow: (key: string) => (key === 'DOCUMENT_MAX_SIZE_MB' ? 1 : 'application/pdf')
      } as never
    );
    await expect(
      service.upload(
        '507f1f77bcf86cd799439012',
        { title: 'Report', type: 'financial_report' },
        {
          buffer: Buffer.from('%PDF-1.7\nreport'),
          originalname: 'report.pdf',
          mimetype: 'application/pdf'
        }
      )
    ).resolves.toMatchObject({ status: 'failed', errorCode: 'JOB_ENQUEUE_FAILED' });
    expect(operations).toEqual(['failed']);
  });

  it('requeues a failed parse job when the owner uploads the same PDF again', async () => {
    const requeued: string[] = [];
    const document = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      title: 'Report',
      type: 'financial_report',
      status: 'failed',
      deletionState: 'active',
      mimeType: 'application/pdf',
      originalFileName: 'report.pdf',
      byteSize: 15,
      checksum: 'dc129080e9f355436bf308f3357c4364b6d40b9b9c28f74af0af82bf112f0e2c',
      pageCount: 0,
      errorCode: 'PDF_PARSE_FAILED' as string | null,
      errorMessage: 'The PDF could not be parsed.' as string | null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const service = new DocumentsService(
      {
        findOne: () => ({ select: async () => document }),
        updateOne: async () => {
          document.status = 'uploaded';
          document.errorCode = null;
          document.errorMessage = null;
          return { matchedCount: 1 };
        }
      } as never,
      {} as never,
      {} as never,
      {
        enqueue: async () => ({
          _id: { toString: () => '507f1f77bcf86cd799439014' },
          status: 'failed'
        }),
        requeueFailed: async (id: string) => requeued.push(id)
      } as never,
      {
        getOrThrow: (key: string) => (key === 'DOCUMENT_MAX_SIZE_MB' ? 1 : 'application/pdf')
      } as never
    );

    await expect(
      service.upload(
        '507f1f77bcf86cd799439012',
        { title: 'Report', type: 'financial_report' },
        {
          buffer: Buffer.from('%PDF-1.7\nreport'),
          originalname: 'report.pdf',
          mimetype: 'application/pdf'
        }
      )
    ).resolves.toMatchObject({ status: 'uploaded', errorCode: null, errorMessage: null });
    expect(requeued).toEqual(['507f1f77bcf86cd799439014']);
  });

  it('never compensates bytes reused by a concurrent checksum winner', async () => {
    const operations: string[] = [];
    const duplicate = Object.assign(new Error('duplicate'), { code: 11000 });
    const documents = {
      findOne: async () => null,
      create: async () => {
        throw duplicate;
      }
    };
    const storage = {
      store: async () => ({ id: { toString: () => '507f1f77bcf86cd799439013' }, created: false }),
      remove: async () => operations.push('bytes')
    };
    const service = new DocumentsService(
      documents as never,
      {} as never,
      storage as never,
      {} as never,
      {
        getOrThrow: (key: string) => (key === 'DOCUMENT_MAX_SIZE_MB' ? 1 : 'application/pdf')
      } as never
    );
    await expect(
      service.upload(
        '507f1f77bcf86cd799439012',
        { title: 'Report', type: 'financial_report' },
        {
          buffer: Buffer.from('%PDF-1.7\nreport'),
          originalname: 'report.pdf',
          mimetype: 'application/pdf'
        }
      )
    ).rejects.toThrow('duplicate');
    expect(operations).toEqual([]);
  });

  it('does not remove a newly stored GridFS file adopted by the metadata race winner', async () => {
    const operations: string[] = [];
    const fileId = { toString: () => '507f1f77bcf86cd799439013' };
    const winner = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      gridFsFileId: fileId,
      title: 'Winner',
      type: 'financial_report',
      status: 'uploaded',
      mimeType: 'application/pdf',
      originalFileName: 'report.pdf',
      byteSize: 20,
      checksum: 'a'.repeat(64),
      pageCount: 0,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    let lookupCount = 0;
    const duplicate = Object.assign(new Error('duplicate'), { code: 11000 });
    const service = new DocumentsService(
      {
        findOne: () => {
          lookupCount += 1;
          const value = lookupCount === 1 ? null : winner;
          return { select: async () => value };
        },
        create: async () => {
          throw duplicate;
        }
      } as never,
      {} as never,
      {
        store: async () => ({ id: fileId, created: true }),
        remove: async () => operations.push('remove')
      } as never,
      { enqueue: async () => ({ status: 'queued' }) } as never,
      {
        getOrThrow: (key: string) => (key === 'DOCUMENT_MAX_SIZE_MB' ? 1 : 'application/pdf')
      } as never
    );

    await expect(
      service.upload(
        '507f1f77bcf86cd799439012',
        { title: 'Report', type: 'financial_report' },
        {
          buffer: Buffer.from('%PDF-1.7\nreport'),
          originalname: 'report.pdf',
          mimetype: 'application/pdf'
        }
      )
    ).resolves.toMatchObject({ id: '507f1f77bcf86cd799439011' });
    expect(operations).toEqual([]);
  });

  it('persists ordered pages once and skips an idempotent parser rerun', async () => {
    const updates: unknown[] = [];
    const inserted: unknown[] = [];
    const document = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      gridFsFileId: { toString: () => '507f1f77bcf86cd799439013' },
      status: 'uploaded'
    };
    let claim = true;
    const documents = {
      findOne: async () => document,
      findOneAndUpdate: async () => (claim ? document : null),
      updateOne: async (...args: unknown[]) => {
        updates.push(args);
        return { matchedCount: 1 };
      }
    };
    const pages = {
      deleteMany: async () => undefined,
      insertMany: async (items: unknown[]) => inserted.push(...items)
    };
    const service = new DocumentsService(
      documents as never,
      pages as never,
      {
        read: async () => Buffer.from('%PDF-1.7')
      } as never,
      {} as never,
      {} as never
    );
    const parser = {
      extract: async () => [
        { pageNumber: 1, text: 'first' },
        { pageNumber: 2, text: 'second' }
      ]
    };
    await service.parseDocument('507f1f77bcf86cd799439011', parser as never);
    claim = false;
    await service.parseDocument('507f1f77bcf86cd799439011', parser as never);
    expect(inserted).toMatchObject([
      { pageNumber: 1, text: 'first' },
      { pageNumber: 2, text: 'second' }
    ]);
    expect(updates).toHaveLength(1);
  });

  it('removes stale token pages only after publishing the new parse winner', async () => {
    const document = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      gridFsFileId: { toString: () => '507f1f77bcf86cd799439013' },
      status: 'failed',
      deletionState: 'active',
      parsedPageToken: 'crashed-token',
      parsingToken: null as string | null
    };
    const pages = [
      { parseToken: 'crashed-token', pageNumber: 1, text: 'orphan from crashed worker' }
    ];
    const service = new DocumentsService(
      {
        findOne: async () => document,
        findOneAndUpdate: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
          Object.assign(document, update.$set);
          return document;
        },
        updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
          Object.assign(document, update.$set);
          return { matchedCount: 1 };
        }
      } as never,
      {
        deleteMany: async (filter: { parseToken: string | { $ne: string } }) => {
          const parseToken = filter.parseToken;
          const keep =
            typeof parseToken === 'string'
              ? (token: string) => token !== parseToken
              : (token: string) => token === parseToken.$ne;
          for (let index = pages.length - 1; index >= 0; index -= 1) {
            if (!keep(pages[index]?.parseToken ?? '')) pages.splice(index, 1);
          }
        },
        insertMany: async (items: typeof pages) => pages.push(...items)
      } as never,
      { read: async () => Buffer.from('%PDF-1.7') } as never,
      {} as never,
      {} as never
    );

    await expect(
      service.parseDocument('507f1f77bcf86cd799439011', {
        extract: async () => [{ pageNumber: 1, text: 'winner' }]
      } as never)
    ).resolves.toBe('completed');
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ text: 'winner', parseToken: document.parsedPageToken });
  });

  it('never rolls back winner pages when post-publish orphan cleanup fails', async () => {
    const document = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      gridFsFileId: { toString: () => '507f1f77bcf86cd799439013' },
      status: 'failed',
      deletionState: 'active',
      parsedPageToken: 'old-token',
      parsingToken: null as string | null
    };
    const pages = [{ parseToken: 'old-token', pageNumber: 1, text: 'orphan' }];
    let cleanupFails = true;
    const service = new DocumentsService(
      {
        findOne: async () => document,
        findOneAndUpdate: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
          Object.assign(document, update.$set);
          return document;
        },
        updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
          Object.assign(document, update.$set);
          return { matchedCount: 1 };
        }
      } as never,
      {
        deleteMany: async (filter: { parseToken: string | { $ne: string } }) => {
          if (typeof filter.parseToken !== 'string' && cleanupFails)
            throw new Error('cleanup unavailable');
          for (let index = pages.length - 1; index >= 0; index -= 1) {
            const token = pages[index]?.parseToken;
            const matches =
              typeof filter.parseToken === 'string'
                ? token === filter.parseToken
                : token !== filter.parseToken.$ne;
            if (matches) pages.splice(index, 1);
          }
        },
        insertMany: async (items: typeof pages) => pages.push(...items)
      } as never,
      { read: async () => Buffer.from('%PDF-1.7') } as never,
      {} as never,
      {} as never
    );

    await expect(
      service.parseDocument('507f1f77bcf86cd799439011', {
        extract: async () => [{ pageNumber: 1, text: 'winner' }]
      } as never)
    ).rejects.toThrow('cleanup unavailable');
    expect(document.status).toBe('parsed');
    expect(pages.some((page) => page.text === 'winner')).toBe(true);

    cleanupFails = false;
    await expect(
      service.parseDocument('507f1f77bcf86cd799439011', {
        extract: async () => {
          throw new Error('already-complete retries must not parse again');
        }
      } as never)
    ).resolves.toBe('already-complete');
    expect(pages).toEqual([
      expect.objectContaining({ text: 'winner', parseToken: document.parsedPageToken })
    ]);
  });

  it('preserves possibly published pages when the final CAS acknowledgement is lost', async () => {
    const document = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      gridFsFileId: { toString: () => '507f1f77bcf86cd799439013' },
      status: 'uploaded',
      deletionState: 'active',
      parsedPageToken: null as string | null,
      parsingToken: null as string | null
    };
    const pages: Array<{ parseToken: string; pageNumber: number; text: string }> = [];
    let updateCount = 0;
    const service = new DocumentsService(
      {
        findOne: async () => document,
        findOneAndUpdate: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
          Object.assign(document, update.$set);
          return document;
        },
        updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
          updateCount += 1;
          if (updateCount === 1) {
            Object.assign(document, update.$set);
            throw new Error('final CAS acknowledgement lost');
          }
          return { matchedCount: 0 };
        }
      } as never,
      {
        deleteMany: async (filter: { parseToken: string }) => {
          for (let index = pages.length - 1; index >= 0; index -= 1) {
            if (pages[index]?.parseToken === filter.parseToken) pages.splice(index, 1);
          }
        },
        insertMany: async (items: typeof pages) => pages.push(...items)
      } as never,
      { read: async () => Buffer.from('%PDF-1.7') } as never,
      {} as never,
      {} as never
    );

    await expect(
      service.parseDocument('507f1f77bcf86cd799439011', {
        extract: async () => [{ pageNumber: 1, text: 'possibly committed winner' }]
      } as never)
    ).rejects.toThrow('final CAS acknowledgement lost');
    expect(document.status).toBe('parsed');
    expect(pages).toEqual([expect.objectContaining({ text: 'possibly committed winner' })]);
  });

  it('persists OCR_UNSUPPORTED without deleting another parser pages when extraction fails before writes', async () => {
    const updates: unknown[] = [];
    const removals: unknown[] = [];
    const document = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      gridFsFileId: { toString: () => '507f1f77bcf86cd799439013' },
      status: 'uploaded'
    };
    const documents = {
      findOne: async () => document,
      findOneAndUpdate: async () => document,
      updateOne: async (...args: unknown[]) => updates.push(args)
    };
    const pages = { deleteMany: async (...args: unknown[]) => removals.push(args) };
    const service = new DocumentsService(
      documents as never,
      pages as never,
      {
        read: async () => Buffer.from('%PDF-1.7')
      } as never,
      {} as never,
      {} as never
    );
    const error = Object.assign(new Error('OCR unavailable'), {
      code: 'OCR_UNSUPPORTED',
      name: 'PdfParsingError'
    });
    await expect(
      service.parseDocument('507f1f77bcf86cd799439011', {
        extract: async () => {
          throw error;
        }
      } as never)
    ).rejects.toThrow('OCR unavailable');
    expect(removals).toHaveLength(0);
    expect(updates).toHaveLength(1);
  });

  it('does not let a stale parser erase pages committed by a reclaimed parser', async () => {
    const document = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      gridFsFileId: { toString: () => '507f1f77bcf86cd799439013' },
      status: 'uploaded',
      deletionState: 'active',
      parsingStartedAt: null as Date | null,
      parsingToken: null as string | null
    };
    const pages: Array<{ parseToken: string; pageNumber: number; text: string }> = [];
    let releaseFirstExtraction: (() => void) | undefined;
    const firstExtraction = new Promise<void>((resolve) => {
      releaseFirstExtraction = resolve;
    });
    const documents = {
      findOne: async () => document,
      findOneAndUpdate: async (
        filter: Record<string, unknown>,
        update: { $set: Record<string, unknown> }
      ) => {
        const expectedToken = filter['parsingToken'];
        if (expectedToken !== undefined && expectedToken !== document.parsingToken) return null;
        if (filter['status'] === 'parsing' && document.status !== 'parsing') return null;
        Object.assign(document, update.$set);
        return document;
      },
      updateOne: async (
        filter: Record<string, unknown>,
        update: { $set: Record<string, unknown> }
      ) => {
        if (
          filter['parsingToken'] !== undefined &&
          filter['parsingToken'] !== document.parsingToken
        )
          return { matchedCount: 0 };
        Object.assign(document, update.$set);
        return { matchedCount: 1 };
      }
    };
    const pageStore = {
      deleteMany: async (filter: { parseToken: string | { $ne: string } }) => {
        for (let index = pages.length - 1; index >= 0; index -= 1) {
          const token = pages[index]?.parseToken;
          const matches =
            typeof filter.parseToken === 'string'
              ? token === filter.parseToken
              : token !== filter.parseToken.$ne;
          if (matches) pages.splice(index, 1);
        }
      },
      insertMany: async (items: Array<{ parseToken: string; pageNumber: number; text: string }>) =>
        pages.push(...items)
    };
    const service = new DocumentsService(
      documents as never,
      pageStore as never,
      { read: async () => Buffer.from('%PDF-1.7') } as never,
      {} as never,
      {} as never
    );

    const firstRun = service.parseDocument('507f1f77bcf86cd799439011', {
      extract: async () => {
        await firstExtraction;
        return [{ pageNumber: 1, text: 'stale worker' }];
      }
    } as never);
    await Promise.resolve();
    document.parsingStartedAt = new Date(Date.now() - 31_000);
    const winner = await service.parseDocument('507f1f77bcf86cd799439011', {
      extract: async () => [{ pageNumber: 1, text: 'winner' }]
    } as never);
    releaseFirstExtraction?.();
    const staleResult = await firstRun;

    expect(winner).toBe('completed');
    expect(staleResult).toBe('busy');
    expect(pages).toMatchObject([{ text: 'winner' }]);
  });

  it('removes only its token-scoped pages when the final parse CAS loses its lease', async () => {
    const document = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      gridFsFileId: { toString: () => '507f1f77bcf86cd799439013' },
      status: 'uploaded',
      deletionState: 'active',
      parsingToken: null as string | null
    };
    const pages: Array<{ parseToken: string; pageNumber: number; text: string }> = [];
    let claimCount = 0;
    const service = new DocumentsService(
      {
        findOne: async () => document,
        findOneAndUpdate: async (
          _filter: Record<string, unknown>,
          update: { $set: Record<string, unknown> }
        ) => {
          claimCount += 1;
          Object.assign(document, update.$set);
          return document;
        },
        updateOne: async () => ({ matchedCount: 0 })
      } as never,
      {
        deleteMany: async (filter: { parseToken: string }) => {
          for (let index = pages.length - 1; index >= 0; index -= 1) {
            if (pages[index]?.parseToken === filter.parseToken) pages.splice(index, 1);
          }
        },
        insertMany: async (
          items: Array<{ parseToken: string; pageNumber: number; text: string }>
        ) => pages.push(...items)
      } as never,
      { read: async () => Buffer.from('%PDF-1.7') } as never,
      {} as never,
      {} as never
    );

    await expect(
      service.parseDocument('507f1f77bcf86cd799439011', {
        extract: async () => [{ pageNumber: 1, text: 'loser' }]
      } as never)
    ).resolves.toBe('busy');
    expect(claimCount).toBe(2);
    expect(pages).toEqual([]);
  });

  it('reports an active parse lease as busy, then reclaims it after the worker lease window', async () => {
    const document = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      gridFsFileId: { toString: () => '507f1f77bcf86cd799439013' },
      status: 'parsing',
      deletionState: 'active',
      parsingStartedAt: new Date(),
      parsingToken: 'active-claim'
    };
    let claims = 0;
    const documents = {
      findOne: async () => document,
      findOneAndUpdate: async (
        filter: Record<string, unknown>,
        update: { $set: Record<string, unknown> }
      ) => {
        const staleThreshold = (filter['$or'] as Array<Record<string, unknown>> | undefined)?.[1]?.[
          'parsingStartedAt'
        ] as { $lte?: Date } | undefined;
        if (staleThreshold?.$lte !== undefined && document.parsingStartedAt > staleThreshold.$lte)
          return null;
        claims += 1;
        Object.assign(document, update.$set);
        return document;
      },
      updateOne: async () => ({ matchedCount: 1 })
    };
    const service = new DocumentsService(
      documents as never,
      { deleteMany: async () => undefined, insertMany: async () => undefined } as never,
      { read: async () => Buffer.from('%PDF-1.7') } as never,
      {} as never,
      {} as never
    );

    await expect(
      service.parseDocument('507f1f77bcf86cd799439011', {
        extract: async () => [{ pageNumber: 1, text: 'recovered' }]
      } as never)
    ).resolves.toBe('busy');
    document.parsingStartedAt = new Date(Date.now() - 31_000);
    await expect(
      service.parseDocument('507f1f77bcf86cd799439011', {
        extract: async () => [{ pageNumber: 1, text: 'recovered' }]
      } as never)
    ).resolves.toBe('completed');
    expect(claims).toBeGreaterThanOrEqual(2);
  });
});
