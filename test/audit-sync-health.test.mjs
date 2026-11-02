import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRuns } from '../scripts/audit-sync-health.mjs';

const NOW = Date.parse('2026-11-02T22:00:00Z');
const run = (conclusion, minutesOld, status = 'completed') => ({
  status,
  conclusion,
  created_at: new Date(NOW - (minutesOld + 1) * 60000).toISOString(),
  updated_at: new Date(NOW - minutesOld * 60000).toISOString(),
});

test('success, including an unchanged-content run, is healthy', () => {
  assert.equal(classifyRuns([run('success', 20)], NOW).healthy, true);
});
test('a later failure overrides an older success', () => {
  const state = classifyRuns([run('success', 30), run('failure', 5)], NOW);
  assert.equal(state.healthy, false);
  assert.match(state.reason, /failure/);
});
test('cancelled runs are unhealthy', () => {
  assert.equal(classifyRuns([run('cancelled', 5)], NOW).healthy, false);
});
test('successful runs older than an hour are stale', () => {
  assert.equal(classifyRuns([run('success', 61)], NOW).healthy, false);
});
test('an in-progress run does not erase recent success', () => {
  assert.equal(classifyRuns([run(null, 1, 'in_progress'), run('success', 20)], NOW).healthy, true);
});
test('no completed runs is unhealthy', () => {
  assert.equal(classifyRuns([], NOW).healthy, false);
});
