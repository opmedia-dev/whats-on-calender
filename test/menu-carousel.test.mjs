import test from 'node:test';
import assert from 'node:assert/strict';
import { menuHeight, menuSeconds, menuEventLimit, menuSlides, canAdvanceMenu } from '../site/assets/menu-carousel.js';

test('menu dimensions and autoplay are bounded, with sensible compact defaults', () => {
  assert.equal(menuHeight(undefined), 320);
  assert.equal(menuHeight('300'), 300);
  assert.equal(menuHeight(180), 320);
  assert.equal(menuHeight(600), 320);
  assert.equal(menuSeconds(undefined), 8);
  assert.equal(menuSeconds(''), 8); // Absent query param must still auto-rotate
  assert.equal(menuSeconds(0), 0);
  assert.equal(menuSeconds(2), 8);
  assert.equal(menuSeconds(7), 7);
  assert.equal(menuEventLimit(99), 4);
  assert.equal(menuEventLimit(6), 6);
});

test('featured events are chronological even if feed order is mixed, followed by publications', () => {
  const events = [
    {id:'late', title:'Late', startDate:new Date('2026-12-15T18:00:00Z')},
    {id:'early', title:'Early', startDate:new Date('2026-11-10T18:00:00Z')},
    {id:'last', title:'Last', startDate:new Date('2027-01-03T15:00:00Z')},
    {id:'middle', title:'Middle', startDate:new Date('2026-12-01T18:00:00Z')},
    {id:'second', title:'Second', startDate:new Date('2026-11-16T19:00:00Z')},
  ];
  const inputOrder=events.map(event=>event.id);
  const items=menuSlides({events, mailing:{title:'Mailing'}, magazine:{title:'Magazine'}, maxEvents:4});
  assert.deepEqual(items.map(item=>item.type),
    ['event','event','event','event','mailing','magazine']);
  assert.deepEqual(items.filter(item=>item.type==='event').map(item=>item.event.id),
    ['early','second','middle','late']);
  assert.deepEqual(events.map(event=>event.id),inputOrder,'source order must not be mutated');
});

test('same-day event times are ordered and unknown dates come last', () => {
  const items=menuSlides({events:[
    {id:'unknown',title:'No date'},
    {id:'evening',title:'Evening',startDate:'2026-11-15T19:00:00Z'},
    {id:'morning',title:'Morning',startDate:'2026-11-15T09:00:00Z'},
  ]});
  assert.deepEqual(items.map(item=>item.event.id),['morning','evening','unknown']);
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
