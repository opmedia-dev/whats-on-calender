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
const IMAGE_FOCUS_KEY = 'woImageFocus';
const FEATURED_KEY = 'woFeatured';
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
// An occurrence may inherit the series flag, or explicitly override it.
function featuredOf_(event, master) {
  const value = event?.extendedProperties?.shared?.[FEATURED_KEY];
  if (value === 'true' || value === 'false') return value === 'true';
  return master?.extendedProperties?.shared?.[FEATURED_KEY] === 'true';
}
// Only percentage pairs are stored; never accept CSS or arbitrary markup.
function imageFocus_(value) {
  const match = String(value || '').match(/^(\d{1,3}),(\d{1,3})$/);
  if (!match) return '50,50';
  const x = Number(match[1]), y = Number(match[2]);
  return x <= 100 && y <= 100 ? x + ',' + y : '50,50';
}
function localEvent_(e, master) {
  if (!e || !e.start) throw new Error('Event data is missing a start date.');
  const allDay = Boolean(e.start.date);
  const startDate = allDay ? e.start.date : localDate_(e.start.dateTime);
  const endDate = allDay ? addDay_(e.end.date, -1) : localDate_(e.end.dateTime);
  const recurrence = e.recurrence?.length ? e.recurrence : (master?.recurrence || []);
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
    revision: e.etag || '', visibility: (master?.visibility === 'confidential' ? 'private' : master?.visibility) || e.visibility || 'default',
    hasFormattedDescription: /<\/?(?:p|div|span|strong|b|a|br|ul|ol|li)\b/i.test(e.description || ''),
    descriptionOriginal: e.description || '',
    attachments: attachmentsFor_(e),
    headerImageId: e.extendedProperties?.shared?.[HEADER_IMAGE_KEY] || master?.extendedProperties?.shared?.[HEADER_IMAGE_KEY] || '',
    featured: featuredOf_(e, master),
    imageFocus: imageFocus_(e.extendedProperties?.shared?.[IMAGE_FOCUS_KEY] ||
      master?.extendedProperties?.shared?.[IMAGE_FOCUS_KEY]),
  };
}

function editorBootstrap() {
  const cal = editorAccess_();
  return {
    calendarName: cal.summary || 'Parish calendar',
    timeZone: EDITOR_ZONE, categories: CATEGORIES,
    capabilities: { eventCrud: true, category: true, recurring: true, imageUpload: Boolean(EDITOR_UPLOAD_FOLDER_ID) },
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
  if (recurring && !['series','occurrence','following'].includes(scope)) {
    throw new Error('Choose this occurrence, this and future, or the entire series.');
  }
  const seriesId = selected.recurringEventId || selected.id;
  const target = scope === 'series' && selected.recurringEventId
    ? Calendar.Events.get(EDITOR_CALENDAR_ID, seriesId)
    : selected;
  const master = recurring && selected.recurringEventId
    ? (target.id === seriesId ? target : Calendar.Events.get(EDITOR_CALENDAR_ID, seriesId))
    : (recurring ? selected : null);
  return { target, selected, master, recurring, seriesId };
}

function editorGetEvent(id, scope) {
  editorAccess_();
  const data = fetchTarget_(id, scope || 'occurrence');
  return Object.assign(localEvent_(data.target, data.master), {
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
  const visibility = String(form.visibility || 'default');
  if (!['default','public','private'].includes(visibility)) throw new Error('Select a valid visibility.');
  const body = {
    summary: title, location, start, end, visibility,
    extendedProperties: { shared: {
      [CATEGORY_KEY]: category_(form.category),
      [FEATURED_KEY]: form.visibility === 'private' ? 'false' : (form.featured === true ? 'true' : 'false'),
      [IMAGE_FOCUS_KEY]: imageFocus_(form.imageFocus),
    } },
  };
  // Don't degrade HTML-rich calendar descriptions when the editor has not
  // changed that field. Omit it from PATCH instead of resaving plain text.
  if (!form.id || form.descriptionChanged === true) body.description = description;
  const recurrence = buildRecurrence_(form, repeat, startDate, allDay);
  if (recurrence !== null) body.recurrence = recurrence;
  return { body, repeat };
}

// Google Calendar API has no atomic "this and following" edit. Split the
// parent into two RRULE series, rather than making hundreds of exceptions.
// Only plain single-RRULE patterns are supported. Refuse complex series and
// existing detached future exceptions rather than silently discard them.
function followingPlan_(record) {
  if (!record.selected.recurringEventId || !record.master?.recurrence?.length) {
    throw new Error('Select an occurrence within a repeating series for this and future.');
  }
  const master = record.master, selected = record.selected;
  const ruleLines = master.recurrence;
  if (ruleLines.length !== 1 || !/^RRULE:/i.test(ruleLines[0])) {
    throw new Error('This recurring series has advanced date exceptions. Edit it in Google Calendar to avoid losing dates.');
  }
  const raw = ruleLines[0], parts = Object.fromEntries(raw.slice(6).split(';').map(item => item.split('=')));
  if (!['DAILY','WEEKLY','MONTHLY','YEARLY'].includes(parts.FREQ) ||
      Object.keys(parts).some(k => !['FREQ','INTERVAL','BYDAY','COUNT','UNTIL'].includes(k)) ||
      (parts.BYDAY && (parts.FREQ !== 'WEEKLY' || !/^(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*$/.test(parts.BYDAY))) ||
      (parts.COUNT && parts.UNTIL)) {
    throw new Error('This recurring pattern is too complex to split safely. Use Google Calendar.');
  }
  const original = selected.originalStartTime || selected.start;
  const pivot = original?.dateTime || original?.date;
  if (!pivot) throw new Error('The selected recurrence has no original start time.');
  const allDay = Boolean(original.date);
  const startMs = new Date(allDay ? pivot + 'T12:00:00Z' : pivot).getTime();
  if (!Number.isFinite(startMs)) throw new Error('Invalid recurrence start time.');
  const firstMs = new Date(master.start.date ? master.start.date + 'T12:00:00Z' : master.start.dateTime).getTime();
  if (!Number.isFinite(firstMs)) throw new Error('Invalid recurring series start time.');
  if (startMs < firstMs) throw new Error('This event predates its recurring series.');
  // A rescheduled exception changes the start independently of the rule.
  if (JSON.stringify(selected.start) !== JSON.stringify(original) &&
      (selected.start?.date || selected.start?.dateTime) !== pivot) {
    throw new Error('This occurrence was moved from its scheduled date. Split the series in Google Calendar.');
  }
  const first = startMs === firstMs;
  if (!first) {
    // Non-expanded list returns only series masters and exception events.
    let token, pages = 0;
    do {
      const response = Calendar.Events.list(EDITOR_CALENDAR_ID, {
        singleEvents: false, showDeleted: true,
        timeMin: new Date(startMs - 1000).toISOString(), maxResults: 250, pageToken: token,
      });
      if ((response.items || []).some(e => e.recurringEventId === master.id)) {
        throw new Error('Future dates contain individual exceptions/cancellations. Edit this split in Google Calendar to preserve them.');
      }
      token = response.nextPageToken;
      if (++pages >= 12 && token) throw new Error('Too many events to verify a safe series split.');
    } while (token);
  }
  let beforeCount = 0;
  if (!first && parts.COUNT) {
    let token, pages = 0;
    do {
      const response = Calendar.Events.instances(EDITOR_CALENDAR_ID, master.id, {
        timeMax: new Date(startMs).toISOString(), maxResults: 250, pageToken: token,
        showDeleted: true,
      });
      beforeCount += (response.items || []).length;
      token = response.nextPageToken;
      if (++pages >= 12 && token) throw new Error('Too many prior occurrences for a safe count-based split.');
    } while (token);
    if (!beforeCount || beforeCount >= Number(parts.COUNT)) {
      throw new Error('Could not determine the remaining recurrence count safely.');
    }
  }
  const ending = allDay
    ? new Date(startMs - 86400000).toISOString().slice(0,10).replace(/-/g,'')
    : new Date(startMs - 1000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const trimmed = 'RRULE:' + raw.slice(6).split(';')
    .filter(part => !/^(COUNT|UNTIL)=/.test(part)).concat('UNTIL='+ending).join(';');
  return { master, first, original, beforeCount, originalRule: raw, trimmed, parts };
}

function splitFollowing_(record, parsed, form) {
  const plan = followingPlan_(record);
  if (plan.first) {
    // First occurrence: this-and-future is equivalent to the whole series.
    const body = Object.assign({}, parsed.body);
    if (parsed.repeat === 'keep') delete body.recurrence;
    const updated = Calendar.Events.patch(body, EDITOR_CALENDAR_ID,
      plan.master.id, { sendUpdates: 'none' });
    return { saved:true, id:updated.id, revision:updated.etag || '', status:'updated-series', scope:'series' };
  }
  if (parsed.repeat === 'none' || (parsed.body.recurrence && !parsed.body.recurrence.length)) {
    throw new Error('Future occurrences must keep a repeat pattern. To stop repeating, edit the entire series instead.');
  }
  const master = plan.master;
  // Explicitly carry over title, description, attachments, and calendar fields:
  // a PATCH-style body alone would lose these on inserting the new series.
  const body = {
    summary: parsed.body.summary, description: parsed.body.description ?? record.selected.description ?? master.description ?? '',
    location: parsed.body.location, start: parsed.body.start, end: parsed.body.end,
    visibility: parsed.body.visibility,
    extendedProperties: { shared: parsed.body.extendedProperties.shared },
    recurrence: parsed.repeat === 'keep' ? [...master.recurrence] : [...parsed.body.recurrence],
  };
  for (const key of ['colorId','transparency','reminders']) {
    if (master[key] !== undefined) body[key] = master[key];
  }
  if (master.attachments?.length) body.attachments = master.attachments.map(a => ({
    fileUrl:a.fileUrl,title:a.title,mimeType:a.mimeType,
  }));
  const newRule = body.recurrence[0];
  const countMatch = newRule.match(/(?:^|;)COUNT=(\d+)/);
  const masterCount = Number(plan.parts.COUNT || 0);
  if (countMatch && masterCount && Number(countMatch[1]) === masterCount) {
    body.recurrence = [newRule.replace(/COUNT=\d+/, 'COUNT='+(masterCount-plan.beforeCount))];
  }
  // Insert first so a failed insertion does not erase the future programme.
  // If truncation then fails, remove the new series to prevent overlap.
  const inserted = Calendar.Events.insert(body, EDITOR_CALENDAR_ID, {
    sendUpdates:'none', supportsAttachments:true,
  });
  try {
    Calendar.Events.patch({ recurrence:[plan.trimmed] }, EDITOR_CALENDAR_ID,
      master.id, { sendUpdates:'none' });
  } catch (error) {
    try { Calendar.Events.remove(EDITOR_CALENDAR_ID, inserted.id, {sendUpdates:'none'}); }
    catch (rollbackError) {
      throw new Error('Series split could not finish and the new future series may overlap. Inspect Google Calendar before retrying. '+rollbackError.message);
    }
    throw new Error('Series split failed; the new series was rolled back. '+error.message);
  }
  return { saved:true,id:inserted.id, revision:inserted.etag||'', status:'split-following',scope:'series' };
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
      return { saved: true, id: inserted.id, revision: inserted.etag || '', status: 'created' };
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
    const existingShared = Object.assign({}, record.master?.extendedProperties?.shared || {},
      record.target.extendedProperties?.shared || {});
    parsed.body.extendedProperties.shared = Object.assign({}, existingShared, {
      [CATEGORY_KEY]: category_(form.category), [HEADER_IMAGE_KEY]: headerChoice,
      [FEATURED_KEY]: form.visibility === 'private' ? 'false' : (form.featured === true ? 'true' : 'false'),
      [IMAGE_FOCUS_KEY]: imageFocus_(form.imageFocus),
    });
    if (scope === 'occurrence' && record.recurring) {
      // Native Google Calendar visibility is a series-level property.
      // Reject a narrower privacy change rather than silently affect the whole series.
      const previousVisibility = record.master?.visibility || record.target.visibility || 'default';
      if (parsed.body.visibility !== previousVisibility) {
        throw new Error('Privacy cannot be changed for just one recurring occurrence. Choose This event and future events or All events in the series.');
      }
      delete parsed.body.visibility;
      // Instance exceptions cannot alter recurring masters.
      delete parsed.body.recurrence;
    } else if (parsed.repeat === 'keep') {
      // Complex existing recurrence rules remain unchanged.
      delete parsed.body.recurrence;
    }
    if (scope === 'following') return splitFollowing_(record, parsed, form);
    // Advanced Calendar's patch method does not expose an If-Match header.
    // We re-read and compare the event revision within a script-wide lock
    // instead of pretending an unsupported extra argument sends headers.
    const updated = Calendar.Events.patch(parsed.body, EDITOR_CALENDAR_ID,
      record.target.id, { sendUpdates: 'none' });
    return { saved: true, id: updated.id, revision: updated.etag || '', status: 'updated' };
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
    // Drive.Files.create validates access to the destination folder itself;
    // avoid an extra synchronous Drive API request for every upload.
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
    if (scope === 'following') {
      const plan = followingPlan_(record);
      if (!plan.first) {
        const revised = Calendar.Events.patch({ recurrence: [plan.trimmed] },
          EDITOR_CALENDAR_ID, plan.master.id, { sendUpdates: 'none' });
        return { deleted: true, id: record.target.id, scope:'following', remainingSeriesId:revised.id };
      }
      Calendar.Events.remove(EDITOR_CALENDAR_ID, plan.master.id, { sendUpdates:'none' });
      return { deleted:true, id:plan.master.id, scope:'following' };
    }
    Calendar.Events.remove(EDITOR_CALENDAR_ID, record.target.id,
      { sendUpdates: 'none' });
    return { deleted: true, id: record.target.id };
  } finally {
    lock.releaseLock();
  }
}
