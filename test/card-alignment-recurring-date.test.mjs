import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

class FakeNode {
  constructor(tag, text = '') { this.tag = tag; this.text = text; this.children = []; this.attributes = {}; this.className = ''; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(key, value) { this.attributes[key] = value; }
}
globalThis.Node = FakeNode;
globalThis.document = {
  createElement: (tag) => new FakeNode(tag),
  createElementNS: (_namespace, tag) => new FakeNode(tag),
  createTextNode: (text) => new FakeNode('#text', String(text)),
};
globalThis.location = { search: '' };
globalThis.window = { parent: null };
const { renderCard, nextPerSeries } = await import('../site/assets/wo.js');

function findAll(node, predicate) {
  return [ ...(predicate(node) ? [node] : []),
    ...node.children.filter((x) => x instanceof FakeNode).flatMap((c) => findAll(c, predicate)) ];
}
function textOf(node) { return [node.text || '', ...node.children.map(textOf)].join(''); }
const entry = (id, day) => {
  const startDate = new Date(`2026-11-${String(day).padStart(2,'0')}T10:00:00Z`);
  return {
    id, title: 'Coffee Morning', location: 'Parish Centre',
    series: 'coffeemorning', recurring: true, recurrence: 'Every Monday',
    startDate, startKey: `2026-11-${String(day).padStart(2,'0')}`,
    endKey: `2026-11-${String(day).padStart(2,'0')}`, allDay: false,
    info: { image: {src:'example.jpg',width:640,height:400}, summary:'' },
  };
};

test('recurring cards show the next date badge and regular label together', () => {
  const event = nextPerSeries([entry('one',2), entry('two',9)])[0];
  const card = renderCard(event, {showRecurrence:true});
  const media = findAll(card, (x) => x.className === 'wo-card-media')[0];
  const badge = findAll(media, (x) => x.className === 'wo-date-badge')[0];
  const label = findAll(media, (x) => x.className === 'wo-tag wo-tag-regular')[0];
  assert.ok(badge);
  assert.ok(label);
  assert.equal(textOf(badge), '2Nov');
  assert.match(badge.attributes['aria-label'], /Next date: Monday 2 November/);
  assert.match(textOf(label), /Regular/);
  assert.match(textOf(card), /Every Monday/);
});

test('a non-recurring card still has a date badge but no regular label', () => {
  const card = renderCard({...entry('special',3), recurring:false}, {showRecurrence:true});
  assert.equal(findAll(card, (x) => x.className === 'wo-date-badge').length,1);
  assert.equal(findAll(card, (x) => x.className === 'wo-tag wo-tag-regular').length,0);
});

test('dated cards in week/month filters still display dates', () => {
  const card = renderCard(entry('weekly',2), {showRecurrence:false});
  const badge = findAll(card, (x) => x.className === 'wo-date-badge')[0];
  assert.equal(textOf(badge), '2Nov');
});

test('magazine card uses event card image/body/title/meta structure', () => {
  const html = fs.readFileSync(path.join(import.meta.dirname,'../site/banner.html'),'utf8');
  const css = fs.readFileSync(path.join(import.meta.dirname,'../site/assets/wo.css'),'utf8');
  assert.match(html, /wo-card wo-magazine-card/);
  assert.match(html, /wo-card-media wo-magazine-cover/);
  assert.match(html, /wo-card-body wo-magazine-body/);
  assert.match(html, /wo-card-title wo-magazine-title/);
  assert.match(html, /syncMagazineHeight\(\)/);
  assert.match(css, /\.wo-banner\.has-side\s*\{\s*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.wo-tag-regular\s*\{\s*left:\s*auto;\s*right:\s*12px/);
});
