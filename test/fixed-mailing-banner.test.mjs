import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { eventSlots, mayAutoAdvance } from '../site/assets/banner-config.js';

const banner = fs.readFileSync(path.join(import.meta.dirname, '../site/banner.html'), 'utf8');
const css = fs.readFileSync(path.join(import.meta.dirname, '../site/assets/wo.css'), 'utf8');
const generator = fs.readFileSync(path.join(import.meta.dirname, '../site/index.html'), 'utf8');

test('both fixed publications leave two rotating event slots', () => {
  assert.equal(eventSlots({ magazine: true, mailing: true, max: 3 }), 2);
  assert.equal(eventSlots({ magazine: true, mailing: true, max: 6 }), 2);
  assert.equal(eventSlots({ magazine: true, mailing: true, max: 1 }), 1);
  assert.equal(eventSlots({ magazine: false, mailing: true, max: 3 }), 3);
  assert.equal(eventSlots({ magazine: true, mailing: false, max: 3 }), 3);
  assert.equal(eventSlots({ magazine: false, mailing: false, max: 5 }), 5);
});

test('weekly mailing remains outside event carousel and no archive footer link is added', () => {
  assert.match(banner, /const items = upcoming;/);
  assert.match(banner, /class: 'wo-banner-mailing'/);
  assert.match(banner, /banner\.insertBefore\(fixedMailing, banner\.querySelector\('\.wo-banner-side'\)\)/);
  assert.match(banner, /makeMailingCard\(latest, \{ preview: mailingData\.preview, h, icon \}\)/);
  assert.match(banner, /items\.slice\(page \* current, page \* current \+ current\)\s*\.map\(\(event\) => renderCard\(event,/);
  assert.doesNotMatch(banner, /'Past weekly mailings'/);
  assert.doesNotMatch(banner, /type: 'mailing', mailing:/);
});

test('fixed mailing and magazine receive equal desktop column widths and height alignment', () => {
  assert.match(css, /\.wo-banner\.has-side\.has-mailing \.wo-banner-main\s*\{\s*grid-column:\s*span 2/);
  assert.match(css, /\.wo-banner\.has-mailing \.wo-banner-mailing,\s*\.wo-banner\.has-side \.wo-banner-side\s*\{\s*grid-column:\s*span 1/);
  assert.match(css, /@media \(max-width: 1120px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(banner, /const syncFixedCardHeights =/);
  assert.match(banner, /wo-banner-mailing \.wo-card, \.wo-banner-side \.wo-card/);
});

test('banner autoplay still only advances event pages and respects interaction pauses', () => {
  assert.match(banner, /page = \(page \+ 1\) % pages;/);
  const base = { pages: 2, hovered: false, focusWithin: false, hidden: false, detailOpen: false, reducedMotion: false };
  assert.equal(mayAutoAdvance(base), true);
  assert.equal(mayAutoAdvance({ ...base, focusWithin: true }), false);
});

test('embed generator describes fixed publications and retains independent archive', () => {
  assert.match(generator, /Show latest weekly mailing as a fixed card/);
  assert.match(generator, /code-mailings/);
  assert.doesNotMatch(generator, /weekly Mailchimp mailing as a rotating card/);
});
