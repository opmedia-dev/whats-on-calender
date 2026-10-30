import test from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {
  constructor(tag = '#text') { this.tag = tag; this.children = []; this.attrs = {}; this.events = {}; this.style = { setProperty() {} }; this.hidden = false; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this.attrs[key] = value; }
  addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
  trigger(type, ev = {}) { for (const fn of this.events[type] || []) fn(ev); }
}
globalThis.Node = FakeNode;
globalThis.document = {
  createElement: (tag) => new FakeNode(tag),
  createElementNS: (_, tag) => new FakeNode(tag),
  createTextNode: (text) => Object.assign(new FakeNode(), { text }),
};
const listeners = {};
globalThis.window = {
  scrollY: 180, scrollTo(_x, y) { this.scrollY = y; },
  addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
};
window.parent = window; // Test the page without the Duda embed host.
globalThis.location = new URL('https://example.test/whats-on.html');
const historyCalls = [];
globalThis.history = {
  state: { from: 'list' },
  back() { throw new Error('Back must not use browser history'); },
  replaceState(state, _title, uri) {
    historyCalls.push({ state, uri });
    globalThis.location = new URL(uri, location.href);
  },
};
const { routeDetails } = await import('../site/assets/wo.js');

const event = (id, days) => {
  const startDate = new Date(Date.UTC(2028, 0, days, 10, 0));
  const endDate = new Date(Date.UTC(2028, 0, days, 11, 0));
  return {
    id, title: 'Community Gathering', location: '',
    series: 'gathering', recurring: true, recurrence: 'Every Monday',
    startDate, endDate, startKey: startDate.toISOString().slice(0,10),
    endKey: endDate.toISOString().slice(0,10), allDay: false,
    info: { summary: '', html: '', contacts: { emails: [], phones: [] }, attachments: [] },
  };
};
const events = [event('first', 3), event('second', 10)];

function find(root, pred) {
  if (pred(root)) return root;
  for (const item of root.children || []) {
    if (item instanceof FakeNode) { const match = find(item, pred); if (match) return match; }
  }
  return null;
}
const main = new FakeNode('main');
const detail = new FakeNode('detail');
routeDetails({ main, detail, events, backLabel: 'Back to events' });

test('Back from a future recurring date returns to the original list, not previous event', () => {
  location.hash = '#event=first';
  for (const fn of listeners.hashchange || []) fn();
  assert.equal(main.hidden, true);
  const futureDate = find(detail, (n) => n.tag === 'a' && n.attrs.href === '#event=second');
  assert.ok(futureDate, 'future date link exists');
  let defaultPrevented = false;
  futureDate.trigger('click', { preventDefault() { defaultPrevented = true; } });
  assert.equal(defaultPrevented, true);
  assert.equal(location.hash, '#event=second');
  assert.equal(main.hidden, true);
  const back = find(detail, (n) => n.tag === 'button' && n.className === 'wo-back');
  assert.ok(back, 'event detail back button exists');
  back.trigger('click');
  assert.equal(location.hash, '');
  assert.equal(main.hidden, false);
  assert.equal(detail.hidden, true);
  assert.equal(window.scrollY, 180, 'original list scroll position restored');
  assert.deepEqual(historyCalls.map((x) => x.state), [{ from:'list' }, { from:'list' }]);
});

test('Back from a directly linked future event still returns to the current embed list', () => {
  location.hash = '#event=second';
  for (const fn of listeners.hashchange || []) fn();
  assert.equal(main.hidden, true);
  const back = find(detail, (n) => n.tag === 'button' && n.className === 'wo-back');
  back.trigger('click');
  assert.equal(location.hash, '');
  assert.equal(main.hidden, false);
  assert.equal(detail.hidden, true);
});
