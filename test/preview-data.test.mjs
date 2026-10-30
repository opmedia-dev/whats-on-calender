import test from 'node:test';
import assert from 'node:assert/strict';
import { makePreviewData } from '../scripts/preview-data.mjs';

const preview = makePreviewData(new Date('2026-10-30T15:30:00Z'));

test('pre-release data is always visibly marked as sample content', () => {
  assert.equal(preview.preview, true);
  assert.match(preview.calendar.name, /sample/i);
  assert.equal(preview.timeZone, 'Europe/London');
});

test('sample feed covers each event presentation type', () => {
  assert.ok(preview.events.length >= 25);
  assert.ok(preview.events.some((e) => e.recurring && e.recurrence));
  assert.ok(preview.events.some((e) => e.allDay));
  assert.ok(preview.events.some((e) => e.featured));
  assert.ok(preview.events.some((e) => !e.featured));
});

test('sample events have coherent dates and valid details', () => {
  for (const e of preview.events) {
    assert.ok(e.end > e.start, `Invalid end time for ${e.id}`);
    assert.ok(preview.details[e.detail], `Missing detail for ${e.id}`);
    assert.match(e.title, /sample/i);
  }
});

test('sample event assets cover landscape and portrait posters and downloadable files', () => {
  const images = Object.values(preview.details).map((d) => d.image).filter(Boolean);
  assert.ok(images.some((i) => i.width > i.height));
  assert.ok(images.some((i) => i.height > i.width));
  assert.ok(Object.values(preview.details).some((d) => d.attachments.length));
  assert.ok(Object.values(preview.details).some((d) => d.contacts.emails.length));
});
