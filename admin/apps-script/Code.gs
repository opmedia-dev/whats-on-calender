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
const CATEGORIES = ['general', 'worship', 'community', 'music', 'families', 'heritage', 'fundraising'];
const WRITE_ROLES = ['writer', 'owner'];

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
  let repeat = 'none';
  if (/^RRULE:FREQ=WEEKLY(?:;INTERVAL=1)?(?:;BYDAY=[A-Z]{2})?$/.test(rawRule) && recurrence.length === 1) repeat = 'weekly';
  else if (/^RRULE:FREQ=MONTHLY(?:;INTERVAL=1)?$/.test(rawRule) && recurrence.length === 1) repeat = 'monthly';
  else if (recurrence.length) repeat = 'keep';
  const category = categoryOf_(e);
  return {
    id: e.id, seriesId: e.recurringEventId || e.id,
    isInstance: Boolean(e.recurringEventId),
    title: e.summary || '', description: e.description || '', location: e.location || '',
    startDate, endDate, startTime: allDay ? '09:00' : localClock_(e.start.dateTime),
    endTime: allDay ? '10:00' : localClock_(e.end.dateTime),
    allDay, category: category.id, categorySource: category.source,
    repeat, isRecurring: Boolean(e.recurringEventId || recurrence.length),
    revision: e.etag || '', visibility: e.visibility || 'default',
    hasFormattedDescription: /<\/?(?:p|div|span|strong|b|a|br|ul|ol|li)\b/i.test(e.description || ''),
    descriptionOriginal: e.description || '',
  };
}

function editorBootstrap() {
  const cal = editorAccess_();
  const now = Date.now();
  const items = [];
  let pageToken;
  do {
    const response = Calendar.Events.list(EDITOR_CALENDAR_ID, {
      timeMin: new Date(now - 31 * 86400000).toISOString(),
      timeMax: new Date(now + 240 * 86400000).toISOString(),
      maxResults: 250, singleEvents: true, orderBy: 'startTime',
      showDeleted: false, pageToken,
    });
    for (const e of (response.items || [])) {
      if (!e.start || e.status === 'cancelled') continue;
      const category = categoryOf_(e);
      items.push({
        id: e.id, seriesId: e.recurringEventId || e.id,
        isInstance: Boolean(e.recurringEventId), recurring: Boolean(e.recurringEventId),
        title: e.summary || 'Untitled event',
        start: e.start.dateTime || e.start.date,
        category: category.id, categorySource: category.source,
        visibility: e.visibility || 'default',
      });
    }
    pageToken = response.nextPageToken;
  } while (pageToken && items.length < 1250);
  return {
    calendarName: cal.summary || 'Parish calendar',
    timeZone: EDITOR_ZONE, categories: CATEGORIES, events: items,
    // Images and richer description editing belong to the next milestone.
    capabilities: { eventCrud: true, category: true, recurring: true, imageUpload: false },
  };
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
  if (['none', 'weekly', 'monthly', 'keep'].indexOf(repeat) < 0) throw new Error('Invalid recurrence.');
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
  if (repeat === 'weekly') {
    const day = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][new Date(startDate + 'T12:00:00Z').getUTCDay()];
    body.recurrence = ['RRULE:FREQ=WEEKLY;BYDAY=' + day];
  } else if (repeat === 'monthly') {
    body.recurrence = ['RRULE:FREQ=MONTHLY'];
  } else if (repeat === 'none') {
    body.recurrence = [];
  }
  return { body, repeat };
}

function editorSaveEvent(form) {
  editorAccess_();
  const parsed = normalise_(form);
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
  if (scope === 'occurrence' && record.recurring) {
    // Exception editing must not change the recurrence of the parent series.
    delete parsed.body.recurrence;
  } else if (parsed.repeat === 'keep') {
    // Complex old recurrence rules are retained untouched by this initial UI.
    delete parsed.body.recurrence;
  }
  // The Calendar advanced service supports optimistic If-Match headers.
  const updated = Calendar.Events.patch(parsed.body, EDITOR_CALENDAR_ID,
    record.target.id, { sendUpdates: 'none' }, { 'If-Match': record.target.etag });
  return { saved: true, id: updated.id, status: 'updated' };
}

function editorDeleteEvent(id, scope, revision) {
  editorAccess_();
  const record = fetchTarget_(id, scope);
  if (record.target.etag !== revision) {
    throw new Error('This event has changed. Reload before deleting.');
  }
  Calendar.Events.remove(EDITOR_CALENDAR_ID, record.target.id,
    { sendUpdates: 'none' }, { 'If-Match': record.target.etag });
  return { deleted: true, id: record.target.id };
}
