import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { shiftMonth } from '../site/assets/month-selection.js';

// Run the actual public What's On embed in Chromium inside a simulated parent
// page. A plain unit test of shiftMonth would miss the host scroll-to-top bug.
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
 timeZone: 'Europe/London', year: 'numeric', month: '2-digit',
}).formatToParts(new Date()).map(part => [part.type, part.value]));
const current = parts.year + '-' + parts.month;
const previous = shiftMonth(current, -1);
const next = shiftMonth(current, 1);
const monthLabel = value => new Intl.DateTimeFormat('en-GB', {
 month: 'long', year: 'numeric',
}).format(new Date(value + '-15T12:00:00Z'));
const makeEvent = (id, month, day, featured = false) => ({
 id, series: id, title: id.replaceAll('-', ' '),
 start: month + '-' + day + 'T12:00:00Z',
 end: month + '-' + day + 'T13:00:00Z',
 allDay: false, location: 'Old Malden', featured,
 recurring: false, detail: 'demo',
});
const data = {
 timeZone: 'Europe/London', preview: false,
 range: {
  from: shiftMonth(current, -3) + '-01T00:00:00Z',
  to: shiftMonth(current, 4) + '-01T00:00:00Z',
 },
 details: { demo: { summary: '', html: '', gallery: [], attachments: [] } },
 events: [
  makeEvent('prior-month', previous, '10'),
  makeEvent('current-month', current, '12'),
  makeEvent('next-month', next, '12'),
  makeEvent('only-featured', next, '18', true),
 ],
};
const root = path.resolve('site');
const server = createServer(async (req, res) => {
 try {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/shell') {
   res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
   res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width"></head>
<body style="margin:16px">
<iframe id="embed" title="What's On" src="/whats-on.html?filter=month&month=${current}" style="border:0;display:block;width:100%;height:1100px"></iframe>
<script>
 window.hostScrolls=0;
 window.addEventListener('message', function(event){
  if(event.data?.source!=='whatson')return;
  if(event.data.type==='scrollToTop')window.hostScrolls++;
  if(event.data.type==='hello')event.source.postMessage({source:'whatson-host',type:'hello',page:location.href},'*');
 });
</script></body></html>`);
   return;
  }
  if (url.pathname === '/events.json') {
   res.writeHead(200, { 'Content-Type': 'application/json' });
   res.end(JSON.stringify(data));
   return;
  }
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  const bytes = await readFile(file);
  const ext = path.extname(file);
  const type = ext === '.html' ? 'text/html' : ext === '.js' ? 'text/javascript' :
   ext === '.css' ? 'text/css' : 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  res.end(bytes);
 } catch (error) {
  res.writeHead(404); res.end('Not found');
 }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
 browser = await chromium.launch({ headless: true });
 const page = await browser.newPage({ viewport: { width: 1250, height: 1000 } });
 const pageErrors = [];
 page.on('pageerror', err => pageErrors.push(err.stack || err.message));
 await page.goto(base + '/shell');
 const embed = page.frameLocator('#embed');
 await embed.locator('#highlights .wo-card').first().waitFor({ timeout: 15000 });
 assert.equal(await embed.locator('#highlights .wo-card').count(), 1);
 const cardWidth = (await embed.locator('#highlights .wo-card').first().boundingBox()).width;
 const sectionWidth = (await embed.locator('#highlights').boundingBox()).width;
 assert.ok(sectionWidth > 600, 'desktop content is wide enough to expose a stretched single card');
 const regularCardWidth = (await embed.locator('#cards .wo-card').first().boundingBox()).width;
 assert.ok(cardWidth > 200 && Math.abs(cardWidth - regularCardWidth) <= 2,
   'the single Highlight must match normal event card width: ' + cardWidth + ' vs ' + regularCardWidth);
 assert.equal(await embed.locator('#selected-month').textContent(), monthLabel(current));

 await embed.locator('#month-next').click();
 assert.equal(await embed.locator('#selected-month').textContent(), monthLabel(next),
   'Next must change the displayed month');
 assert.match((await embed.locator('#cards').textContent()), /next month/i);
 assert.doesNotMatch((await embed.locator('#cards').textContent()), /current month/i);

 await embed.locator('#month-prev').click();
 assert.equal(await embed.locator('#selected-month').textContent(), monthLabel(current));
 await embed.locator('#month-prev').click();
 assert.equal(await embed.locator('#selected-month').textContent(), monthLabel(previous));
 assert.match((await embed.locator('#cards').textContent()), /prior month/i);
 await embed.locator('#month-today').click();
 assert.equal(await embed.locator('#selected-month').textContent(), monthLabel(current));
 assert.equal(await page.evaluate(() => window.hostScrolls), 0,
   'month navigation must not send scrollToTop to the parent website');

 await page.setViewportSize({ width: 380, height: 940 });
 const narrowWidth = (await embed.locator('#highlights .wo-card').first().boundingBox()).width;
 const narrowSection = (await embed.locator('#highlights').boundingBox()).width;
 assert.ok(narrowWidth <= narrowSection + 1, 'single highlight must fit the mobile container');
 // Exercise the real embed generator as well as its unit tests.
 // Existing Duda iframes must be replaced to apply a new loading preference.
 await page.goto(base + '/index.html');
 const defaults = [
  ['loadTimetable','code-timetable','eager'],
  ['loadMailingHero','code-mailingHero','eager'],
  ['loadBanner','code-banner','eager'],
  ['loadMailings','code-mailings','lazy'],
  ['loadWhatson','code-whatson','lazy'],
  ['loadCalendar','code-calendar','lazy'],
 ];
 for (const [selector,output,expected] of defaults) {
  assert.equal(await page.locator('#'+selector).inputValue(), expected,
    selector+' default preference');
  assert.match(await page.locator('#'+output).inputValue(),
    new RegExp('loading="'+expected+'"'), output+' generated iframe');
 }
 await page.locator('#loadWhatson').selectOption('eager');
 assert.match(await page.locator('#code-whatson').inputValue(), /loading="eager"/);
 assert.match(await page.locator('#code-whatson').inputValue(), /data-deeplink/);
 assert.match(await page.locator('#code-whatson').inputValue(), /whatsonHost/);
 assert.match(await page.locator('#code-calendar').inputValue(), /loading="lazy"/);
 await page.locator('#loadBanner').selectOption('lazy');
 assert.match(await page.locator('#code-banner').inputValue(), /loading="lazy"/);
 assert.match(await page.locator('#code-timetable').inputValue(), /loading="eager"/);

 assert.deepEqual(pageErrors, [], 'no JavaScript page exceptions');
 console.log('PASS: month navigation and card sizing, plus all embed loading defaults and selective eager/lazy overrides in Chromium');
} finally {
 if (browser) await browser.close();
 await new Promise(resolve => server.close(resolve));
}
