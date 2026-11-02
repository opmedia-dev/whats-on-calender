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

test('the first parish logo is preferred over a later larger campaign photograph', () => {
  const xml = [
    '<rss version="2.0"><channel><item><title>Parish weekly mailing</title>',
    '<link>https://example.org/mailings/1</link>',
    '<pubDate>Fri, 30 Oct 2026 09:00:00 GMT</pubDate>',
    '<description><![CDATA[',
    '<img width="1" height="1" src="https://example.org/open/pixel.gif">',
    '<img width="104" height="60" src="https://mcusercontent.com/parish-logo.png">',
    '<img width="630" height="360" src="https://mcusercontent.com/second-photo.jpg">',
    ']]></description></item></channel></rss>',
  ].join('');
  assert.equal(mailingImageFromHtml('<img width="104" height="60" src="https://example.org/logo.png">'), 'https://example.org/logo.png');
  assert.equal(parseMailchimpRss(xml)[0].image, 'https://mcusercontent.com/parish-logo.png');
  assert.equal(mailingImageFromHtml('<img width="1" height="1" src="https://example.org/pixel.gif"><img width="16" height="16" src="https://example.org/icon.png">'), '');
});

test('lazy image src placeholders do not displace the first real newsletter logo', () => {
  assert.equal(mailingImageFromHtml(
    '<img width="118" height="62" src="data:image/gif;base64,AA==" data-src="https://mcusercontent.com/logo.jpg">' +
    '<img width="600" height="330" src="https://mcusercontent.com/photo.jpg">'),
    'https://mcusercontent.com/logo.jpg');
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

test('both mailing placements preserve the logo rather than cropping it', () => {
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
