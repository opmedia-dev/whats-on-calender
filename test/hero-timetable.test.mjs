import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
globalThis.location = new URL('https://opmedia-dev.github.io/whats-on-calender/timetable.html');
const { heroWeek } = await import('../site/assets/hero-timetable.js');

const addDays = (d, n) => {
  const date = new Date(d + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
};
const h = (name, attrs, ...children) => ({ name, attrs, children: children.flat(Infinity) });
const eventHref = (ev) => ({ href: '#event=' + ev.id, target: null });
const render = (start, count, events, opts = {}) =>
  heroWeek(start, count, events, {
    h, addDays, eventHref, icon: (name) => h('svg', { class: 'wo-icon wo-icon-' + name }), ...opts,
  });

const find = (node, predicate) => [
  ...(predicate(node) ? [node] : []),
  ...(node.children || []).filter((x) => x && typeof x === 'object').flatMap((x) => find(x, predicate)),
];
const txt = (node) => typeof node === 'string' ? node
  : (node.children || []).map(txt).join('');
const event = (day, hour = 10, id = 'e-' + day + '-' + hour) => ({
  id, title: 'Service ' + id, allDay: false, startKey: day, endKey: day,
  startDate: new Date(day + 'T' + String(hour).padStart(2, '0') + ':00:00Z'),
});

test('hero always shows seven dated day panels, including days without events', () => {
  const panels = render('2026-11-01', 7, [event('2026-11-02')]);
  assert.equal(panels.length, 7);
  assert.equal(panels.every((p) => p.name === 'section' && p.attrs.class.includes('wo-hero-day')), true);
  assert.equal(find(panels[0], (n) => n.attrs?.class === 'wo-hero-none').length, 1);
  assert.equal(find(panels[0], (n) => n.name === 'time' && n.attrs?.datetime === '2026-11-01').length, 1);
  assert.equal(panels[0].attrs.class.includes('is-today'), true);
  assert.equal(panels[1].attrs.class.includes('is-today'), false);
  assert.equal(panels[1].attrs.class.includes('has-events'), false);
  assert.match(txt(panels[1]), /Service e-2026-11-02-10/);
  assert.match(txt(panels.at(-1)), /Sat.*7 Nov.*Nothing scheduled/);
});

test('seven-day panel shows event times and names but no thumbnails or location', () => {
  const ev = event('2026-11-01');
  ev.info = { image: { src: 'poster.jpg' } };
  ev.location = 'Church Hall';
  const panels = render('2026-11-01', 7, [ev]);
  const links = find(panels[0], (n) => n.name === 'a');
  assert.equal(links.length, 1);
  assert.match(txt(links[0]), /10:00.*Service/);
  assert.equal(links[0].attrs.href, '#event=' + ev.id);
  assert.equal(find(panels[0], (n) => n.name === 'img').length, 0);
  assert.doesNotMatch(txt(panels[0]), /Church Hall/);
});

test('regular events show a compact repeat icon without obscuring title or changing navigation', () => {
  const regular = { ...event('2026-11-01'), title: 'Weekly Choir Practice', recurring: true };
  const oneOff = { ...event('2026-11-01', 12), title: 'One-off Concert', recurring: false };
  const panels = render('2026-11-01', 7, [regular, oneOff]);
  const links = find(panels[0], (n) => n.name === 'a');
  assert.equal(links.length, 2);
  const markers = find(links[0], (n) => n.attrs?.class === 'wo-hero-regular');
  assert.equal(markers.length, 1);
  const parts = links[0].children.filter((part) => part && typeof part === 'object');
  assert.deepEqual(parts.map((part) => part.attrs?.class),
    ['wo-hero-time', 'wo-hero-regular', 'wo-hero-title'],
    'repeat icon must be between the time and title');
  assert.equal(markers[0].attrs['aria-hidden'], 'true');
  assert.equal(find(markers[0], (n) => n.name === 'svg' && n.attrs.class === 'wo-icon wo-icon-repeat').length, 1);
  assert.match(links[0].attrs['aria-label'], /Weekly Choir Practice \(Regular event\)/);
  assert.equal(links[0].attrs.href, '#event=' + regular.id);
  assert.equal(find(links[1], (n) => n.attrs?.class === 'wo-hero-regular').length, 0);
  assert.deepEqual(links[1].children.map((part) => part.attrs?.class),
    ['wo-hero-time', 'wo-hero-title'],
    'one-off event keeps its title in the same reserved column');
  assert.doesNotMatch(links[1].attrs['aria-label'], /Regular event/);
});

test('busy days keep explicit overflow count and accessible full agenda link', () => {
  const five = [8, 9, 10, 11, 12].map((hour) => event('2026-11-01', hour));
  const panels = render('2026-11-01', 7, five);
  const links = find(panels[0], (n) => n.name === 'a');
  assert.equal(links.length, 3, 'two events plus a More link fit in the compact day row');
  assert.match(txt(links.at(-1)), /\+3 more events/);
  assert.match(links.at(-1).attrs.href, /calendar\.html\?view=list/);
  assert.match(links.at(-1).attrs.title, /Service e-2026-11-01-10/);
});

test('ongoing earlier events appear once under Today', () => {
  const multi = event('2026-10-31');
  multi.endKey = '2026-11-02';
  const panels = render('2026-11-01', 7, [multi]);
  assert.equal(find(panels[0], (n) => n.name === 'a').length, 1);
  assert.equal(find(panels[1], (n) => n.name === 'a').length, 0);
});

test('generator uses 593 × 434 timetable without an internal scrollbar', () => {
  const html = fs.readFileSync(path.join(root, 'site/index.html'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'site/timetable.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'site/assets/wo.css'), 'utf8');
  assert.match(html, /id="ttHeroHeight"[^>]*value="434"/);
  assert.match(html, /timetable: iframe\('timetable\.html', tt, Number\(val\('ttHeroHeight'\)\) \|\| 434/);
  assert.match(page, /flag\('compact', true\)/);
  assert.match(page, /heroWeek\(today/);
  assert.match(page, /maxPerDay: 3/);
  assert.match(css, /\.wo-hero-compact\s*\{[^}]*max-width:\s*593px/);
  assert.match(css, /\.wo-hero-week\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /height:\s*calc\(var\(--wo-hero-height,\s*434px\)\s*-\s*16px\)/);
  assert.match(css, /@media \(max-width: 520px\)\s*\{\s*\.wo-hero-week\s*\{\s*height:\s*auto/);
  assert.doesNotMatch(css, /\.wo-hero-day\.has-events \.wo-hero-day-head::after/);
  assert.doesNotMatch(css, /inset 3px 0 0 var\(--wo-accent\)/);
  assert.match(css, /\.wo-hero-regular\s*\{[^}]*grid-column:\s*2;[^}]*width:\s*15px/);
  assert.match(css, /\.wo-hero-title\s*\{[^}]*grid-column:\s*3/);
  assert.match(css, /\.wo-hero-event a\s*\{[^}]*grid-template-columns:\s*48px\s+15px\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /\.wo-hero-day\s*\{[^}]*border-bottom:\s*1px solid #f4f1ef/);
  assert.match(css, /\.wo-hero-week\s*\{[^}]*border:\s*1px solid #eee9e6/);
  assert.match(css, /\.wo-hero-event a\s*\{[^}]*grid-template-columns:\s*48px\s+15px\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /@media \(max-width:\s*520px\)[^]*?\.wo-hero-event a\s*\{[^}]*grid-template-columns:\s*44px\s+15px\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /@media \(min-width:\s*521px\) and \(max-width:\s*760px\)/);
  assert.match(css, /@media \(max-width:\s*520px\)/);
  assert.match(css, /\.wo-hero-none::before/);
  assert.match(css, /\.wo-hero-time\s*\{[^}]*background:\s*color-mix\(in srgb,\s*var\(--wo-accent\)\s*8%,\s*#fff\)/);
  assert.match(css, /\.wo-hero-week\s*\{[^}]*box-shadow:/);
  assert.doesNotMatch(css.match(/\/\* ---------- Seven-day hero:[\s\S]*?\/\* ---------- Cards/)[0], /overflow:\s*auto/);
  assert.match(css, /\.wo-hero-day\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*94px/);
  assert.match(css, /grid-template-rows:\s*repeat\(var\(--wo-hero-rows,\s*7\)/);
  assert.doesNotMatch(css.match(/\/\* ---------- Seven-day hero:[\s\S]*?\/\* ---------- Cards/)[0], /\.wo-hero-day:last-child:nth-child\(odd\)/);
});
