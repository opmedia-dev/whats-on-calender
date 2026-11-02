import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { eventCategory, suggestedCategory } from '../scripts/lib/event-category.mjs';

const root = path.resolve(import.meta.dirname, '..');
const backend = fs.readFileSync(path.join(root, 'admin/apps-script/Code.gs'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'admin/apps-script/Index.html'), 'utf8');
const published = fs.readFileSync(path.join(root, 'site/admin-demo.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'admin/apps-script/appsscript.json'), 'utf8'));
const sync = fs.readFileSync(path.join(root, 'scripts/sync-calendar.mjs'), 'utf8');
function setup(role = 'writer') {
  const events = [];
  const event = {
    id: 'event123', summary: 'Community Coffee Morning',
    start: { dateTime: '2026-11-08T10:00:00+00:00' },
    end: { dateTime: '2026-11-08T11:00:00+00:00' },
    etag: '"etag123"', description: '<p>Original <strong>formatted</strong> description</p>',
    recurrence: [], extendedProperties: { shared: { otherField: 'preserve' } },
  };
  let lockCalls = 0;
  const context = vm.createContext({
    Calendar: {
      CalendarList: { get: () => ({ summary: 'Parish', accessRole: role }) },
      Events: {
        get: () => event,
        list: () => ({ items: [event] }),
        patch: (body, calendarId, eventId) => {
          events.push({ kind: 'patch', body, calendarId, eventId });
          return { id: eventId };
        },
        insert: (body) => { events.push({ kind: 'insert', body }); return { id: 'new' }; },
        remove: (calendarId, id) => { events.push({ kind: 'remove', id }); },
      },
    },
    LockService: { getScriptLock: () => ({
      tryLock: () => { lockCalls++; return true; },
      releaseLock: () => { lockCalls++; },
    }) },
    Utilities: {
      formatDate: (date, zone, fmt) => {
        const d = new Date(date);
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(d);
        const obj = Object.fromEntries(parts.map(x => [x.type, x.value]));
        if (fmt === 'yyyy-MM-dd') return obj.year + '-' + obj.month + '-' + obj.day;
        if (fmt === 'HH:mm') return obj.hour + ':' + obj.minute;
        throw new Error('unsupported fmt');
      },
    },
  });
  vm.runInContext(backend, context, { filename: 'Code.gs' });
  return { context, events, event, get lockCalls() { return lockCalls; } };
}

test('event type is explicit metadata, with conservative fallback for older calendar entries', () => {
  assert.deepEqual(eventCategory({ summary: 'Communion' }), { category: 'worship', source: 'suggested' });
  assert.deepEqual(eventCategory({ summary: 'Fundraiser', extendedProperties: { shared: { woCategory: 'music' } } }),
    { category: 'music', source: 'selected' });
  assert.equal(eventCategory({ summary: 'Unexpected event' }).category, 'general');
  assert.equal(suggestedCategory('Community Coffee Morning'), 'community');
  assert.equal(eventCategory({ summary: 'Misc', recurringEventId: '123' },
    { extendedProperties: { shared: { woCategory: 'heritage' } } }).category, 'heritage');
  assert.match(sync, /category: category\.category/);
  assert.match(sync, /featured: Boolean\(image\)/);
});

test('read-only calendar accounts cannot list or edit parish events', () => {
  const { context, events } = setup('reader');
  assert.throws(() => context.editorBootstrap(), /does not have permission/);
  assert.throws(() => context.editorListEvents('2026-11-01', '2026-11-30'), /does not have permission/);
  assert.throws(() => context.editorSaveEvent({}), /does not have permission/);
  assert.equal(events.length, 0);
});

test('authorised editors can query a month or week but not arbitrary historical bulk ranges', () => {
  const { context } = setup();
  assert.equal(context.editorBootstrap().calendarName, 'Parish');
  assert.equal(context.editorListEvents('2026-11-01', '2026-11-30').length, 1);
  assert.throws(() => context.editorListEvents('2020-01-01', '2021-01-01'), /within 93 days/);
});

test('a calendar event category can be saved without altering an unchanged HTML description', () => {
  const { context, events, event, lockCalls } = setup();
  const payload = {
    id: event.id, editScope: 'occurrence', revision: event.etag, title: event.summary,
    startDate: '2026-11-08', endDate: '2026-11-08',
    startTime: '10:00', endTime: '11:00', repeat: 'none', allDay: false,
    description: 'formatted description', descriptionChanged: false,
    category: 'community', location: 'Church Hall',
  };
  assert.equal(context.editorSaveEvent(payload).saved, true);
  assert.equal(events[0].kind, 'patch');
  assert.equal(events[0].body.extendedProperties.shared.woCategory, 'community');
  assert.equal('description' in events[0].body, false);
  assert.equal(lockCalls, 2);
  assert.throws(() => context.editorSaveEvent({ ...payload, revision: 'old' }), /Reload/);
  assert.throws(() => context.editorSaveEvent({ ...payload, category: 'unknown' }), /valid event category/);
});

test('new events write to the Calendar API with weekly recurrence and time-zone', () => {
  const { context, events } = setup();
  const result = context.editorSaveEvent({
    title: 'Weekly Choir', startDate: '2026-11-09', endDate: '2026-11-09',
    startTime: '19:30', endTime: '20:30', category: 'music', repeat: 'weekly',
    description: 'Visitors welcome', allDay: false,
  });
  assert.equal(result.id, 'new');
  assert.equal(events[0].kind, 'insert');
  assert.equal(events[0].body.start.timeZone, 'Europe/London');
  assert.equal(events[0].body.recurrence[0], 'RRULE:FREQ=WEEKLY;BYDAY=MO');
  assert.equal(events[0].body.description, 'Visitors welcome');
});

test('frontend contains month/week controls, side-by-side form/preview and a safe demo', () => {
  assert.match(frontend, /id="month"/);
  assert.match(frontend, /id="week"/);
  assert.match(frontend, /id="calendar"/);
  assert.match(frontend, /class="layout"/);
  assert.match(frontend, /grid-template-columns:minmax\(0,1\.05fr\) minmax\(0,\.95fr\)/);
  assert.match(frontend, /@media\(max-width:930px\)/);
  assert.match(frontend, /id="category"/);
  assert.match(frontend, /id="artTitle"/);
  assert.match(frontend, /editorListEvents/);
  assert.match(frontend, /editorSaveEvent/);
  assert.doesNotMatch(frontend, /featuredEvent|featuredCheckbox|id="featured"/);
  assert.match(published, /Demonstration · read-only/);
  assert.match(published, /noindex,nofollow/);
});

test('Google OAuth stays user-bound, with no write credentials in the GitHub Pages page', () => {
  assert.equal(manifest.webapp.executeAs, 'USER_ACCESSING');
  assert.equal(manifest.webapp.access, 'ANYONE');
  assert.deepEqual(manifest.oauthScopes, [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  ]);
  assert.doesNotMatch(published, /ScriptApp\.getOAuthToken|GOOGLE_API_KEY|client_secret|access_token/);
});
