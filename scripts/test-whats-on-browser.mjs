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
  if (url.pathname === '/mailings.json') {
   res.writeHead(200, { 'Content-Type':'application/json' });
   res.end(JSON.stringify({preview:false,mailings:[{
    title:'Parish Weekly Mailing — Sample issue',published:'2026-11-01T12:00:00Z',
    url:'https://us4.campaign-archive.com/?u=sample&id=sample',image:''
   }]}));
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
 await page.waitForFunction(() => /^[0-9]+m [0-9]{2}s$/.test(document.getElementById('refresh-countdown')?.textContent || ''));
 assert.match(await page.locator('#refresh-time').textContent(), /^[0-9]{2}:[0-9]{2}$/);
 assert.ok((await page.locator('#refresh-history').getAttribute('href')).includes('/actions/workflows/deploy.yml'));
 const clockBefore = await page.locator('#refresh-countdown').textContent();
 await page.waitForTimeout(1250);
 const clockAfter = await page.locator('#refresh-countdown').textContent();
 assert.notEqual(clockAfter, clockBefore, 'next scheduled check countdown must tick without page reload');
 const defaults = [
  ['loadTimetable','code-timetable','eager'],
  ['loadMailingHero','code-mailingHero','eager'],
  ['loadBanner','code-banner','eager'],
  ['loadMenu','code-menu','eager'],
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
 assert.match(await page.locator('#code-menu').inputValue(), /menu-highlights\.html/);
 await page.locator('#menuHeight').fill('360');
 assert.match(await page.locator('#code-menu').inputValue(), /height:360px/);
 assert.match(await page.locator('#code-menu').inputValue(), /loading="eager"/);
 await page.locator('#menuMagazine').uncheck();
 assert.match(await page.locator('#code-menu').inputValue(), /flipbook=0/);
 await page.locator('#menuMagazine').check();

 // Simulate a published Flipbook issue without depending on the public network.
 await page.route('https://opmedia-dev.github.io/flipbook/issues.json', route => route.fulfill({
  status:200,contentType:'application/json',
  headers:{'access-control-allow-origin':'*'},
  body:JSON.stringify({issues:[{id:'nov-2026',title:'Parish Magazine — November',cover:''}]})
 }));
 await page.setViewportSize({ width: 790, height: 650 });
 await page.goto(base + '/menu-highlights.html?height=300&autoplay=0&link=https%3A%2F%2Fwww.stjohnsoldmalden.org.uk%2Fevents-calendar&flipbookLink=https%3A%2F%2Fwww.stjohnsoldmalden.org.uk%2Fmagazine');
 await page.locator('.menu-slide').waitFor({timeout:15000});
 assert.equal(await page.locator('#menuDots button').count(),3,
  'one featured event, one weekly mailing and one magazine must rotate');
 assert.match(await page.locator('.menu-slide').textContent(), /only featured/i);
 assert.equal(Math.round((await page.locator('.menu-shell').boundingBox()).height),300);
 assert.match(await page.locator('.menu-slide').getAttribute('href'),/www\.stjohnsoldmalden\.org\.uk\/events-calendar\?event=only-featured/);
 await page.locator('#menuNext').click();
 assert.match(await page.locator('.menu-slide').textContent(),/Parish Weekly Mailing/);
 await page.locator('#menuNext').click();
 assert.match(await page.locator('.menu-slide').textContent(),/Parish Magazine — November/);
 assert.match(await page.locator('.menu-slide').getAttribute('href'),/www\.stjohnsoldmalden\.org\.uk\/magazine/);
 await page.locator('#menuPrevious').click();
 assert.match(await page.locator('.menu-slide').textContent(),/Parish Weekly Mailing/);
 await page.setViewportSize({width:360,height:620});
 const stacked=await page.locator('.menu-slide').evaluate(el=>{
  const art=el.querySelector('.menu-visual').getBoundingClientRect();
  const copy=el.querySelector('.menu-copy').getBoundingClientRect();
  return {below:copy.top>=art.bottom-1,overflow:document.documentElement.scrollWidth>window.innerWidth};
 });
 assert.ok(stacked.below,'menu item must stack its artwork above text in narrow menus');
 assert.equal(stacked.overflow,false,'menu widget must not overflow the menu column');

 await page.goto(base+'/menu-highlights.html?height=300&autoplay=3');
 await page.locator('.menu-slide').waitFor();
 const initial=await page.locator('.menu-slide').textContent();
 await page.waitForTimeout(4200);
 assert.notEqual(await page.locator('.menu-slide').textContent(),initial,'unfocused menu should auto-rotate');
 await page.locator('#menuPause').click();
 assert.equal(await page.locator('#menuPause').getAttribute('aria-pressed'),'true');
 const paused=await page.locator('.menu-slide').textContent();
 await page.waitForTimeout(3400);
 assert.equal(await page.locator('.menu-slide').textContent(),paused,'manual pause must prevent auto-rotation');

 assert.deepEqual(pageErrors, [], 'no JavaScript page exceptions');
 console.log('PASS: month navigation and card sizing, plus all embed loading defaults and selective eager/lazy overrides in Chromium');
} finally {
 if (browser) await browser.close();
 await new Promise(resolve => server.close(resolve));
}
