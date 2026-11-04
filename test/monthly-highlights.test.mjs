import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { shiftMonth, isValidMonth, clampMonth, eventsInMonth } from '../site/assets/month-selection.js';
import { horizonDays } from '../site/assets/banner-config.js';
const source = file => fs.readFileSync(path.join(import.meta.dirname,'..',file),'utf8');

test('month navigation moves between real calendar months, including year changes', () => {
  assert.equal(shiftMonth('2026-11', 1), '2026-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2027-01', -1), '2026-12');
  assert.equal(shiftMonth('2026-03', -1), '2026-02');
  assert.equal(isValidMonth('2026-11'), true);
  assert.equal(isValidMonth('2026-13'), false);
  assert.equal(clampMonth('2026-11','2026-09','2026-12'),'2026-11');
  assert.equal(clampMonth('2028-01','2026-09','2026-12'),'2026-12');
});

test('monthly view includes each recurring occurrence and crossing-month events', () => {
 const events = [
  { id:'repeat-1',startKey:'2026-11-02',endKey:'2026-11-02',recurring:true },
  { id:'repeat-2',startKey:'2026-11-09',endKey:'2026-11-09',recurring:true },
  { id:'cross',startKey:'2026-10-31',endKey:'2026-11-02' },
  { id:'dec',startKey:'2026-12-01',endKey:'2026-12-01' },
  { id:'oct',startKey:'2026-10-15',endKey:'2026-10-15' },
 ];
 assert.deepEqual(eventsInMonth(events,'2026-11').map(e=>e.id),['repeat-1','repeat-2','cross']);
 assert.deepEqual(eventsInMonth(events,'2026-12').map(e=>e.id),['dec']);
});

test('Highlights is a permanent top section, and month is the default listing', () => {
 const page = source('site/whats-on.html');
 assert.ok(page.indexOf('id="highlights-section"') < page.indexOf('id="upcoming-section"'));
 assert.match(page,/const highlighted = featured\.slice/);
 assert.match(page,/let filter = filterKeys\.includes\(param\('filter'\)\) \? param\('filter'\) : 'month'/);
 assert.match(page,/const monthEvents = \(\) => eventsInMonth\(events, selectedMonth\)/);
 assert.match(page,/id="month-prev"/);
 assert.match(page,/id="month-next"/);
 assert.doesNotMatch(page, /month-next[^\n]+render\(true\)/);
 assert.doesNotMatch(page, /month-prev[^\n]+render\(true\)/);
 assert.doesNotMatch(page, /todayButton\.addEventListener\('click',[^\n]+render\(true\)/);
 const css=source('site/assets/wo.css');
 assert.match(css, /#highlights-section \.wo-cards\{margin-top:12px\}/);
 assert.match(page,/highlightsEl\.style\.setProperty\('--wo-cols', String\(cols\)\)/);
 assert.match(page,/renderCard\(e, \{ showRecurrence: e\.recurring, summary: summaries/);
 assert.doesNotMatch(page,/featured:\s*series\.filter/);
});

test('banner selection requires explicit featured flag and its default horizon no longer excludes distant events', () => {
 const banner=source('site/banner.html');
 assert.match(banner,/isUpcoming\(e, now\) && e\.featured === true/);
 assert.equal(horizonDays(undefined), 400);
 assert.equal(horizonDays('14'),14); // Existing explicitly limited banner URLs retain their setting.
 assert.equal(horizonDays('400'),400);
 assert.doesNotMatch(banner,/param\('show', 'featured'\)/);
 assert.match(banner,/wo\.js\?v=monthly-poster-20261104/);
});

test('both editor and public month views offer functional overflow expansion', () => {
 const editor=source('admin/apps-script/Index.html');
 const demo=source('site/admin-demo.html');
 const calendar=source('site/calendar.html');
 for (const html of [editor,demo]) {
  assert.match(html,/state\.expandedDays\.has\(date\)/);
  assert.match(html,/var more=create\('button','more'/);
  assert.match(html,/entries\.slice\(0,3\)/);
  assert.match(html,/state\.expandedDays\.add\(d\)/);
 }
 assert.match(calendar,/evs\.length <= maxPerDay \? evs : evs\.slice/);
 assert.match(calendar,/'aria-expanded': String\(open\)/);
 assert.match(calendar,/render\(\); const button=/);
});

test('large image uploads have a client-side optimisation switch and safe fallback', () => {
 const editor=source('admin/apps-script/Index.html');
 const backend=source('admin/apps-script/Code.gs');
 assert.match(editor,/id="optimiseUpload" type="checkbox" checked/);
 assert.match(editor,/async function optimiseUpload\(\)/);
 assert.match(editor,/canvas\.toBlob\(resolve,'image\/webp',0\.88\)/);
 assert.match(editor,/await optimiseUpload\(\)/);
 assert.match(editor,/original image\./);
 assert.doesNotMatch(backend,/Drive\.Files\.get\(EDITOR_UPLOAD_FOLDER_ID/);
});
