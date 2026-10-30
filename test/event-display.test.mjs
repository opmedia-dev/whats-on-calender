import test from 'node:test';
import assert from 'node:assert/strict';

// The shared browser module does not use the DOM until a view is initialised.
globalThis.location = { search: '' };
globalThis.window = { parent: null };
const { isUpcoming } = await import('../site/assets/wo.js');

const now = new Date('2026-10-30T15:00:00Z');
const event = (end) => ({ endDate: new Date(end), endKey: '2026-10-30' });

test('a service that finished earlier today is not upcoming', () => {
  assert.equal(isUpcoming(event('2026-10-30T09:00:00Z'), now), false);
});

test('an event in progress or later today remains upcoming', () => {
  assert.equal(isUpcoming(event('2026-10-30T16:00:00Z'), now), true);
  assert.equal(isUpcoming(event('2026-10-30T19:30:00Z'), now), true);
});

test('an event ending exactly now is no longer upcoming', () => {
  assert.equal(isUpcoming(event(now.toISOString()), now), false);
});

test('events crossing midnight remain upcoming until their real end', () => {
  assert.equal(isUpcoming({ endDate: new Date('2026-10-31T01:00:00Z'), endKey: '2026-10-31' }, now), true);
});

test('a current all-day event remains visible through its end', () => {
  assert.equal(isUpcoming(event('2026-10-30T23:59:59Z'), now), true);
});
