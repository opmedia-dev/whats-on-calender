import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMailchimpRss, sampleMailings, mailingImageFromHtml } from '../scripts/lib/mailing.mjs';
import { horizonDays, autoplaySeconds, mayAutoAdvance } from '../site/assets/banner-config.js';
import { makeMailingCard } from '../site/assets/mailings.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rss = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<rss version="2.0"><channel><title>Weekly Mailings</title>',
  '<item><guid isPermaLink="false">issue-1</guid>',
  '<title><![CDATA[Parish &amp; News]]></title>',
  '<link>https://example.org/campaign/1</link>',
  '<pubDate>Fri, 30 Oct 2026 09:00:00 GMT</pubDate>',
  '<description><![CDATA[<p>Sunday service &amp; notices</p>]]></description></item>',
  '<item><guid>issue-2</guid>',
  '<title>Last Week</title><link>https://example.org/campaign/2</link>',
  '<pubDate>Fri, 23 Oct 2026 09:00:00 GMT</pubDate><description>Updates</description></item>',
  '<item><guid>issue-1</guid><title>Duplicate</title>',
  '<link>https://example.org/campaign/1</link>',
  '<pubDate>Fri, 30 Oct 2026 09:00:00 GMT</pubDate></item>',
  '<item><title>Unsafe link</title><link>javascript:alert(1)</link>',
  '<pubDate>Fri, 16 Oct 2026 09:00:00 GMT</pubDate></item>',
  '</channel></rss>',
].join('');

test('RSS extracts only sent public links, deduplicates and sorts newest first', () => {
  const items = parseMailchimpRss(rss);
  assert.equal(items.length, 2);
  assert.equal(items[0].id, 'issue-1');
  assert.equal(items[0].title, 'Parish & News');
  assert.equal(items[0].url, 'https://example.org/campaign/1');
  assert.equal(items[0].summary, 'Sunday service & notices');
  assert.equal(items[1].title, 'Last Week');
});

test('mailing feed can use actual campaign artwork but ignores tracking pixels and unsafe images', () => {
  const html = '<img width="1" height="1" src="https://example.org/open/pixel.gif">' +
    '<img width="300" src="https://mcusercontent.com/example/photos/parish.jpg?x=1&amp;y=2">';
  assert.equal(mailingImageFromHtml(html),
    'https://mcusercontent.com/example/photos/parish.jpg?x=1&y=2');
  assert.equal(mailingImageFromHtml('<img width="250" src="javascript:alert(1)">'), '');
  assert.equal(mailingImageFromHtml('<img width="500" src="http://example.org/photo.jpg">'), '');
  assert.equal(mailingImageFromHtml('<img width="16" src="https://example.org/icon.png">'), '');
  const xml = [
    '<rss><channel><item><title>Parish letter</title>',
    '<link>https://example.org/campaign/1</link>',
    '<pubDate>Fri, 30 Oct 2026 09:00:00 GMT</pubDate>',
    '<description><![CDATA[<p>Parish news</p><img width="480" height="320" src="https://mcusercontent.com/example/parish.jpg">]]></description>',
    '</item></channel></rss>',
  ].join('');
  assert.equal(parseMailchimpRss(xml)[0].image, 'https://mcusercontent.com/example/parish.jpg');
  assert.equal(parseMailchimpRss(xml)[0].summary, 'Parish news');
});

test('the first editorial picture follows the verified recurring parish masthead', () => {
  // Exact image URL/order measured from the live public Mailchimp RSS
  // 2 November 2026: 533px masthead followed by 225px saints artwork.
  const masthead = 'https://mcusercontent.com/d0fc454c51d7e9daa986cd29a/images/bb22fe35-e559-23bb-c7d2-18f3dee7c289.jpg';
  const saints = 'https://mcusercontent.com/d0fc454c51d7e9daa986cd29a/images/b7a2bf63-db2b-4814-40f0-c3f7cc8cb637.jpeg';
  const html = '<img alt="" width="533" class="mcnImage" src="' + masthead + '">' +
    '<img alt="" width="225" class="mcnImage" src="' + saints + '">' +
    '<img alt="" width="562" src="https://mcusercontent.com/diary.png">';
  assert.equal(mailingImageFromHtml(html), saints);
  const xml = '<rss><channel><item><title>St Johns Parish mailing - All Saints Sunday</title>' +
    '<link>https://example.org/mailings/1</link>' +
    '<pubDate>Fri, 30 Oct 2026 09:00:00 GMT</pubDate>' +
    '<description><![CDATA[' + html + ']]></description></item></channel></rss>';
  assert.equal(parseMailchimpRss(xml)[0].image, saints);
  // Other archive editions share the masthead but their first content image varies.
  const nextIssueImage='https://mcusercontent.com/d0fc454c51d7e9daa986cd29a/images/3d53e171-2866-3d30-5be0-4d5de731a81d.jpg';
  assert.equal(mailingImageFromHtml('<img src="' + masthead + '" width="533"><img width="270" src="' + nextIssueImage + '">'), nextIssueImage);
  // The third edition starts with a smaller 92px content picture. Preserve it.
  const smallEditorial = 'https://mcusercontent.com/d0fc454c51d7e9daa986cd29a/images/88af5785-d93a-5002-d581-29abf800b6f5.jpg';
  assert.equal(mailingImageFromHtml('<img src="' + masthead + '" width="533"><img width="92" src="' + smallEditorial + '">'), smallEditorial);
});

test('masthead-only newsletters use text fallback, without selecting a later tracking image', () => {
  const masthead = 'https://mcusercontent.com/d0fc454c51d7e9daa986cd29a/images/bb22fe35-e559-23bb-c7d2-18f3dee7c289.jpg';
  assert.equal(mailingImageFromHtml('<img src="' + masthead + '" width="533">'), '');
  assert.equal(mailingImageFromHtml('<img width="490" src="https://example.org/brand-logo.png"><img width="300" src="https://example.org/article.jpg">'), 'https://example.org/article.jpg');
  assert.equal(mailingImageFromHtml('<img src="https://example.org/masthead.jpg" width="400">'), '');
  assert.equal(mailingImageFromHtml('<img width="320" src="https://example.org/genuine-first-photo.jpg">'), 'https://example.org/genuine-first-photo.jpg');
});

test('lazy-loaded mastheads do not displace the first genuine newsletter illustration', () => {
  assert.equal(mailingImageFromHtml(
    '<img width="118" height="62" src="data:image/gif;base64,AA==" data-src="https://mcusercontent.com/logo.jpg">' +
    '<img width="600" height="330" src="https://mcusercontent.com/photo.jpg">'),
    'https://mcusercontent.com/photo.jpg');
});

test('the banner mailing card displays the identical RSS image used by the mailing hero', () => {
  const h = (tag, attrs, ...children) => ({ tag, attrs: attrs || {}, children: children.flat() });
  const icon = (name) => ({ icon: name });
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...(node.children || []).flatMap(n => find(n, predicate))];
  };
  const mailing = {
    title: 'Parish mailing — All Saints', url: 'https://example.org/mailing',
    published: '2026-10-30T09:00:00Z', image: 'https://mcusercontent.com/parish-logo.png',
  };
  const card = makeMailingCard(mailing, { h, icon });
  const media = find(card, n => n.attrs?.class?.includes('wo-mailing-media'))[0];
  assert.match(media.attrs.class, /has-image/);
  const image = find(card, n => n.tag === 'img')[0];
  assert.equal(image.attrs.src, mailing.image);
  assert.match(image.attrs.alt, /All Saints/);
  const parent = { classList: { remove(name) { media.attrs.class = media.attrs.class.replace(name, '').trim(); } } };
  let removed = false;
  image.attrs.onerror({ currentTarget: { parentElement: parent, remove() { removed = true; } } });
  assert.equal(removed, true);
  assert.doesNotMatch(media.attrs.class, /has-image/);

  const noImage = makeMailingCard({ ...mailing, image: '' }, { h, icon });
  assert.equal(find(noImage, n => n.tag === 'img').length, 0);
  const unsafe = makeMailingCard({ ...mailing, image: 'javascript:alert(1)' }, { h, icon });
  assert.equal(find(unsafe, n => n.tag === 'img').length, 0);
});

test('both mailing placements preserve the selected editorial image without cropping', () => {
  const css = readFileSync(fileURLToPath(new URL('../site/assets/wo.css', import.meta.url)), 'utf8');
  assert.match(css, /\.wo-mailing-media \.wo-mailing-cover\s*\{[^}]*object-fit: contain/);
  assert.match(css, /\.wo-mailing-hero-picture img\s*\{[^}]*object-fit: contain/);
});

test('malformed RSS is rejected, valid empty RSS is accepted', () => {
  assert.throws(() => parseMailchimpRss('<html>broken</html>'), /RSS/);
  assert.deepEqual(parseMailchimpRss('<rss version="2.0"><channel></channel></rss>'), []);
});

test('sample mailings are clearly marked, without pretending to be real', () => {
  const preview = sampleMailings(new Date('2026-10-30T15:00:00Z'));
  assert.equal(preview.preview, true);
  assert.equal(preview.mailings.length, 1);
  assert.match(preview.mailings[0].title, /sample/i);
  assert.match(preview.mailings[0].summary, /not a real mailing/i);
});

test('banner event horizon defaults to two weeks', () => {
  assert.equal(horizonDays(undefined), 14);
  assert.equal(horizonDays('14'), 14);
  assert.equal(horizonDays('0'), 14);
  assert.equal(horizonDays('120'), 14);
  assert.equal(horizonDays('7'), 7);
});

test('banner autoplay defaults to eight seconds and allows disabling', () => {
  assert.equal(autoplaySeconds(undefined), 8);
  assert.equal(autoplaySeconds('8'), 8);
  assert.equal(autoplaySeconds('0'), 0);
  assert.equal(autoplaySeconds('2'), 8);
  assert.equal(autoplaySeconds('60'), 60);
});

test('automatic rotation pauses for attention, hidden tab, opened details and reduced motion', () => {
  const settings = { pages: 3, hovered: false, focusWithin: false, hidden: false, detailOpen: false, reducedMotion: false };
  assert.equal(mayAutoAdvance(settings), true);
  for (const key of ['hovered','focusWithin','hidden','detailOpen','reducedMotion']) {
    assert.equal(mayAutoAdvance({ ...settings, [key]: true }), false, key);
  }
  assert.equal(mayAutoAdvance({ ...settings, pages: 1 }), false);
});
