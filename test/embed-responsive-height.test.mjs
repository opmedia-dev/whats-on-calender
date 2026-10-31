import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const messages = [];
const listeners = {};
let bottom = 140;
let loading = true;
let observer;
let readyObserver;
const content = { getBoundingClientRect: () => ({ bottom }) };
const body = { getBoundingClientRect: () => ({ bottom }) };

globalThis.location = { search: '' };
globalThis.window = {
  parent: { postMessage: (message) => messages.push(message) },
  scrollY: 0,
  addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
};
globalThis.document = {
  body,
  documentElement: { classList: { add() {} } },
  querySelector(selector) {
    if (selector === 'main') return content;
    if (selector === '.wo-loading') return loading ? { className: 'wo-loading' } : null;
    return null;
  },
};
globalThis.ResizeObserver = class {
  constructor(callback) { observer = callback; }
  observe(node) { assert.ok(node === content || node === body); }
};
globalThis.MutationObserver = class {
  constructor(callback) { readyObserver = callback; }
  observe(node, opts) {
    assert.equal(node, content);
    assert.equal(opts.subtree, true);
  }
  disconnect() {}
};
const { reportHeight } = await import('../site/assets/wo.js');

test('all embedded views measure real content and send both growth and shrinkage', () => {
  reportHeight();
  assert.equal(messages.length, 0, 'do not shrink an iframe while initial loading is visible');
  loading = false;

  // Weekly timetable: if completed content happens to have the same box
  // dimensions as the loading placeholder, mutation still starts reporting.
  bottom = 370;
  readyObserver();
  assert.equal(messages.at(-1).height, 370);
  assert.equal(messages.at(-1).source, 'whatson');

  // Banner with a fixed newsletter + magazine: taller publication row
  bottom = 610;
  observer();
  assert.equal(messages.at(-1).height, 610);

  // Mobile reflow: stack or hide desktop-only elements -> legitimate shrink
  window.innerWidth = 390;
  bottom = 345;
  for (const fn of listeners.resize || []) fn();
  assert.equal(messages.at(-1).height, 345, 'do not suppress shrinking on narrow layouts');

  // Event detail (poster/attachments) can be much taller
  bottom = 1320;
  observer();
  assert.equal(messages.at(-1).height, 1320);

  // Back to events / calendar list should reclaim the extra space
  bottom = 260;
  observer();
  assert.equal(messages.at(-1).height, 260);

  // Mailchimp archive search filters to fewer results: reclaim space
  bottom = 185;
  observer();
  assert.equal(messages.at(-1).height, 185);

  const count = messages.length;
  observer();
  assert.equal(messages.length, count, 'unchanged content must not create a message loop');
});

test('staging notice above main is counted; iframe viewport height is irrelevant', () => {
  bottom = 290; // includes notice above main
  window.scrollY = 0;
  observer();
  assert.equal(messages.at(-1).height, 290);
  window.scrollY = 25;
  bottom = 265;
  observer();
  assert.equal(messages.at(-1).height, 290, 'scrolling should not alter document content height');
  window.scrollY = 0;
  // A preview warning inserted before main changes its bottom position
  // without changing the dimensions of main itself; observing body catches it.
  bottom = 335;
  observer();
  assert.equal(messages.at(-1).height, 335);
});

test('mobile breakpoints, all embeds and generated Duda resizing script remain present', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const css = fs.readFileSync(path.join(root,'site/assets/wo.css'),'utf8');
  const banner = fs.readFileSync(path.join(root,'site/banner.html'),'utf8');
  const generator = fs.readFileSync(path.join(root,'site/index.html'),'utf8');
  for (const name of ['timetable', 'banner', 'whats-on', 'calendar', 'mailings']) {
    assert.match(generator, new RegExp("iframe\\('"+name+"\\.html'"), 'generator includes ' + name);
  }
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(max-width: 580px\)/);
  assert.match(css, /\.wo-cal\.is-auto \.wo-cal-list\s*\{\s*display:\s*grid;/);
  assert.match(banner, /measuredWidth = cardsEl\.getBoundingClientRect\(\)\.width/);
  assert.match(banner, /Math\.abs\(width - measuredWidth\) < 1/);
  assert.match(generator, /d\.type==='height'/);
});
