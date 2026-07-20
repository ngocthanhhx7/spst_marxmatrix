import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoCorpusBootstrap } from './demo-corpus.bootstrap.js';

const query = <T>(value: T) => ({ exec: vi.fn().mockResolvedValue(value) });

describe('DemoCorpusBootstrap', () => {
  const config = { get: vi.fn() };
  const storage = { store: vi.fn() };
  const documents = { findOneAndUpdate: vi.fn() };
  const pages = { findOneAndUpdate: vi.fn(), deleteMany: vi.fn() };
  const chunks = { findOneAndUpdate: vi.fn(), deleteMany: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    config.get.mockReturnValue(false);
    storage.store.mockResolvedValue({ id: new Types.ObjectId(), created: true });
    documents.findOneAndUpdate.mockReturnValue(query({ _id: new Types.ObjectId() }));
    pages.findOneAndUpdate.mockImplementation(() => query({ _id: new Types.ObjectId() }));
    chunks.findOneAndUpdate.mockImplementation(() => query({ _id: new Types.ObjectId() }));
    pages.deleteMany.mockReturnValue(query({ acknowledged: true }));
    chunks.deleteMany.mockReturnValue(query({ acknowledged: true }));
  });

  it('does not write a demo corpus when demo mode is disabled', async () => {
    const service = new DemoCorpusBootstrap(
      config as never,
      documents as never,
      pages as never,
      chunks as never,
      storage as never
    );

    await service.onModuleInit();

    expect(documents.findOneAndUpdate).not.toHaveBeenCalled();
    expect(storage.store).not.toHaveBeenCalled();
  });

  it('upserts a synthetic MLN112 document, pages and vector chunks in demo mode', async () => {
    config.get.mockReturnValue(true);
    const service = new DemoCorpusBootstrap(
      config as never,
      documents as never,
      pages as never,
      chunks as never,
      storage as never
    );

    await service.onModuleInit();

    expect(storage.store).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.stringMatching(/mln112-demo\.pdf$/),
      expect.stringMatching(/^[a-f\d]{64}$/),
      expect.any(String)
    );
    const [filter, update, options] = documents.findOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>
    ];
    expect(filter['_id']).toBeInstanceOf(Types.ObjectId);
    expect(update['$set']).toMatchObject({ status: 'ready', type: 'textbook' });
    expect(options).toMatchObject({ upsert: true, new: true });
    expect(chunks.findOneAndUpdate).toHaveBeenCalledTimes(3);
    expect(pages.findOneAndUpdate).toHaveBeenCalledTimes(3);
    expect(chunks.deleteMany).toHaveBeenCalled();
    expect(pages.deleteMany).toHaveBeenCalled();
  });
});
