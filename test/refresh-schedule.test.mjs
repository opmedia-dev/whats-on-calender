import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { nextScheduledCheck, formatRemaining, nextRefreshStatus } from '../site/assets/refresh-schedule.js';

const root=path.resolve(import.meta.dirname,'..');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/deploy.yml'),'utf8');
const manager=fs.readFileSync(path.join(root,'site/index.html'),'utf8');
const editor=fs.readFileSync(path.join(root,'admin/apps-script/Index.html'),'utf8');
const editorDemo=fs.readFileSync(path.join(root,'site/admin-demo.html'),'utf8');

test('countdown matches staggered external cron at :03, :18, :33 and :48',()=>{
 assert.match(workflow,/cron:\s*'\*\/15 \* \* \* \*'/);
 assert.match(workflow,/Sync Mailchimp sent-campaign RSS/);
 assert.match(workflow,/Sync Google Calendar/);
 for(const [now,expected] of [
  ['2026-11-02T21:15:31Z','2026-11-02T21:18:00Z'],
  ['2026-11-02T21:17:59Z','2026-11-02T21:18:00Z'],
  ['2026-11-02T21:18:00Z','2026-11-02T21:33:00Z'],
  ['2026-11-02T23:59:59Z','2026-11-03T00:03:00Z'],
  ['2026-03-29T00:59:59Z','2026-03-29T01:03:00Z'],
 ]){
  assert.equal(nextScheduledCheck(Date.parse(now)),Date.parse(expected));
 }
});

test('remaining time is nonnegative, accurate and second-padded',()=>{
 const next=Date.parse('2026-11-02T21:18:00Z');
 assert.equal(formatRemaining(Date.parse('2026-11-02T21:15:31Z'),next),'2m 29s');
 assert.equal(formatRemaining(next-1000,next),'0m 01s');
 assert.equal(formatRemaining(next+6000,next),'0m 00s');
 assert.throws(()=>nextScheduledCheck(Number.NaN),/finite timestamp/);
});

test('next scheduled UK time observes GMT and British Summer Time',()=>{
 assert.deepEqual(nextRefreshStatus(Date.parse('2026-11-02T21:15:31Z')),{
  countdown:'2m 29s',localTime:'21:18',next:Date.parse('2026-11-02T21:18:00Z'),
 });
 assert.equal(nextRefreshStatus(Date.parse('2026-07-02T20:16:00Z')).localTime,'21:18');
});

test('embed manager shows timer, workflow history and disclaimer without changing embeds',()=>{
 assert.match(manager,/id="refresh-countdown"/);
 assert.match(manager,/id="refresh-time"/);
 assert.match(manager,/assets\/refresh-schedule\.js/);
 assert.match(manager,/setInterval\(updateRefreshCountdown, 1000\)/);
 assert.match(manager,/cron-job.org/);
 assert.match(manager,/:03, :18, :33 and :48/);
 assert.match(manager,/refresh-history/);
 assert.match(manager,/actions\/workflows\/deploy\.yml/);
 assert.match(manager,/id="code-whatson"/);
});

test('Apps Script Event Manager and public editor demo show the same countdown',()=>{
 for(const page of [editor,editorDemo]){
  assert.match(page,/id="refresh-countdown"/);
  assert.match(page,/id="refresh-time"/);
  assert.match(page,/Math\.floor\(\(now-3\*60000\)\/\(15\*60000\)\)/);
  assert.match(page,/Europe\/London/);
  assert.match(page,/setInterval\(updateRefreshCountdown,1000\)/);
  assert.match(page,/cron-job.org/);
  assert.match(page,/id="refresh-history"/);
 }
});
