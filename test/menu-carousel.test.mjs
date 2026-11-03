import test from 'node:test';
import assert from 'node:assert/strict';
import { menuHeight, menuSeconds, menuEventLimit, menuSlides, canAdvanceMenu } from '../site/assets/menu-carousel.js';

test('menu dimensions and autoplay are bounded, with sensible compact defaults', () => {
  assert.equal(menuHeight(undefined), 320);
  assert.equal(menuHeight('300'), 300);
  assert.equal(menuHeight(180), 320);
  assert.equal(menuHeight(600), 320);
  assert.equal(menuSeconds(undefined), 8);
  assert.equal(menuSeconds(0), 0);
  assert.equal(menuSeconds(2), 8);
  assert.equal(menuSeconds(7), 7);
  assert.equal(menuEventLimit(99), 4);
  assert.equal(menuEventLimit(6), 6);
});

test('featured events, mailing and magazine are all rotating slides', () => {
  const events = Array.from({length: 5}, (_, n) => ({id: String(n+1)}));
  const items = menuSlides({events, mailing: {title:'Mailing'}, magazine:{title:'Magazine'}, maxEvents:4});
  assert.deepEqual(items.map(item => item.type), ['event','mailing','event','magazine','event','event']);
  assert.deepEqual(items.filter(item => item.type === 'event').map(item => item.event.id), ['1','2','3','4']);
});

test('publication slides remain when calendar data or an external feed is unavailable', () => {
  assert.deepEqual(menuSlides({events:[], mailing:null, magazine:{title:'Magazine'}}).map(x=>x.type),['magazine']);
  assert.deepEqual(menuSlides({events:[{id:'a'}], mailing:null, magazine:null}).map(x=>x.type),['event']);
  assert.deepEqual(menuSlides({events:[]}),[]);
});

test('autoplay pauses for hover, focus, hidden tabs, user pause and reduced motion', () => {
  assert.equal(canAdvanceMenu({slideCount:3}), true);
  for (const field of ['paused','hovered','focused','hidden','reducedMotion']) {
    assert.equal(canAdvanceMenu({slideCount:3, [field]: true}), false, field);
  }
  assert.equal(canAdvanceMenu({slideCount:1}), false);
});
