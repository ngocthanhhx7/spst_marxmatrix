import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash } from 'node:crypto';
import { GridFsStorageService } from '../documents/gridfs-storage.service.js';
import { DocumentPageRecord } from '../documents/schemas/document-page.schema.js';
import { DocumentRecord } from '../documents/schemas/document.schema.js';
import { chunkDocumentPages } from './chunker.js';
import { DeterministicTextEmbedder } from './deterministic-embedder.js';
import { RagChunkRecord } from './schemas/rag-chunk.schema.js';

/** Stable synthetic ownership keeps the demo corpus independent from runtime user passwords. */
export const DEMO_MLN112_OWNER_ID = '65f0a1000000000000000002';
export const DEMO_MLN112_DOCUMENT_ID = '65f0a1000000000000000001';
export const DEMO_MLN112_PARSE_TOKEN = 'demo-mln112-v1';

const demoPages = [
  {
    pageNumber: 1,
    text: 'Demo MLN112: Giá trị hàng hóa được phân tích như sự thống nhất giữa công dụng và lao động xã hội.'
  },
  {
    pageNumber: 2,
    text: 'Demo MLN112: Giá trị thặng dư là phần giá trị mới vượt quá giá trị sức lao động đã ứng trước.'
  },
  {
    pageNumber: 3,
    text: 'Demo MLN112: Tích lũy tư bản làm thay đổi quy mô sản xuất và đặt ra câu hỏi về phân phối kết quả lao động.'
  }
] as const;

@Injectable()
export class DemoCorpusBootstrap implements OnModuleInit {
  private readonly embedder = new DeterministicTextEmbedder();

  public constructor(
    private readonly config: ConfigService,
    @InjectModel(DocumentRecord.name) private readonly documents: Model<DocumentRecord>,
    @InjectModel(DocumentPageRecord.name) private readonly pages: Model<DocumentPageRecord>,
    @InjectModel(RagChunkRecord.name) private readonly chunks: Model<RagChunkRecord>,
    private readonly storage: GridFsStorageService
  ) {}

  async onModuleInit(): Promise<void> {
    const demoMode =
      this.config.get<boolean>('DEMO_MODE') ?? this.config.get<boolean>('demoMode') ?? false;
    if (!demoMode) return;
    await this.ensureCorpus();
  }

  private async ensureCorpus(): Promise<void> {
    const ownerId = new Types.ObjectId(DEMO_MLN112_OWNER_ID);
    const documentId = new Types.ObjectId(DEMO_MLN112_DOCUMENT_ID);
    const pdf = demoPdfBuffer();
    const checksum = createHash('sha256').update(pdf).digest('hex');
    const stored = await this.storage.store(
      pdf,
      'mln112-demo.pdf',
      checksum,
      ownerId.toHexString()
    );

    await this.documents
      .findOneAndUpdate(
        { _id: documentId },
        {
          $set: {
            ownerId,
            title: 'MLN112 — MarxMatrix demo corpus',
            courseId: 'MLN112',
            type: 'textbook',
            status: 'ready',
            mimeType: 'application/pdf',
            originalFileName: 'mln112-demo.pdf',
            byteSize: pdf.byteLength,
            checksum,
            gridFsFileId: stored.id,
            pageCount: demoPages.length,
            errorCode: null,
            errorMessage: null,
            deletionState: 'active',
            parsedPageToken: DEMO_MLN112_PARSE_TOKEN
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
      .exec();

    const drafts = chunkDocumentPages(demoPages, { overlapWords: 0 });
    const chunkIds: Types.ObjectId[] = [];
    for (const draft of drafts) {
      const chunkId = new Types.ObjectId(
        createHash('sha256').update(`demo:${draft.checksum}`).digest('hex').slice(0, 24)
      );
      const embedding = await this.embedder.embed(draft.text);
      chunkIds.push(chunkId);
      await this.chunks
        .findOneAndUpdate(
          { _id: chunkId },
          {
            $set: {
              ownerId,
              courseId: 'MLN112',
              documentId,
              parseToken: DEMO_MLN112_PARSE_TOKEN,
              pageStart: draft.pageStart,
              pageEnd: draft.pageEnd,
              text: draft.text,
              checksum: draft.checksum,
              embedding
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
        .exec();
    }

    await Promise.all(
      demoPages.map((page, index) =>
        this.pages
          .findOneAndUpdate(
            { documentId, parseToken: DEMO_MLN112_PARSE_TOKEN, pageNumber: page.pageNumber },
            {
              $set: {
                documentId,
                parseToken: DEMO_MLN112_PARSE_TOKEN,
                pageNumber: page.pageNumber,
                text: page.text,
                sourceChunkIds: chunkIds[index] === undefined ? [] : [chunkIds[index]]
              }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          )
          .exec()
      )
    );

    await Promise.all([
      this.chunks
        .deleteMany({ documentId, parseToken: DEMO_MLN112_PARSE_TOKEN, _id: { $nin: chunkIds } })
        .exec(),
      this.pages
        .deleteMany({
          documentId,
          parseToken: DEMO_MLN112_PARSE_TOKEN,
          pageNumber: { $nin: demoPages.map((page) => page.pageNumber) }
        })
        .exec()
    ]);
  }
}

function demoPdfBuffer(): Buffer {
  const content = 'BT /F1 12 Tf 72 720 Td (MarxMatrix MLN112 demo corpus) Tj ET';
  return Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n2 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n%%EOF\n`,
    'ascii'
  );
}
