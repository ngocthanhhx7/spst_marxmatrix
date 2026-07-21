import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { validateChatImages } from './chat-image-validation.js';

async function image(format: 'jpeg' | 'png' | 'webp'): Promise<Buffer> {
  const pipeline = sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 10, g: 20, b: 30 } }
  });
  return pipeline[format]().toBuffer();
}

const [jpegBuffer, pngBuffer, webpBuffer] = await Promise.all([
  image('jpeg'),
  image('png'),
  image('webp')
]);
const png = {
  originalname: '../unsafe/chart.png',
  mimetype: 'image/png',
  buffer: pngBuffer
};

describe('validateChatImages', () => {
  it('accepts matching PNG magic bytes and canonicalizes metadata', async () => {
    await expect(validateChatImages([png])).resolves.toEqual([
      {
        buffer: pngBuffer,
        originalFileName: 'chart.png',
        mimeType: 'image/png',
        byteSize: pngBuffer.length,
        checksum: createHash('sha256').update(pngBuffer).digest('hex')
      }
    ]);
  });

  it.each([
    ['photo.jpg', 'image/jpeg', jpegBuffer],
    ['chart.png', 'image/png', pngBuffer],
    ['diagram.webp', 'image/webp', webpBuffer]
  ] as const)('fully decodes a valid %s image', async (originalname, mimetype, buffer) => {
    await expect(validateChatImages([{ originalname, mimetype, buffer }])).resolves.toHaveLength(1);
  });

  it('rejects a MIME and signature mismatch with CHAT_IMAGE_INVALID', async () => {
    await expect(
      validateChatImages([{ ...png, mimetype: 'image/jpeg' }])
    ).rejects.toMatchObject({ code: 'CHAT_IMAGE_INVALID' });
  });

  it('rejects a fifth image with CHAT_IMAGE_INVALID', async () => {
    await expect(
      validateChatImages(Array.from({ length: 5 }, () => png))
    ).rejects.toMatchObject({ code: 'CHAT_IMAGE_INVALID' });
  });

  it.each([
    [
      'header-only PNG',
      'broken.png',
      'image/png',
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01])
    ],
    ['truncated JPEG', 'broken.jpg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff])],
    [
      'truncated WebP',
      'broken.webp',
      'image/webp',
      Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
    ]
  ] as const)('rejects a malformed %s despite matching magic bytes', async (_label, originalname, mimetype, buffer) => {
    await expect(validateChatImages([{ originalname, mimetype, buffer }])).rejects.toMatchObject({
      code: 'CHAT_IMAGE_INVALID'
    });
  });

  it('normalizes separators before basename and preserves valid Unicode', async () => {
    await expect(
      validateChatImages([
        { ...png, originalname: `unsafe／folder／biểu đồ.png` }
      ])
    ).resolves.toEqual([
      expect.objectContaining({ originalFileName: 'biểu đồ.png' })
    ]);
  });

  it.each(['chart\u0000.png', 'safe\u202Egnp.png'])(
    'rejects control or bidi formatting characters in filename %j',
    async (originalname) => {
      await expect(validateChatImages([{ ...png, originalname }])).rejects.toMatchObject({
        code: 'CHAT_IMAGE_INVALID'
      });
    }
  );
});
