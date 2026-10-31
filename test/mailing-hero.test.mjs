import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { renderMailingHero, mailingHeadline } from '../site/assets/mailing-hero.js';

const root = path.resolve(import.meta.dirname, '..');
const content = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const h = (tag, attrs, ...children) => ({
  tag, attrs: attrs || {},
  children: children.flat().filter((x) => x !== null && x !== undefined && x !== false),
});
const nodes = (tree, predicate) => [
  ...(predicate(tree) ? [tree] : []),
  ...(tree.children || []).filter((x) => x && typeof x === 'object').flatMap((x) => nodes(x, predicate)),
];
const words = (tree) => typeof tree === 'string' ? tree : (tree.children || []).map(words).join(' ');
const item = {
  id: 'parish-week-123',
  title: 'St John’s Parish Mailing — All Saints’ Sunday',
  published: '2026-10-30T09:00:00Z',
  summary: 'The latest parish news, including this week’s services and notices.',
  url: 'https://us12.campaign-archive.com/?u=example&id=123',
};

test('mailing hero is content-only for the existing Duda hero tab', () => {
  const card = renderMailingHero(item, { h });
  assert.equal(card.tag, 'a');
  assert.equal(card.attrs.class, 'wo-mailing-hero-card is-text-only');
  assert.equal(card.attrs.href, item.url);
  assert.equal(card.attrs.target, '_blank');
  assert.equal(card.attrs.rel, 'noopener noreferrer');
  assert.match(words(card), /All Saints’ Sunday/);
  assert.match(words(card), /30 Oct 2026/);
  assert.match(words(card), /latest parish news/);
  assert.match(words(card), /Read mailing/);
  assert.equal(nodes(card, (n) => n.tag === 'img').length, 0);
  assert.equal(nodes(card, (n) => n.tag === 'time'
    && n.attrs.datetime === new Date(item.published).toISOString()).length, 1);
  assert.equal(nodes(card, (n) => n.tag === 'header' || n.tag === 'footer').length, 0);
  assert.doesNotMatch(words(card), /St John the Baptist|Old Malden|Parish weekly mailing/);
});

test('mailing title drops only a redundant mailing prefix', () => {
  assert.equal(mailingHeadline('St John’s Parish mailing - All Saints’ Sunday'), 'All Saints’ Sunday');
  assert.equal(mailingHeadline('Parish Weekly Mailing — Sample issue'), 'Sample issue');
  assert.equal(mailingHeadline('Summer Garden Party'), 'Summer Garden Party');
  assert.equal(mailingHeadline('Parish Weekly Mailing'), 'Parish Weekly Mailing');
});

test('genuine campaign photo leads the card and gracefully falls back if broken', () => {
  const image = 'https://images.example.org/newsletter-cover.jpg';
  const card = renderMailingHero({ ...item, image }, { h });
  assert.equal(card.attrs.class, 'wo-mailing-hero-card has-image');
  assert.equal(card.children[0].attrs.class, 'wo-mailing-hero-picture');
  assert.equal(card.children[1].attrs.class, 'wo-mailing-hero-copy');
  const imgs = nodes(card, (n) => n.tag === 'img');
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].attrs.src, image);
  assert.equal(imgs[0].attrs.alt, '');
  assert.equal(typeof imgs[0].attrs.onerror, 'function');
  const classes = new Set(['has-image']);
  imgs[0].attrs.onerror({ currentTarget: { closest: () => ({
    classList: { remove: (x) => classes.delete(x), add: (x) => classes.add(x) },
  }) } });
  assert.deepEqual([...classes], ['is-text-only']);
  const unsafe = renderMailingHero({ ...item, image: 'javascript:alert(1)' }, { h });
  assert.equal(nodes(unsafe, (n) => n.tag === 'img').length, 0);
});

test('demonstration content remains labelled even without a campaign image', () => {
  const card = renderMailingHero(item, { h, preview: true });
  assert.match(words(card), /Demonstration issue/);
  assert.match(card.attrs['aria-label'], /demonstration mailing/);
  assert.match(words(card), /View sample mailing/);
});

test('missing excerpt does not produce fabricated mailing text', () => {
  const card = renderMailingHero({ ...item, summary: '' }, { h });
  assert.equal(nodes(card, (n) => n.attrs?.class === 'wo-mailing-hero-summary').length, 0);
  assert.match(words(card), /Read mailing/);
});

test('invalid mailings cannot generate broken cards', () => {
  assert.throws(() => renderMailingHero(null, { h }), /valid published mailing/);
  assert.throws(() => renderMailingHero({ ...item, published: 'not-a-date' }, { h }), /valid published mailing/);
});

test('hero remains an independent mailing embed using the shared loader', () => {
  const page = content('site/mailing-hero.html');
  assert.match(page, /import \{ loadMailings \} from '\.\/assets\/mailings\.js'/);
  assert.match(page, /renderMailingHero\(latest, \{ h, preview \}\)/);
  assert.match(page, /await init\(\)/);
  assert.doesNotMatch(page, /loadEvents|events\.json|createFlipbook/);
  assert.match(page, /No mailing is available yet/);
});

test('desktop canvas stays 593×434; actual campaign image occupies the upper portion', () => {
  const css = content('site/assets/wo.css');
  const section = css.split('/* ---------- Latest mailing hero content for existing Duda Mailing tab ---------- */')[1]
    .split('/* ---------- Weekly mailing cards / archive ---------- */')[0];
  assert.match(section, /\.wo-mailing-hero-wrap\s*\{[^}]*max-width:\s*593px/);
  assert.match(section, /\.wo-mailing-hero-card\s*\{[^}]*height:\s*418px/);
  assert.match(section, /\.wo-mailing-hero-card\.has-image\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*272px\)/);
  assert.match(section, /\.wo-mailing-hero-picture img\s*\{[^}]*object-fit:\s*cover/);
  assert.match(section, /\.wo-mailing-hero-card\.has-image \.wo-mailing-hero-summary\s*\{\s*display:\s*none/);
  assert.doesNotMatch(section, /wo-mailing-hero-masthead|wo-mailing-hero-kicker|wo-mailing-hero-cta|linear-gradient/);
  assert.doesNotMatch(section, /overflow-y:\s*auto/);
  assert.match(section, /@media \(max-width:\s*520px\)[\s\S]*?\.wo-mailing-hero-card,\s*\.wo-mailing-hero-card\.has-image\s*\{[^}]*height:\s*auto/);
  assert.match(section, /\.wo-mailing-hero-card\.has-image \.wo-mailing-hero-picture\s*\{[^}]*aspect-ratio:\s*2\.1 \/ 1/);
});

test('generator retains separate mailing hero preview and 434px Duda embed', () => {
  const gen = content('site/index.html');
  assert.match(gen, /id="code-mailingHero"/);
  assert.match(gen, /id="open-mailingHero"/);
  assert.match(gen, /mailingHero:\s*iframe\('mailing-hero\.html', q, 434,/);
  for (const name of ['timetable', 'banner', 'mailings', 'whatson', 'calendar']) {
    assert.match(gen, new RegExp(name + ": iframe\\('"));
  }
});
