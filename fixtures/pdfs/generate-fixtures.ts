import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function escapePdfLiteral(value: string): string {
  return value.replace(/([\\()])/g, '\\$1');
}

/** Creates a minimal, searchable PDF with a single Helvetica text page. */
export function createSearchablePdfFixture(text: string): Buffer {
  const content = `BT\n/F1 18 Tf\n72 720 Td\n(${escapePdfLiteral(text)}) Tj\nET\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  let pdf = header;
  const offsets = [0];

  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, 'binary'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  pdf += offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'binary');
}

async function writeFixture(): Promise<void> {
  const here = dirname(resolve(process.argv[1] ?? 'fixtures/pdfs/generate-fixtures.ts'));
  await mkdir(here, { recursive: true });
  await writeFile(
    resolve(here, 'text-fixture.pdf'),
    createSearchablePdfFixture('MarxMatrix searchable PDF fixture')
  );
}

if (/generate-fixtures\.(?:[cm]?js|ts)$/.test(process.argv[1] ?? '')) {
  void writeFixture().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
