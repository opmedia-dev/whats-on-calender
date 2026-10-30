// Reads the public Google Calendar named in config.json and writes data/events.json
// plus event images/attachments to data/ for build.mjs to publish.
//
// Repeating events are expanded into individual dates (Google does this for us)
// and described in plain English from the series' RRULE. Files attached to an
// event in Google Calendar (from Google Drive, shared "Anyone with the link")
// are downloaded: the first image, or the first page of the first PDF, becomes
// the event's header image/poster, which also makes it a "featured" event.
//
// Env: GOOGLE_API_KEY  API key with the Google Calendar API and Google Drive API enabled
//      GCAL_ID         optional, overrides config.calendarId
//      SITE_URL        optional, deployed site; used to skip work when nothing changed
//      FORCE           "true" to rebuild even if unchanged
//      GITHUB_OUTPUT   set by GitHub Actions; receives changed=true|false
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { describeRecurrence } from './lib/recurrence.mjs';
import { processDescription } from './lib/description.mjs';

const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const dataDir = path.join(root, 'data');
const cacheDir = path.join(root, '.cache', 'attachments');
const CAL_API = process.env.GCAL_API_BASE || 'https://www.googleapis.com/calendar/v3';
const DRIVE_API = process.env.GDRIVE_API_BASE || 'https://www.googleapis.com/drive/v3';
const apiKey = process.env.GOOGLE_API_KEY || process.env.GDRIVE_API_KEY;
const calendarId = process.env.GCAL_ID || config.calendarId;
const timeZone = config.timeZone || 'Europe/London';
const siteUrl = process.env.SITE_URL;

function setOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

function warn(msg) {
  console.warn(`::warning::${msg}`);
}

if (!apiKey) fail('GOOGLE_API_KEY must be set.');
if (!calendarId) fail('Set calendarId in config.json (or GCAL_ID).');

async function get(base, urlPath, params, { allowFail = false } = {}) {
  const url = new URL(`${base}${urlPath}`);
  for (const [k, v] of Object.entries({ ...params, key: apiKey })) if (v != null) url.searchParams.set(k, v);
  let res;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url);
    const throttled = res.status === 429 || res.status >= 500 ||
      (res.status === 403 && /rateLimit|userRateLimit|Sorry/i.test(await res.clone().text()));
    if (!throttled || attempt >= 5) break;
    const wait = 2 ** attempt * 2000;
    console.log(`  Google throttled (${res.status}); retrying in ${wait / 1000}s`);
    await new Promise((r) => setTimeout(r, wait));
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    if (allowFail) return { error: `${res.status} ${body}` };
    fail(`Google API ${res.status} for ${urlPath}: ${body}\n` +
      'Check the API key, that the Google Calendar API is enabled for it, and that the calendar is public.');
  }
  return res;
}

async function listEvents(params) {
  const items = [];
  let pageToken;
  let meta;
  do {
    const res = await get(CAL_API, `/calendars/${encodeURIComponent(calendarId)}/events`,
      { maxResults: '2500', ...params, pageToken });
    const data = await res.json();
    meta = meta || data;
    items.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return { meta, items };
}

const now = Date.now();
const DAY = 86400000;
const timeMin = new Date(now - (config.pastDays ?? 62) * DAY).toISOString();
const timeMax = new Date(now + (config.futureDays ?? 400) * DAY).toISOString();

const { meta, items: instances } = await listEvents({ singleEvents: 'true', orderBy: 'startTime', timeMin, timeMax });
const isHidden = (e) => e.status === 'cancelled' ||
  (config.hidePrivate !== false && (e.visibility === 'private' || e.visibility === 'confidential'));
const events = instances.filter((e) => !isHidden(e) && e.start);
console.log(`Calendar "${meta.summary}": ${instances.length} event(s) in range, ${events.length} public`);

// Series (the repeating "master" events) carry the RRULE used for "Every Sunday" etc.
const masters = new Map();
for (const m of (await listEvents({ singleEvents: 'false', timeMin })).items) masters.set(m.id, m);
for (const id of new Set(events.map((e) => e.recurringEventId).filter(Boolean))) {
  if (masters.has(id)) continue;
  const res = await get(CAL_API, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`, {}, { allowFail: true });
  if (!res.error) masters.set(id, await res.json());
}

// Attachment metadata (cheap) is fetched up front so a replaced poster counts as a change.
const fileMeta = new Map();
for (const a of events.flatMap((e) => e.attachments || [])) {
  if (!a.fileId || fileMeta.has(a.fileId)) continue;
  const res = await get(DRIVE_API, `/files/${encodeURIComponent(a.fileId)}`,
    { fields: 'id,name,mimeType,md5Checksum,modifiedTime,size', supportsAllDrives: 'true' }, { allowFail: true });
  if (res.error) {
    warn(`Attachment "${a.title}" can't be read (${res.error.slice(0, 120)}). ` +
      'In Google Drive, share it as "Anyone with the link" (Viewer).');
    fileMeta.set(a.fileId, null);
  } else {
    fileMeta.set(a.fileId, await res.json());
  }
}

const londonDate = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
const codeVersion = crypto.createHash('sha256')
  .update(['sync-calendar.mjs', 'lib/description.mjs', 'lib/recurrence.mjs']
    .map((f) => fs.readFileSync(path.join(root, 'scripts', f))).join('')).digest('hex').slice(0, 8);
const fingerprint = crypto.createHash('sha256').update(JSON.stringify([
  londonDate, codeVersion, config,
  events.map((e) => [e.id, e.etag]),
  [...masters.values()].map((m) => [m.id, m.etag]),
  [...fileMeta.entries()].map(([id, m]) => [id, m && (m.md5Checksum || m.modifiedTime)]),
])).digest('hex').slice(0, 16);
setOutput('fingerprint', fingerprint);
console.log(`Fingerprint ${fingerprint}`);

if (siteUrl && process.env.FORCE !== 'true') {
  try {
    const res = await fetch(new URL('events.json', siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`), { cache: 'no-store' });
    if (res.ok && (await res.json()).fingerprint === fingerprint) {
      console.log('Deployed site already matches the calendar; nothing to do.');
      setOutput('changed', 'false');
      process.exit(0);
    }
  } catch { /* not deployed yet */ }
}

fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(path.join(dataDir, 'media'), { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });

const IMAGE_TYPES = /^image\/(jpeg|png|gif|webp|avif|heic|heif|tiff|bmp)$/i;
const hasPdftoppm = (() => { try { execFileSync('which', ['pdftoppm'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const maxBytes = (config.maxAttachmentMB ?? 25) * 1024 * 1024;

function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f#%&{}$!'@+`=]/g, ' ').replace(/\s+/g, ' ').trim() || 'file';
}

// Downloads a Drive file once per version (cached across runs by the workflow).
async function download(fileId) {
  const m = fileMeta.get(fileId);
  if (!m) return null;
  if (/^application\/vnd\.google-apps\./.test(m.mimeType)) return null; // Docs/Sheets can't be downloaded as-is
  if (Number(m.size || 0) > maxBytes) {
    warn(`Attachment "${m.name}" is larger than ${config.maxAttachmentMB ?? 25} MB; linking to Google Drive instead.`);
    return null;
  }
  const version = (m.md5Checksum || m.modifiedTime || '').replace(/[^\w-]/g, '');
  const cached = path.join(cacheDir, `${fileId}-${version}`);
  if (!fs.existsSync(cached)) {
    const res = await get(DRIVE_API, `/files/${encodeURIComponent(fileId)}`, { alt: 'media', supportsAllDrives: 'true' }, { allowFail: true });
    if (res.error) {
      warn(`Couldn't download attachment "${m.name}" (${res.error.slice(0, 120)}).`);
      return null;
    }
    fs.writeFileSync(cached, Buffer.from(await res.arrayBuffer()));
    console.log(`  downloaded ${m.name}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  return { file: cached, meta: m, version };
}

const published = new Map(); // fileId -> published attachment info
async function publishAttachment(att) {
  if (published.has(att.fileId || att.fileUrl)) return published.get(att.fileId || att.fileUrl);
  let info = null;
  const dl = att.fileId ? await download(att.fileId) : null;
  if (dl) {
    const id = `${att.fileId.slice(0, 12)}${dl.version.slice(0, 6)}`;
    const name = safeFileName(dl.meta.name || att.title);
    const rel = `files/${id}/${name}`;
    fs.mkdirSync(path.join(dataDir, 'files', id), { recursive: true });
    fs.copyFileSync(dl.file, path.join(dataDir, rel));
    info = { title: att.title || dl.meta.name, url: rel, mimeType: dl.meta.mimeType, size: Number(dl.meta.size) || null, local: dl.file, id };
  } else if (att.fileUrl && (!att.fileId || fileMeta.get(att.fileId))) {
    info = { title: att.title || 'Attachment', url: att.fileUrl, mimeType: att.mimeType || '', size: null };
  }
  published.set(att.fileId || att.fileUrl, info);
  return info;
}

const images = new Map();
async function makeImage(att) {
  if (!att.local) return null;
  if (images.has(att.id)) return images.get(att.id);
  let input = att.local;
  let result = null;
  try {
    if (att.mimeType === 'application/pdf') {
      if (!hasPdftoppm) throw new Error('pdftoppm (poppler-utils) not installed');
      const out = path.join(cacheDir, `${att.id}-page1`);
      if (!fs.existsSync(`${out}.png`)) {
        execFileSync('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-scale-to', '1600', '-png', att.local, out]);
      }
      input = `${out}.png`;
    }
    const base = `media/${att.id}`;
    const img = sharp(input, { animated: false }).rotate();
    const { width, height } = await img.metadata();
    const large = await img.clone().resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 }).toFile(path.join(dataDir, `${base}.webp`));
    await img.clone().resize({ width: 640, height: 900, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 }).toFile(path.join(dataDir, `${base}-sm.webp`));
    result = { src: `${base}.webp`, small: `${base}-sm.webp`, width: large.width || width, height: large.height || height };
  } catch (e) {
    warn(`Couldn't create an image from "${att.title}": ${e.message}`);
  }
  images.set(att.id, result);
  return result;
}

const details = {};
const out = [];
for (const e of events) {
  const master = e.recurringEventId ? masters.get(e.recurringEventId) : null;
  const attachments = (await Promise.all((e.attachments || []).map(publishAttachment))).filter(Boolean);
  const imageSource = attachments.find((a) => IMAGE_TYPES.test(a.mimeType) && a.local) ||
    attachments.find((a) => a.mimeType === 'application/pdf' && a.local);
  const image = imageSource ? await makeImage(imageSource) : null;
  const desc = processDescription(e.description);
  const files = attachments
    .filter((a) => !(image && a === imageSource && IMAGE_TYPES.test(a.mimeType)))
    .map(({ title, url, mimeType, size }) => ({ title, url, mimeType, size }));
  const detail = {
    html: desc.html,
    summary: desc.summary,
    contacts: desc.contacts,
    image: image && { ...image, alt: imageSource.title || e.summary || '' },
    attachments: files,
  };
  const key = crypto.createHash('sha1').update(JSON.stringify(detail)).digest('hex').slice(0, 10);
  details[key] = detail;
  const allDay = !e.start.dateTime;
  out.push({
    id: e.id,
    series: e.recurringEventId || e.id,
    title: (e.summary || 'Untitled event').trim(),
    start: e.start.dateTime || e.start.date,
    end: e.end?.dateTime || e.end?.date || null,
    allDay,
    location: e.location?.trim() || '',
    colorId: e.colorId || null,
    recurring: Boolean(e.recurringEventId),
    recurrence: master?.recurrence ? describeRecurrence(master.recurrence, master.start?.dateTime || master.start?.date, timeZone) : null,
    featured: Boolean(image),
    detail: key,
  });
}

fs.writeFileSync(path.join(dataDir, 'events.json'), JSON.stringify({
  generated: new Date().toISOString(),
  fingerprint,
  timeZone,
  calendar: { name: meta.summary || '', description: meta.description || '' },
  range: { from: timeMin, to: timeMax },
  events: out,
  details,
}));
const featured = out.filter((e) => e.featured).length;
console.log(`Wrote data/events.json: ${out.length} event(s), ${featured} with images, ${Object.keys(details).length} distinct detail block(s)`);
setOutput('changed', 'true');
