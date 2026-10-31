import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { renderMailingHero, mailingHeadline } from '../site/assets/mailing-hero.js';

const root = path.resolve(import.meta.dirname, '..');
const content = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const h = (tag, attrs, ...children) => ({
  tag, attrs: attrs || {}, children: children.flat().filter((x) => x !== null && x !== undefined && x !== false),
});
const icon = (name) => h('svg', { name });
const nodes = (tree, fn) => [
  ...(fn(tree) ? [tree] : []),
  ...(tree.children || []).filter((x) => x && typeof x === 'object').flatMap((x) => nodes(x, fn)),
];
const words = (tree) => typeof tree === 'string' ? tree : (tree.children || []).map(words).join(' ');
const item = {
  id: 'parish-week-123', title: 'St John’s Parish Mailing — All Saints’ Sunday',
  published: '2026-10-30T09:00:00Z',
  summary: 'The latest parish news, including this week’s services and notices.',
  url: 'https://us12.campaign-archive.com/?u=example&id=123',
};

test('single hero uses the latest public mailing metadata, not Google Calendar', () => {
  const card = renderMailingHero(item, { h, icon });
  assert.equal(card.tag, 'a');
  assert.equal(card.attrs.class, 'wo-mailing-hero-card is-text-only');
  assert.equal(card.attrs.href, item.url);
  assert.equal(card.attrs.target, '_blank');
  assert.equal(card.attrs.rel, 'noopener noreferrer');
  assert.match(words(card), /All Saints’ Sunday/);
  assert.match(words(card), /St John the Baptist/);
  assert.match(words(card), /Old Malden/);
  assert.match(words(card), /Parish weekly mailing/);
  assert.match(words(card), /30 October 2026/);
  assert.match(words(card), /latest parish news/);
  assert.match(words(card), /Read the full mailing/);
  assert.equal(nodes(card, (n) => n.tag === 'img').length, 0);
  assert.equal(nodes(card, (n) => n.tag === 'time' && n.attrs.datetime === new Date(item.published).toISOString()).length, 1);
});

test('original campaign headline is retained while redundant mailing prefixes are removed', () => {
  assert.equal(mailingHeadline('St John’s Parish mailing - All Saints’ Sunday'), 'All Saints’ Sunday');
  assert.equal(mailingHeadline('Parish Weekly Mailing — Sample issue'), 'Sample issue');
  assert.equal(mailingHeadline('Summer Garden Party'), 'Summer Garden Party');
  assert.equal(mailingHeadline('Parish Weekly Mailing'), 'Parish Weekly Mailing');
});

test('a genuine campaign image is shown without inventing decoration, and failures fall back gracefully', () => {
  const image = 'https://images.example.org/newsletter-cover.jpg';
  const card = renderMailingHero({ ...item, image }, { h });
  assert.equal(card.attrs.class, 'wo-mailing-hero-card has-image');
  const img = nodes(card, (n) => n.tag === 'img');
  assert.equal(img.length, 1);
  assert.equal(img[0].attrs.src, image);
  assert.equal(typeof img[0].attrs.onerror, 'function');
  const classes = new Set(['has-image']);
  img[0].attrs.onerror({ currentTarget: { closest: () => ({
    classList: { remove: (x) => classes.delete(x), add: (x) => classes.add(x) },
  }) } });
  assert.deepEqual([...classes], ['is-text-only']);
  const unsafe = renderMailingHero({ ...item, image: 'javascript:alert(1)' }, { h });
  assert.equal(nodes(unsafe, (n) => n.tag === 'img').length, 0);
});

test('sample content is visibly and accessibly identified as demonstration', () => {
  const card = renderMailingHero(item, { h, icon, preview: true });
  assert.match(words(card), /Demonstration issue/);
  assert.match(card.attrs['aria-label'], /demonstration mailing/);
  assert.match(words(card), /View sample mailing/);
});

test('missing summary is handled without inventing newsletter text', () => {
  const card = renderMailingHero({ ...item, summary: '' }, { h, icon });
  assert.equal(nodes(card, (n) => n.attrs?.class === 'wo-mailing-hero-summary').length, 0);
  assert.match(words(card), /Read the full mailing/);
});

test('malformed items fail safely rather than making broken links', () => {
  assert.throws(() => renderMailingHero(null, { h, icon }), /valid published mailing/);
  assert.throws(() => renderMailingHero({ ...item, published: 'not-a-date' }, { h, icon }), /valid published mailing/);
});

test('mailing hero is independent and uses the existing mailing loader', () => {
  const page = content('site/mailing-hero.html');
  assert.match(page, /import \{ loadMailings \} from '\.\/assets\/mailings\.js'/);
  assert.match(page, /renderMailingHero\(latest, \{ h, preview \}\)/);
  assert.match(page, /await init\(\)/);
  assert.doesNotMatch(page, /loadEvents|events\.json|createFlipbook/);
  assert.match(page, /No mailing is available yet/);
});

test('desktop hero matches 593×434 timetable canvas without overflow; mobile grows naturally', () => {
  const css = content('site/assets/wo.css');
  assert.match(css, /\.wo-mailing-hero-wrap\s*\{[^}]*max-width:\s*593px/);
  assert.match(css, /\.wo-mailing-hero-card\s*\{[^}]*height:\s*418px/);
  assert.match(css, /@media \(max-width:\s*520px\)\s*\{[^]*?\.wo-mailing-hero-card,\s*\.wo-mailing-hero-card\.has-image\s*\{[^}]*height:\s*auto/);
  assert.match(css, /\.wo-mailing-hero-title\s*\{[^}]*-webkit-line-clamp:\s*3/);
  assert.match(css, /\.wo-mailing-hero-card\.has-image\s*\{[^}]*grid-template-columns:/);
  assert.match(css, /\.wo-mailing-hero-masthead\s*\{[^}]*border-bottom:\s*2px solid var\(--wo-accent\)/);
  assert.match(css, /\.wo-mailing-hero-picture img\s*\{[^}]*object-fit:\s*cover/);
  assert.doesNotMatch(css.match(/\/\* ---------- Parish Weekly Mailing hero[\s\S]*?\/\* ---------- Weekly mailing cards/)[0], /linear-gradient|wo-mailing-hero-cta/);
  assert.match(css, /\.wo-mailing-hero-summary\s*\{[^}]*-webkit-line-clamp:\s*3/);
  assert.doesNotMatch(css.match(/\/\* ---------- Standalone weekly mailing hero[\s\S]*?\/\* ---------- Weekly mailing cards/)[0], /overflow-y:\s*auto/);
});

test('generator supplies a distinct 434px embed and preview, alongside existing embeds', () => {
  const gen = content('site/index.html');
  assert.match(gen, /id="code-mailingHero"/);
  assert.match(gen, /id="open-mailingHero"/);
  assert.match(gen, /mailingHero:\s*iframe\('mailing-hero\.html', q, 434,/);
  for (const name of ['timetable', 'banner', 'mailings', 'whatson', 'calendar']) {
    assert.match(gen, new RegExp(name + ": iframe\\('"));
  }
});
