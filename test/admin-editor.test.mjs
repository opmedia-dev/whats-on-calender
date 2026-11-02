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
  assert.match(sync, /featured: eventFeatured\(e, master\)/);
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
  const fixture = setup();
  const { context, events, event } = fixture;
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
  assert.equal(events[0].body.extendedProperties.shared.woFeatured, 'false');
  assert.equal(events[0].body.extendedProperties.shared.woImageFocus, '50,50');
  assert.equal('description' in events[0].body, false);
  assert.equal(fixture.lockCalls, 2);
  assert.throws(() => context.editorSaveEvent({ ...payload, revision: 'old' }), /Reload/);
  assert.throws(() => context.editorSaveEvent({ ...payload, category: 'unknown' }), /valid event category/);
});

test('featured selection round-trips and can be turned off without removing images', () => {
  const { context, event, events } = setup();
  event.extendedProperties.shared.woFeatured = 'true';
  assert.equal(context.editorGetEvent(event.id, 'occurrence').featured, true);
  const payload = {
    id: event.id, editScope: 'occurrence', revision: event.etag, title: event.summary,
    startDate: '2026-11-08', endDate: '2026-11-08',
    startTime: '10:00', endTime: '11:00', repeat: 'none', allDay: false,
    category: 'community', featured: false,
  };
  context.editorSaveEvent(payload);
  assert.equal(events[0].body.extendedProperties.shared.woFeatured, 'false');
  assert.equal(events[0].body.extendedProperties.shared.otherField, 'preserve');
  context.editorSaveEvent({ ...payload, featured: true });
  assert.equal(events[1].body.extendedProperties.shared.woFeatured, 'true');
});

test('image focus persists, is validated and retains unrelated shared properties', () => {
  const { context, event, events } = setup();
  event.extendedProperties.shared.woImageFocus = '75,20';
  assert.equal(context.editorGetEvent(event.id, 'occurrence').imageFocus, '75,20');
  const payload = {
    id:event.id, editScope:'occurrence', revision:event.etag, title:event.summary,
    startDate:'2026-11-08',endDate:'2026-11-08',startTime:'10:00',endTime:'11:00',
    repeat:'none', allDay:false, category:'community',imageFocus:'80,30',
  };
  context.editorSaveEvent(payload);
  assert.equal(events[0].body.extendedProperties.shared.woImageFocus, '80,30');
  assert.equal(events[0].body.extendedProperties.shared.otherField,'preserve');
  context.editorSaveEvent({...payload,imageFocus:'url(javascript:evil)'});
  assert.equal(events[1].body.extendedProperties.shared.woImageFocus,'50,50');
});

test('custom recurrence supports selected weekdays, intervals and termination', () => {
  const { context, events } = setup();
  const payload = {
    title:'Coffee Morning',startDate:'2026-11-03',endDate:'2026-11-03',
    startTime:'10:00',endTime:'11:00',category:'community',allDay:false,
    repeat:'custom',customRepeat:{unit:'WEEKLY',interval:2,days:['TU','TH'],
      ends:'count',count:12},
  };
  context.editorSaveEvent(payload);
  assert.equal(events[0].body.recurrence[0],'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;COUNT=12');
  context.editorSaveEvent({...payload,customRepeat:{unit:'MONTHLY',interval:3,days:[],
    ends:'until',until:'2027-03-01'}});
  assert.match(events[1].body.recurrence[0],/^RRULE:FREQ=MONTHLY;INTERVAL=3;UNTIL=20270301T235959Z$/);
  assert.throws(()=>context.editorSaveEvent({...payload,customRepeat:{unit:'WEEKLY',
    interval:0,days:['TU'],ends:'never'}}),/Repeat interval/);
  assert.throws(()=>context.editorSaveEvent({...payload,customRepeat:{unit:'WEEKLY',
    interval:1,days:[],ends:'never'}}),/Choose at least one weekday/);
});

test('editor exposes a signed-in attachment handler while preserving existing attachments', () => {
  assert.match(backend, /function editorUploadFile\(form\)/);
  assert.match(backend, /editorAccess_\(\)/);
  assert.match(backend, /attachmentsFor_\(record.target\)/);
  assert.match(backend, /supportsAttachments: true/);
  assert.match(backend, /Drive\.Files\.create/);
  assert.match(backend, /Drive\.Permissions\.create/);
  assert.match(backend, /MAX_EVENT_UPLOAD_BYTES = 8 \* 1024 \* 1024/);
  assert.match(frontend, /editorUploadFile/);
});

test('header image metadata is event-scoped and rejects a file from another draft', () => {
  const { context, event, events } = setup();
  event.attachments = [
    { fileId:'drive-img-one', title:'First poster', mimeType:'image/png', fileUrl:'https://drive.google.com/file/d/one/view' },
    { fileId:'drive-img-two', title:'Second poster', mimeType:'image/jpeg', fileUrl:'https://drive.google.com/file/d/two/view' },
  ];
  const input = {
    id:event.id, editScope:'occurrence', revision:event.etag,
    title:event.summary, startDate:'2026-11-08', endDate:'2026-11-08',
    startTime:'10:00', endTime:'11:00', repeat:'none', allDay:false,
    descriptionChanged:false, category:'community',
    headerImageId:'drive-img-two',
  };
  assert.equal(context.editorGetEvent(event.id,'occurrence').attachments.length,2);
  context.editorSaveEvent(input);
  assert.equal(events[0].body.extendedProperties.shared.woHeaderImageId,'drive-img-two');
  assert.equal(events[0].body.extendedProperties.shared.otherField,'preserve');
  context.editorSaveEvent({...input,headerImageId:'none'});
  assert.equal(events[1].body.extendedProperties.shared.woHeaderImageId,'none');
  assert.throws(()=>context.editorSaveEvent({...input,headerImageId:'drive-from-another-event'}),/not attached to this event/);
  assert.equal(events.length,2, 'rejected cross-event header must not modify the calendar');
});

test('public sync separates header photo, additional gallery pictures and downloads', () => {
  assert.match(sync, /woHeaderImageId/);
  assert.match(sync, /headerFileId === 'none'/);
  assert.match(sync, /imageCandidates\.find\(\(a\) => a\.fileId === headerFileId\)/);
  assert.match(sync, /const gallery =/);
  assert.match(sync, /gallery,\s*attachments: files/);
  const shared = fs.readFileSync(path.join(root,'site/assets/wo.js'),'utf8');
  assert.match(shared, /d\.gallery \|\| \[\]/);
  assert.match(shared, /const gallery = info\.gallery\?\.length/);
  assert.match(shared, /More event photos/);
  assert.match(shared, /wo-detail-gallery/);
  assert.match(frontend, /id="imageRole"/);
  assert.match(frontend, /Use as header/);
  assert.match(frontend, /No header image \(use category placeholder\)/);
  assert.match(frontend, /attachment-thumb/);
  assert.match(frontend, /headerMediaSelection/);
  assert.match(frontend, /frame\.setPointerCapture\(event\.pointerId\)/);
  assert.match(frontend, /img\.addEventListener\('dragstart'/);
  assert.match(frontend, /function resetDraftImage\(\)/);
  assert.match(frontend, /state\.draftImageUrl/);
  assert.match(frontend, /resetDraftImage\(\);attachmentList\(e\.attachments\|\|\[\]\)/);
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
  assert.equal(events[0].body.extendedProperties.shared.woFeatured, 'false');
});

test('frontend contains month/week controls, side-by-side form/preview and a safe demo', () => {
  assert.match(frontend, /id="month"/);
  assert.match(frontend, /id="week"/);
  assert.match(frontend, /id="calendar"/);
  assert.match(frontend, /class="layout"/);
  assert.match(frontend, /<dialog id="editorDialog"/);
  assert.match(frontend, /editor-dialog \.layout\{display:grid;grid-template-columns:minmax\(0,1\.06fr\) minmax\(0,\.94fr\)/);
  assert.doesNotMatch(frontend, /Events in view|id="eventSearch"|id="eventList"/);
  assert.match(frontend, /id="resetChanges"/);
  assert.match(frontend, /HTMLFormElement\.prototype\.reset\.call/);
  assert.match(frontend, /id="customRepeat"/);
  assert.match(frontend, /id="repeatInterval"/);
  assert.match(frontend, /id="repeatEnds"/);
  assert.match(frontend, /id="description" class="rich-editor" contenteditable="true"/);
  assert.match(frontend, /id="uploadForm"/);
  assert.match(frontend, /@media\(max-width:930px\)/);
  assert.match(frontend, /id="category"/);
  assert.match(frontend, /id="artTitle"/);
  assert.match(frontend, /editorListEvents/);
  assert.match(frontend, /editorSaveEvent/);
  assert.match(frontend, /id="featured" type="checkbox"/);
  assert.match(frontend, /id="imageFocusControls"/);
  assert.match(frontend, /function setImageFocus\(x,y\)/);
  assert.match(frontend, /finally\{pending\(false\)\}/);
  assert.match(frontend, /await call\('editorUploadFile',\$\('uploadForm'\)\)/);
  assert.match(published, /id="featured" type="checkbox"/);
  assert.match(published, /Demonstration · read-only/);
  assert.match(published, /noindex,nofollow/);
});

test('Google OAuth stays user-bound, with no write credentials in the GitHub Pages page', () => {
  assert.equal(manifest.webapp.executeAs, 'USER_ACCESSING');
  assert.equal(manifest.webapp.access, 'ANYONE');
  assert.deepEqual(manifest.oauthScopes, [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/drive',
  ]);
  assert.doesNotMatch(published, /ScriptApp\.getOAuthToken|GOOGLE_API_KEY|client_secret|access_token/);
});

test('both editor HTML variants have JavaScript that parses as a standalone browser script', () => {
  for (const [name, html] of [
    ['Apps Script live editor', frontend],
    ['GitHub Pages demonstration', published],
  ]) {
    const match = html.match(/<script>\s*([\s\S]*?)<\/script>/i);
    assert.ok(match, name + ': missing inline controller');
    assert.doesNotThrow(() => new vm.Script(match[1], { filename: name }), name);
  }
});

test('editor release workflow requires explicit manual dispatch and privileged secrets', () => {
  const wf = fs.readFileSync(path.join(root,'.github/workflows/deploy-admin-editor.yml'),'utf8');
  assert.match(wf, /workflow_dispatch:/);
  assert.doesNotMatch(wf, /^\s+push:/m);
  assert.match(wf, /environment: calendar-editor/);
  assert.match(wf, /secrets\.APPS_SCRIPT_CLASPRC_JSON/);
  assert.match(wf, /secrets\.APPS_SCRIPT_CLASP_JSON/);
  assert.match(wf, /secrets\.APPS_SCRIPT_DEPLOYMENT_ID/);
  assert.match(wf, /clasp create-deployment --deploymentId/);
  assert.match(wf, /rootDir.*admin\/apps-script/);
});
