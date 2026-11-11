import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import sharp from 'sharp';

const python = process.env.PDF_RENDER_PYTHON || 'python3';
const renderer = path.resolve(import.meta.dirname, '../scripts/render-pdf-page.py');

// Construct a genuine one-page PDF without requiring extra fixture libraries.
function samplePdf() {
  const stream = '0.2 0.4 0.6 rg 0 0 200 100 re f\\n'.replace('\\n', '\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << >> /Contents 4 0 R >>',
    '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + 'endstream',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += (i + 1) + ' 0 obj\n' + object + '\nendobj\n';
  }
  const xref = Buffer.byteLength(pdf);
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  for (const offset of offsets) pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return pdf;
}

test('PDF poster first page renders to a real 1600px PNG without system Poppler', async (t) => {
  const check = spawnSync(python, ['-c', 'import pypdfium2; from PIL import Image'], { stdio: 'ignore' });
  if (check.status !== 0) {
    if (process.env.PDF_RENDER_REQUIRED === '1') throw Error('Required PDF renderer dependencies unavailable');
    t.skip('PDF renderer optional outside publishing workflow');
    return;
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-poster-test-'));
  try {
    const pdf = path.join(temp, 'poster.pdf');
    const png = path.join(temp, 'poster.png');
    fs.writeFileSync(pdf, samplePdf());
    execFileSync(python, [renderer, pdf, png], {timeout: 30_000});
    const metadata = await sharp(png).metadata();
    assert.deepEqual({width: metadata.width, height: metadata.height, format: metadata.format},
      {width: 1600, height: 800, format: 'png'});
    const raw = await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject: true});
    assert.ok(raw.data[0] > 30 && raw.data[0] < 100, 'Expected blue PDF colour in preview');
    assert.ok(raw.data[1] > 70 && raw.data[1] < 140, 'Expected blue PDF colour in preview');
  } finally {
    fs.rmSync(temp, {recursive: true, force: true});
  }
});

test('Invalid PDF never leaves a cached partial preview', (t) => {
  const check = spawnSync(python, ['-c', 'import pypdfium2; from PIL import Image'], { stdio: 'ignore' });
  if (check.status !== 0) {
    if (process.env.PDF_RENDER_REQUIRED === '1') throw Error('Required PDF renderer dependencies unavailable');
    t.skip('PDF renderer optional outside publishing workflow');
    return;
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-invalid-test-'));
  try {
    const pdf = path.join(temp, 'broken.pdf');
    const png = path.join(temp, 'broken.png');
    fs.writeFileSync(pdf, 'not a PDF');
    const result = spawnSync(python, [renderer, pdf, png], {encoding: 'utf8', timeout: 30_000});
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(png), false);
    assert.equal(fs.existsSync(png + '.working.png'), false);
  } finally {
    fs.rmSync(temp, {recursive: true, force: true});
  }
});
