import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareCalendarOutput, assertMailingsReady } from '../scripts/lib/output-data.mjs';

const fixture = (run) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'whats-on-mailings-'));
  try { run(temp); } finally { fs.rmSync(temp, { recursive: true, force: true }); }
};

test('calendar event refresh preserves an already imported real Mailchimp feed', () => fixture((dataDir) => {
  const live = { preview: false, generated: '2026-11-02T11:32:33Z',
    mailings: Array.from({ length: 10 }, (_, i) => ({ id: String(i), title: 'Weekly Mailing ' + i })) };
  fs.writeFileSync(path.join(dataDir, 'mailings.json'), JSON.stringify(live));
  fs.writeFileSync(path.join(dataDir, 'events.json'), JSON.stringify({ events: ['stale'] }));
  fs.mkdirSync(path.join(dataDir, 'media'));
  fs.mkdirSync(path.join(dataDir, 'files'));
  fs.writeFileSync(path.join(dataDir, 'media', 'stale.webp'), 'old');
  fs.writeFileSync(path.join(dataDir, 'files', 'stale.pdf'), 'old');
  fs.writeFileSync(path.join(dataDir, 'other-data.json'), '{"keep":true}');

  prepareCalendarOutput(dataDir);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'mailings.json'), 'utf8')), live);
  assert.equal(assertMailingsReady(dataDir, { liveFeedConfigured: true }), true);
  assert.equal(fs.existsSync(path.join(dataDir, 'media', 'stale.webp')), false);
  assert.equal(fs.existsSync(path.join(dataDir, 'files')), false);
  assert.equal(fs.existsSync(path.join(dataDir, 'events.json')), false);
  assert.equal(fs.existsSync(path.join(dataDir, 'media')), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'other-data.json'), 'utf8')), { keep: true });
}));

test('a configured Mailchimp RSS feed cannot deploy missing, sample or empty data', () => fixture((dataDir) => {
  const file = path.join(dataDir, 'mailings.json');
  assert.throws(() => assertMailingsReady(dataDir, { liveFeedConfigured: true }), /missing/);
  assert.equal(assertMailingsReady(dataDir), false);
  fs.writeFileSync(file, JSON.stringify({ preview: true, mailings: [{ title: 'sample' }] }));
  assert.throws(() => assertMailingsReady(dataDir, { liveFeedConfigured: true }), /no real mailings/);
  fs.writeFileSync(file, JSON.stringify({ preview: false, mailings: [] }));
  assert.throws(() => assertMailingsReady(dataDir, { liveFeedConfigured: true }), /no real mailings/);
  fs.writeFileSync(file, '{broken');
  assert.throws(() => assertMailingsReady(dataDir, { liveFeedConfigured: true }), /invalid JSON/);
  fs.writeFileSync(file, JSON.stringify({ preview: false, mailings: [{ title: 'Actual mailing' }] }));
  assert.equal(assertMailingsReady(dataDir, { liveFeedConfigured: true }), true);
}));

test('unconfigured pre-rollout environments can still publish labelled sample mailings', () => fixture((dataDir) => {
  fs.writeFileSync(path.join(dataDir, 'mailings.json'), JSON.stringify({ preview: true, mailings: [{ title: 'Sample mailing' }] }));
  assert.equal(assertMailingsReady(dataDir, { liveFeedConfigured: false }), true);
}));
