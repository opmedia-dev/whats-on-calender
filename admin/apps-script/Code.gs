/**
 * St John's What's On — editor backend.
 * Runs in a private Google Apps Script web app as the ACCESSING USER.
 * The caller must already have writer/owner access to the parish calendar.
 *
 * This source must NOT be put in a public GitHub Pages page. Public Pages
 * contains only the explicitly read-only editor demonstration.
 *
 * Enable the Advanced Google Calendar v3 service (see appsscript.json).
 */
const EDITOR_CALENDAR_ID = 'c_d30f3ffb0daab410095d7c8446d61248b0f80e4925fe7599e3880611b490f8ca@group.calendar.google.com';
const EDITOR_ZONE = 'Europe/London';
const CATEGORY_KEY = 'woCategory';
const HEADER_IMAGE_KEY = 'woHeaderImageId';
const CATEGORIES = ['general', 'worship', 'community', 'music', 'families', 'heritage', 'fundraising'];
const WRITE_ROLES = ['writer', 'owner'];
// Set to a dedicated parish-controlled Google Drive folder before enabling uploads.
// Editors need permission to add files to that folder. File links are made public
// because the public What's On website displays event posters and downloads.
const EDITOR_UPLOAD_FOLDER_ID = '';
const MAX_EVENT_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED_UPLOAD_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle("St John's — What's On Event Manager")
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function editorAccess_() {
  // A shared calendar ACL is the authorisation boundary, NOT possession of
  // the script URL. In deployments, select "execute as user accessing".
  let entry;
  try {
    entry = Calendar.CalendarList.get(EDITOR_CALENDAR_ID);
  } catch (err) {
    throw new Error('This Google account cannot access the parish calendar. Ask the calendar owner to share it with you using Make changes to events.');
  }
  if (!entry || WRITE_ROLES.indexOf(entry.accessRole) < 0) {
    throw new Error('Your Google account does not have permission to edit this calendar.');
  }
  return entry;
}

function category_(raw) {
  const value = String(raw || 'general').toLowerCase();
  if (CATEGORIES.indexOf(value) < 0) throw new Error('Select a valid event category.');
  return value;
}

function inferCategory_(title) {
  // Conservative fallback for legacy events lacking an explicit category.
  // Only obvious labels are inferred; a volunteer can correct them in the UI.
  const name = String(title || '').toLowerCase();
  if (/\b(eucharist|communion|mass|evensong|worship|prayer service|morning prayer|evening prayer)\b/.test(name)) return 'worship';
  if (/\b(choir|concert|recital)\b/.test(name)) return 'music';
  if (/\b(coffee|tea\s*(?:and|&)\s*chat|community lunch|community breakfast)\b/.test(name)) return 'community';
  if (/\b(toddler|children|family activity|holiday club|messy church)\b/.test(name)) return 'families';
  if (/\b(heritage|history talk|church tour|guided tour)\b/.test(name)) return 'heritage';
  if (/\b(fundrais|raffle|charity sale|jumble sale)\b/.test(name)) return 'fundraising';
  return 'general';
}

function categoryOf_(event) {
  const stored = event.extendedProperties && event.extendedProperties.shared &&
    event.extendedProperties.shared[CATEGORY_KEY];
  if (stored && CATEGORIES.indexOf(stored) >= 0) return { id: stored, source: 'selected' };
  return { id: inferCategory_(event.summary), source: 'suggested' };
}

function localDate_(s) {
  return Utilities.formatDate(new Date(s), EDITOR_ZONE, 'yyyy-MM-dd');
}
function localClock_(s) {
  return Utilities.formatDate(new Date(s), EDITOR_ZONE, 'HH:mm');
}
function addDay_(dateString, n) {
  const d = new Date(dateString + 'T12:00:00Z');
  if (!Number.isFinite(d.getTime())) throw new Error('Invalid calendar date.');
  d.setUTCDate(d.getUTCDate() + n);
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}
function localEvent_(e) {
  if (!e || !e.start) throw new Error('Event data is missing a start date.');
  const allDay = Boolean(e.start.date);
  const startDate = allDay ? e.start.date : localDate_(e.start.dateTime);
  const endDate = allDay ? addDay_(e.end.date, -1) : localDate_(e.end.dateTime);
  const recurrence = e.recurrence || [];
  const rawRule = recurrence.find(r => /^RRULE:/i.test(r)) || '';
  const rule = {};
  rawRule.replace(/^RRULE:/i, '').split(';').forEach(part => {
    const pos = part.indexOf('=');
    if (pos > 0) rule[part.slice(0, pos).toUpperCase()] = part.slice(pos + 1);
  });
  const simple = rawRule && recurrence.length === 1 &&
    Object.keys(rule).every(k => ['FREQ','INTERVAL','BYDAY','COUNT','UNTIL'].includes(k)) &&
    ['DAILY','WEEKLY','MONTHLY','YEARLY'].includes(rule.FREQ) &&
    (!rule.BYDAY || (rule.FREQ === 'WEEKLY' && /^(?:MO|TU|WE|TH|FR|SA|SU)(?:,(?:MO|TU|WE|TH|FR|SA|SU))*$/.test(rule.BYDAY)));
  let repeat = 'none';
  let customRepeat = { unit: 'WEEKLY', interval: 1, days: [], ends: 'never', count: 10, until: '' };
  if (rawRule && !simple) repeat = 'keep';
  else if (simple) {
    const interval = Number(rule.INTERVAL || 1);
    const ends = rule.COUNT ? 'count' : rule.UNTIL ? 'until' : 'never';
    customRepeat = {
      unit: rule.FREQ,
      interval,
      days: rule.BYDAY ? rule.BYDAY.split(',') : [],
      ends,
      count: Number(rule.COUNT || 10),
      until: rule.UNTIL ? rule.UNTIL.slice(0,4) + '-' + rule.UNTIL.slice(4,6) + '-' + rule.UNTIL.slice(6,8) : '',
    };
    if (interval === 1 && !rule.COUNT && !rule.UNTIL && rule.FREQ === 'WEEKLY' &&
        (!rule.BYDAY || rule.BYDAY.split(',').length === 1)) repeat = 'weekly';
    else if (interval === 1 && !rule.COUNT && !rule.UNTIL && rule.FREQ === 'MONTHLY' && !rule.BYDAY) repeat = 'monthly';
    else repeat = 'custom';
  }
  const category = categoryOf_(e);
  return {
    id: e.id, seriesId: e.recurringEventId || e.id,
    isInstance: Boolean(e.recurringEventId),
    title: e.summary || '', description: e.description || '', location: e.location || '',
    startDate, endDate, startTime: allDay ? '09:00' : localClock_(e.start.dateTime),
    endTime: allDay ? '10:00' : localClock_(e.end.dateTime),
    allDay, category: category.id, categorySource: category.source,
    repeat, customRepeat, isRecurring: Boolean(e.recurringEventId || recurrence.length),
    revision: e.etag || '', visibility: e.visibility || 'default',
    hasFormattedDescription: /<\/?(?:p|div|span|strong|b|a|br|ul|ol|li)\b/i.test(e.description || ''),
    descriptionOriginal: e.description || '',
    attachments: attachmentsFor_(e),
    headerImageId: e.extendedProperties?.shared?.[HEADER_IMAGE_KEY] || '',
  };
}

function editorBootstrap() {
  const cal = editorAccess_();
  return {
    calendarName: cal.summary || 'Parish calendar',
    timeZone: EDITOR_ZONE, categories: CATEGORIES,
    capabilities: { eventCrud: true, category: true, recurring: true, imageUpload: false },
  };
}

function editorListEvents(from, through) {
  editorAccess_();
  const start = isoDate_(from, 'From');
  const last = isoDate_(through, 'Through');
  if (last < start) throw new Error('Calendar date range is invalid.');
  if (Date.parse(last + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z') > 93 * 86400000) {
    throw new Error('Calendar range must be within 93 days.');
  }
  const items = [];
  let pageToken;
  do {
    const response = Calendar.Events.list(EDITOR_CALENDAR_ID, {
      // Include a UTC buffer so 00:00–01:00 local events during BST are not lost.
      timeMin: addDay_(start, -1) + 'T00:00:00Z',
      timeMax: addDay_(last, 2) + 'T00:00:00Z',
      maxResults: 250, singleEvents: true, orderBy: 'startTime',
      showDeleted: false, pageToken: pageToken,
    });
    for (const e of (response.items || [])) {
      if (!e.start || e.status === 'cancelled') continue;
      const category = categoryOf_(e);
      items.push({
        id: e.id, seriesId: e.recurringEventId || e.id,
        isInstance: Boolean(e.recurringEventId), recurring: Boolean(e.recurringEventId),
        title: e.summary || 'Untitled event',
        start: e.start.dateTime || e.start.date,
        end: (e.end && (e.end.dateTime || e.end.date)) || '',
        allDay: Boolean(e.start.date),
        category: category.id, categorySource: category.source,
        visibility: e.visibility || 'default',
      });
    }
    pageToken = response.nextPageToken;
  } while (pageToken);
  return items;
}

function fetchTarget_(id, scope) {
  if (!id || String(id).length > 1024) throw new Error('Select an event first.');
  const selected = Calendar.Events.get(EDITOR_CALENDAR_ID, String(id));
  if (!selected || selected.status === 'cancelled') throw new Error('Event not found.');
  const recurring = Boolean(selected.recurringEventId || (selected.recurrence && selected.recurrence.length));
  if (recurring && scope !== 'series' && scope !== 'occurrence') {
    throw new Error('Choose whether to edit one occurrence or the entire series.');
  }
  const seriesId = selected.recurringEventId || selected.id;
  const target = scope === 'series' && selected.recurringEventId
    ? Calendar.Events.get(EDITOR_CALENDAR_ID, seriesId)
    : selected;
  return { target, recurring, seriesId };
}

function editorGetEvent(id, scope) {
  editorAccess_();
  const data = fetchTarget_(id, scope || 'occurrence');
  return Object.assign(localEvent_(data.target), {
    selectedId: id, editScope: scope || 'occurrence',
  });
}

function isoDate_(s, label) {
  const value = String(s || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(label + ' must be a date.');
  const d = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(d.getTime()) || Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd') !== value) {
    throw new Error('Invalid ' + label.toLowerCase() + '.');
  }
  return value;
}
function clock_(s, label) {
  const v = String(s || '');
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new Error(label + ' must use HH:mm.');
  return v;
}

function buildRecurrence_(form, repeat, startDate, allDay) {
  if (repeat === 'keep') return null;
  if (repeat === 'none') return [];
  let unit, interval, days, ends, count, until;
  if (repeat === 'weekly' || repeat === 'monthly') {
    unit = repeat.toUpperCase(); interval = 1; days = [];
    ends = 'never';
  } else if (repeat === 'custom') {
    const custom = form.customRepeat || {};
    unit = String(custom.unit || '');
    interval = Number(custom.interval);
    days = Array.isArray(custom.days) ? custom.days : [];
    ends = String(custom.ends || 'never');
    count = Number(custom.count);
    until = String(custom.until || '');
    if (!['DAILY','WEEKLY','MONTHLY','YEARLY'].includes(unit)) throw new Error('Choose a valid repeat frequency.');
    if (!Number.isInteger(interval) || interval < 1 || interval > 99) throw new Error('Repeat interval must be from 1 to 99.');
    if (unit === 'WEEKLY') {
      if (!days.length) throw new Error('Choose at least one weekday for a custom weekly repeat.');
      if (days.length > 7 || new Set(days).size !== days.length ||
          days.some(day => !['MO','TU','WE','TH','FR','SA','SU'].includes(day))) {
        throw new Error('Select valid, distinct weekdays.');
      }
    } else if (days.length) throw new Error('Weekdays can only be set for weekly repeats.');
    if (!['never','count','until'].includes(ends)) throw new Error('Choose a valid repeat ending.');
  } else throw new Error('Invalid recurrence.');
  const daysOfWeek = ['SU','MO','TU','WE','TH','FR','SA'];
  if (unit === 'WEEKLY' && !days.length) {
    days = [daysOfWeek[new Date(startDate + 'T12:00:00Z').getUTCDay()]];
  }
  let rule = 'RRULE:FREQ=' + unit;
  if (interval > 1) rule += ';INTERVAL=' + interval;
  if (unit === 'WEEKLY') rule += ';BYDAY=' + days.join(',');
  if (ends === 'count') {
    if (!Number.isInteger(count) || count < 1 || count > 999) throw new Error('Repeat count must be from 1 to 999.');
    rule += ';COUNT=' + count;
  } else if (ends === 'until') {
    const date = isoDate_(until, 'Repeat until');
    if (date < startDate) throw new Error('Repeat end must not precede event start.');
    const compact = date.replace(/-/g, '');
    rule += ';UNTIL=' + (allDay ? compact : compact + 'T235959Z');
  }
  return [rule];
}

function normalise_(form) {
  if (!form || typeof form !== 'object') throw new Error('Event details required.');
  const title = String(form.title || '').trim();
  if (!title || title.length > 180) throw new Error('Enter an event title (maximum 180 characters).');
  const startDate = isoDate_(form.startDate, 'Start date');
  const endDate = isoDate_(form.endDate || startDate, 'End date');
  if (endDate < startDate) throw new Error('End date must not be before the start date.');
  const allDay = form.allDay === true;
  const startTime = clock_(form.startTime || '09:00', 'Start time');
  const endTime = clock_(form.endTime || '10:00', 'End time');
  if (!allDay && endDate === startDate && endTime <= startTime) {
    throw new Error('End time must be after the start time.');
  }
  const repeat = String(form.repeat || 'none');
  if (['none', 'weekly', 'monthly', 'custom', 'keep'].indexOf(repeat) < 0) throw new Error('Invalid recurrence.');
  const description = String(form.description || '');
  if (description.length > 30000) throw new Error('Description is too long.');
  const location = String(form.location || '').trim();
  if (location.length > 1000) throw new Error('Location is too long.');
  const start = allDay
    ? { date: startDate }
    : { dateTime: startDate + 'T' + startTime + ':00', timeZone: EDITOR_ZONE };
  const end = allDay
    ? { date: addDay_(endDate, 1) }
    : { dateTime: endDate + 'T' + endTime + ':00', timeZone: EDITOR_ZONE };
  const body = {
    summary: title, location, start, end,
    extendedProperties: { shared: { [CATEGORY_KEY]: category_(form.category) } },
  };
  // Don't degrade HTML-rich calendar descriptions when the editor has not
  // changed that field. Omit it from PATCH instead of resaving plain text.
  if (!form.id || form.descriptionChanged === true) body.description = description;
  const recurrence = buildRecurrence_(form, repeat, startDate, allDay);
  if (recurrence !== null) body.recurrence = recurrence;
  return { body, repeat };
}

function editorSaveEvent(form) {
  editorAccess_();
  const parsed = normalise_(form);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Another calendar update is in progress. Try again.');
  try {
    if (!form.id) {
      if (parsed.repeat === 'keep') throw new Error('Choose a recurrence for a new event.');
      const inserted = Calendar.Events.insert(parsed.body, EDITOR_CALENDAR_ID, { sendUpdates: 'none' });
      return { saved: true, id: inserted.id, status: 'created' };
    }
    const scope = String(form.editScope || '');
    const record = fetchTarget_(form.id, scope);
    if (form.revision !== record.target.etag) {
      throw new Error('This event changed in Google Calendar. Reload it before saving to avoid overwriting another editor.');
    }
    // A chosen header must be a real image already attached to THIS event.
    // Never let a discarded draft/another event supply a foreign file ID.
    const headerChoice = String(form.headerImageId || '').trim();
    if (headerChoice && headerChoice !== 'none') {
      const match = (record.target.attachments || []).find(a =>
        a.fileId === headerChoice && /^image\//i.test(a.mimeType || ''));
      if (!match) throw new Error('The selected header image is not attached to this event. Reload and choose again.');
    }
    const existingShared = (record.target.extendedProperties && record.target.extendedProperties.shared) || {};
    parsed.body.extendedProperties.shared = Object.assign({}, existingShared, {
      [CATEGORY_KEY]: category_(form.category), [HEADER_IMAGE_KEY]: headerChoice,
    });
    if (scope === 'occurrence' && record.recurring) {
      // Instance exceptions cannot alter recurring masters.
      delete parsed.body.recurrence;
    } else if (parsed.repeat === 'keep') {
      // Complex existing recurrence rules remain unchanged.
      delete parsed.body.recurrence;
    }
    // Advanced Calendar's patch method does not expose an If-Match header.
    // We re-read and compare the event revision within a script-wide lock
    // instead of pretending an unsupported extra argument sends headers.
    const updated = Calendar.Events.patch(parsed.body, EDITOR_CALENDAR_ID,
      record.target.id, { sendUpdates: 'none' });
    return { saved: true, id: updated.id, status: 'updated' };
  } finally {
    lock.releaseLock();
  }
}

function attachmentsFor_(event) {
  return (event.attachments || []).map(a => ({
    fileId: a.fileId || '', fileUrl: a.fileUrl || '',
    title: a.title || 'Attached file', mimeType: a.mimeType || '',
  }));
}

// Called only after the event exists. Attachment uploads are never made from
// GitHub Pages or a URL-only public endpoint. Apps Script turns <input type=file>
// into a Blob in a signed-in request.
function editorUploadFile(form) {
  editorAccess_();
  if (!EDITOR_UPLOAD_FOLDER_ID) {
    throw new Error('Parish upload folder is not configured yet. Ask the administrator to complete Drive setup.');
  }
  if (!form || !form.eventId || !form.attachment) throw new Error('Select an event and a file first.');
  const id = String(form.eventId);
  const scope = String(form.editScope || 'occurrence');
  const blob = form.attachment;
  const name = String(blob.getName() || '').trim().replace(/[\\\/\u0000-\u001f]/g, '_').slice(0, 170);
  const mimeType = String(blob.getContentType() || '').toLowerCase();
  const bytes = blob.getBytes().length;
  if (!name) throw new Error('Attachment needs a filename.');
  if (!ACCEPTED_UPLOAD_TYPES.includes(mimeType)) throw new Error('This file type is not supported for event attachments.');
  if (!bytes || bytes > MAX_EVENT_UPLOAD_BYTES) throw new Error('Attachments must be smaller than 8 MB.');
  const role = String(form.imageRole || 'gallery');
  if (!['header', 'gallery'].includes(role)) throw new Error('Invalid image placement.');
  if (role === 'header' && !mimeType.startsWith('image/')) {
    throw new Error('Only an image can be used as the header.');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Another calendar update is in progress. Try again.');
  try {
    const record = fetchTarget_(id, scope);
    const existing = attachmentsFor_(record.target).map(a => ({
      fileUrl: a.fileUrl, title: a.title, mimeType: a.mimeType,
    })); // The read-only Google fileId is deliberately omitted from writes.
    if (existing.length >= 25) throw new Error('Google Calendar allows at most 25 attachments per event.');
    // Validate the destination folder (and user's Drive permissions) before
    // creating a file. Only event editors already granted Drive access can upload.
    Drive.Files.get(EDITOR_UPLOAD_FOLDER_ID, { fields: 'id,name,mimeType' });
    const file = Drive.Files.create({
      name: name, mimeType: mimeType, parents: [EDITOR_UPLOAD_FOLDER_ID],
    }, blob, { fields: 'id,name,mimeType,webViewLink' });
    // The already public event publisher needs files readable by visitors.
    // Users are informed in the editor and can upload only published-safe files.
    Drive.Permissions.create({ role: 'reader', type: 'anyone' }, file.id, { fields: 'id' });
    const attachment = {
      fileUrl: file.webViewLink || 'https://drive.google.com/file/d/' + encodeURIComponent(file.id) + '/view',
      title: file.name || name, mimeType: file.mimeType || mimeType,
    };
    const shared = (record.target.extendedProperties && record.target.extendedProperties.shared) || {};
    const changes = { attachments: existing.concat([attachment]) };
    if (role === 'header') {
      changes.extendedProperties = { shared: Object.assign({}, shared, { [HEADER_IMAGE_KEY]: file.id }) };
    } else if (mimeType.startsWith('image/') &&
               !existing.some(a => /^image\//i.test(a.mimeType || '')) &&
               !shared[HEADER_IMAGE_KEY]) {
      // A newly uploaded gallery-only picture should not become the header
      // through the legacy first-image fallback.
      changes.extendedProperties = { shared: Object.assign({}, shared, { [HEADER_IMAGE_KEY]: 'none' }) };
    }
    const updated = Calendar.Events.patch(changes,
      EDITOR_CALENDAR_ID, record.target.id, { sendUpdates: 'none', supportsAttachments: true });
    return { uploaded: true, name: attachment.title, eventId: updated.id, attachmentCount: existing.length + 1 };
  } finally { lock.releaseLock(); }
}

function editorDeleteEvent(id, scope, revision) {
  editorAccess_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Another calendar update is in progress. Try again.');
  try {
    const record = fetchTarget_(id, scope);
    if (record.target.etag !== revision) {
      throw new Error('This event has changed. Reload before deleting.');
    }
    Calendar.Events.remove(EDITOR_CALENDAR_ID, record.target.id,
      { sendUpdates: 'none' });
    return { deleted: true, id: record.target.id };
  } finally {
    lock.releaseLock();
  }
}
