import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { eventFeatured } from '../scripts/lib/featured.mjs';
import { makePreviewData } from '../scripts/preview-data.mjs';

const root = path.resolve(import.meta.dirname, '..');
const src = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const shared = (value) => ({ extendedProperties: { shared: { woFeatured: value } } });

test('featured is explicit and independent of having a poster', () => {
  assert.equal(eventFeatured({ attachments: [{ mimeType: 'image/png' }] }), false);
  assert.equal(eventFeatured(shared('true')), true);
  assert.equal(eventFeatured(shared('false')), false);
  assert.equal(eventFeatured(shared('TRUE')), false);
});

test('recurring exceptions inherit the master until explicitly overridden', () => {
  assert.equal(eventFeatured({ recurringEventId: 'series' }, shared('true')), true);
  assert.equal(eventFeatured(shared('false'), shared('true')), false);
  assert.equal(eventFeatured(shared('true'), shared('false')), true);
  assert.equal(eventFeatured({ recurringEventId: 'series' }, shared('false')), false);
});

test('preview events demonstrate both independent poster and featured choices', () => {
  const data = makePreviewData(new Date('2026-10-30T15:30:00Z'));
  assert.ok(data.events.some((e) => e.featured && !data.details[e.detail].image));
  assert.ok(data.events.some((e) => !e.featured && data.details[e.detail].image));
  assert.ok(data.events.some((e) => e.featured && e.recurring));
});

test('public selection and search never bypass the featured flag', () => {
  const banner = src('site/banner.html');
  const page = src('site/whats-on.html');
  const sync = src('scripts/sync-calendar.mjs');
  assert.match(banner, /isUpcoming\(e, now\) && e\.featured === true/);
  assert.doesNotMatch(banner, /param\('show', 'featured'\)/);
  assert.match(page, /nextPerSeries\(upcoming\.filter\(\(e\) => e\.featured === true\)\)/);
  assert.match(page, /featured,\s*week:/);
  assert.match(page, /q \? lists\[filter\]\.filter/);
  assert.match(sync, /featured: eventFeatured\(e, master\)/);
});

test('editor reads, writes, and changes featured checkbox state', () => {
  const source = src('admin/apps-script/Code.gs');
  assert.match(source, /FEATURED_KEY = 'woFeatured'/);
  assert.match(source, /featured: featuredOf_\(e, master\)/);
  assert.match(source, /\[FEATURED_KEY\]: form\.featured === true \? 'true' : 'false'/);
  for (const file of ['admin/apps-script/Index.html', 'site/admin-demo.html']) {
    const editor = src(file);
    assert.match(editor, /v\.featured=\$\('featured'\)\.checked/);
    assert.match(editor, /\$\('featured'\)\.checked=e\.featured===true/);
    assert.match(editor, /\$\('featured'\)\.addEventListener\('change'/);
  }
});
