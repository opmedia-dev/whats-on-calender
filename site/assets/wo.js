// Shared code for the What's On embeds: loads events.json, formats dates in the
// calendar's time zone, applies URL-parameter theming, talks to the host page
// (iframe height, deep links) and renders the event detail view.
export const params = new URLSearchParams(location.search);
const embedded = window.parent !== window;

export function param(name, fallback = '') {
  const v = params.get(name);
  return v == null || v === '' ? fallback : v;
}
export const flag = (name, fallback) => (params.has(name) ? !/^(0|false|no|off)$/i.test(params.get(name)) : fallback);
export const num = (name, fallback) => {
  const n = Number(params.get(name));
  return params.has(name) && Number.isFinite(n) ? n : fallback;
};

const THEME = {
  accent: '--wo-accent', accent2: '--wo-accent2', text: '--wo-text', muted: '--wo-muted', bg: '--wo-bg',
  card: '--wo-card', time: '--wo-time', today: '--wo-today', dayBg: '--wo-day-bg', border: '--wo-border',
  font: '--wo-font', headingFont: '--wo-heading-font', radius: '--wo-radius', titleColor: '--wo-title',
};
export function applyTheme() {
  const root = document.documentElement.style;
  for (const [key, cssVar] of Object.entries(THEME)) {
    const v = params.get(key);
    if (!v) continue;
    if (key === 'radius') root.setProperty(cssVar, /^\d+$/.test(v) ? `${v}px` : v);
    else root.setProperty(cssVar, /^[0-9a-f]{3,8}$/i.test(v) ? `#${v}` : v);
  }
  if (params.get('fontUrl') && /^https:\/\//.test(params.get('fontUrl'))) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = params.get('fontUrl');
    document.head.append(l);
  }
}

// ---------- Host page messaging ----------
export function postToParent(msg) {
  if (embedded) window.parent.postMessage({ source: 'whatson', ...msg }, '*');
}

export const host = { page: null, event: null };
// The embed snippet's script replies with the host page URL (used for share
// links) and any ?event= in it (so links to the What's On page open an event).
export function helloHost(timeout = 600) {
  if (!embedded) return Promise.resolve(host);
  return new Promise((resolve) => {
    const done = () => { window.removeEventListener('message', onMsg); resolve(host); };
    const onMsg = (e) => {
      if (e.source !== window.parent || !e.data || e.data.source !== 'whatson-host') return;
      if (e.data.type === 'hello') {
        if (/^https?:\/\//.test(e.data.page || '')) host.page = e.data.page;
        host.event = e.data.event || null;
        done();
      }
    };
    window.addEventListener('message', onMsg);
    postToParent({ type: 'hello' });
    setTimeout(done, timeout);
  });
}

export function reportHeight() {
  if (!embedded) return;
  document.documentElement.classList.add('wo-embedded');
  let last = 0;
  let lastWidth = 0;
  const send = () => {
    const h = Math.ceil(document.documentElement.getBoundingClientRect().height);
    const w = window.innerWidth;
    const narrowedShrink = h < last && w < lastWidth;
    if (Math.abs(h - last) > 1 && !narrowedShrink) {
      last = h;
      postToParent({ type: 'height', height: h });
    }
    lastWidth = w;
  };
  new ResizeObserver(send).observe(document.documentElement);
  window.addEventListener('load', send);
  send();
}

export const scrollHostToTop = () => postToParent({ type: 'scrollToTop' });

// ---------- Data ----------
let tz = 'Europe/London';
export const timeZone = () => tz;

export function dayKey(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function parseStart(value, allDay) {
  // All-day dates are calendar dates; anchor them at noon UTC so they fall on
  // the right day in any European time zone.
  return allDay ? new Date(`${value}T12:00:00Z`) : new Date(value);
}

export function addDays(key, n) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function matchesFilters(e) {
  const only = param('only').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  const exclude = param('exclude').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  const title = e.title.toLowerCase();
  if (only.length && !only.some((w) => title.includes(w))) return false;
  if (exclude.some((w) => title.includes(w))) return false;
  if (params.has('colors')) {
    const allowed = param('colors').split(',').map((s) => s.trim());
    if (!allowed.includes(e.colorId || '0')) return false;
  }
  return true;
}

export async function loadEvents() {
  const res = await fetch(new URL('../events.json', import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load events (${res.status})`);
  const data = await res.json();
  tz = data.timeZone || tz;
  const base = new URL('../', import.meta.url);
  const resolve = (rel) => (rel && !/^https?:/i.test(rel) ? new URL(rel, base).href : rel);
  const details = data.details || {};
  for (const d of Object.values(details)) {
    if (d.image) { d.image.src = resolve(d.image.src); d.image.small = resolve(d.image.small); }
    for (const a of d.attachments || []) a.url = resolve(a.url);
  }
  const events = (data.events || []).map((e) => {
    const start = parseStart(e.start, e.allDay);
    let end = e.end ? parseStart(e.end, e.allDay) : start;
    // All-day end dates are exclusive in Google Calendar.
    const endKey = e.allDay && e.end ? addDays(e.end, -1) : dayKey(end);
    if (e.allDay) end = new Date(`${endKey}T23:59:59Z`);
    return { ...e, startDate: start, endDate: end, startKey: e.allDay ? e.start : dayKey(start), endKey, info: details[e.detail] || {} };
  }).filter(matchesFilters).sort((a, b) => a.startDate - b.startDate || a.allDay - b.allDay || a.title.localeCompare(b.title));
  return { ...data, events };
}

export const isUpcoming = (e, now = new Date()) => e.endDate > now || e.endKey >= dayKey(now);

// One entry per series (its next date), e.g. for cards; series with the same
// title (e.g. "Toddler Group" on Tuesdays and on Thursdays) are merged.
export function nextPerSeries(events) {
  const byTitle = new Map();
  for (const e of events) {
    const key = e.recurring ? e.title.trim().toLowerCase() : `one:${e.id}`;
    const group = byTitle.get(key);
    if (!group) byTitle.set(key, { ...e, recurrences: [e.recurrence], dates: [e] });
    else {
      group.dates.push(e);
      if (!group.recurrences.includes(e.recurrence)) group.recurrences.push(e.recurrence);
      if (!group.info.image && e.info.image) group.info = e.info;
    }
  }
  return [...byTitle.values()].map((g) => ({ ...g, recurrence: mergeRecurrence(g.recurrences) }));
}

const WEEKDAY_LIST = /^Every ((?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day(?:(?:, | and )(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day)*)$/;
const ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
function mergeRecurrence(texts) {
  const unique = [...new Set(texts.filter(Boolean))];
  const m = unique.map((t) => t.match(WEEKDAY_LIST));
  if (unique.length > 1 && m.every(Boolean)) {
    const days = [...new Set(m.flatMap((x) => x[1].split(/, | and /)))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    return `Every ${days.length > 1 ? `${days.slice(0, -1).join(', ')} and ${days.at(-1)}` : days[0]}`;
  }
  return unique.join('; ');
}

// ---------- Formatting ----------
const fmtCache = new Map();
function fmt(opts) {
  const k = JSON.stringify(opts) + tz;
  if (!fmtCache.has(k)) fmtCache.set(k, new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts }));
  return fmtCache.get(k);
}

function hm(date) {
  const parts = Object.fromEntries(fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map((p) => [p.type, p.value]));
  return { h: Number(parts.hour), m: Number(parts.minute) };
}

export function formatTime(date, clock = param('clock', '24')) {
  const { h, m } = hm(date);
  if (clock === '12') {
    const suffix = h < 12 ? 'am' : 'pm';
    const h12 = h % 12 || 12;
    if (h === 12 && m === 0) return '12 noon';
    return m ? `${h12}.${String(m).padStart(2, '0')}${suffix}` : `${h12}${suffix}`;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTimeRange(e, clock) {
  if (e.allDay) return 'All day';
  const s = formatTime(e.startDate, clock);
  if (!e.end || e.endDate - e.startDate < 60000 || e.startKey !== e.endKey) return s;
  return `${s}–${formatTime(e.endDate, clock)}`;
}

export const formatDayHeader = (d) => fmt({ weekday: 'short', day: '2-digit', month: 'short' }).format(d).replace(',', '');
export const formatLongDate = (d, year = false) =>
  fmt({ weekday: 'long', day: 'numeric', month: 'long', ...(year ? { year: 'numeric' } : {}) }).format(d).replace(',', '');
export const formatMonth = (d) => fmt({ month: 'long', year: 'numeric' }).format(d);

function ordinal(n) {
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`;
}

// "Saturday 5th December, 11am–3pm" (multi-day: "Fri 4 – Sun 6 December")
export function formatWhen(e, { clock = param('clock', '12'), year = false, ordinals = flag('ordinals', true) } = {}) {
  const day = (d) => {
    const parts = Object.fromEntries(fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(d).map((p) => [p.type, p.value]));
    return `${parts.weekday} ${ordinals ? ordinal(Number(parts.day)) : parts.day} ${parts.month}${year ? ` ${parts.year}` : ''}`;
  };
  if (e.startKey !== e.endKey) {
    const end = e.allDay ? new Date(`${e.endKey}T12:00:00Z`) : e.endDate;
    return `${day(e.startDate)} – ${day(end)}`;
  }
  return e.allDay ? day(e.startDate) : `${day(e.startDate)}, ${formatTimeRange(e, clock)}`;
}

// ---------- DOM helpers ----------
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

export const icon = (name) => {
  const paths = {
    left: 'M15 18l-6-6 6-6', right: 'M9 18l6-6-6-6',
    calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    clock: 'M12 7v5l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
    repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
    pin: 'M12 22s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    mail: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 6l9 7 9-7',
    phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
    file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
    share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
    plus: 'M12 5v14M5 12h14', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
    arrow: 'M5 12h14M13 6l6 6-6 6', download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
    grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z', list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `wo-icon wo-icon-${name}`);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', paths[name] || '');
  svg.append(p);
  return svg;
};

export function showError(el, message) {
  el.replaceChildren(h('p', { class: 'wo-error' }, message));
}

export function emptyState(text) {
  return h('p', { class: 'wo-empty' }, text);
}

// ---------- Opening events ----------
// With ?link=<What's On page URL>, clicks go to that page (which opens the event);
// otherwise the event opens in this embed via #event=<id>.
export function eventHref(e) {
  const link = param('link');
  if (link && /^https?:\/\//i.test(link)) {
    const u = new URL(link);
    u.searchParams.set('event', e.id);
    return { href: u.href, target: '_top' };
  }
  return { href: `#event=${encodeURIComponent(e.id)}`, target: null };
}

export function shareUrl(e) {
  const page = param('link') && /^https?:\/\//i.test(param('link')) ? param('link') : host.page;
  if (page) {
    const u = new URL(page);
    u.searchParams.set('event', e.id);
    u.hash = '';
    return u.href;
  }
  const u = new URL(location.href);
  u.hash = `event=${encodeURIComponent(e.id)}`;
  return u.href;
}

export function currentEventId() {
  const m = location.hash.match(/^#event=(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

// Wires #event=<id> to a detail view rendered in place of the main view.
export function routeDetails({ main, detail, events, backLabel }) {
  let scrollY = 0;
  let depth = 0; // detail views opened from this page's list (so Back = history.back())
  let showingList = !currentEventId();
  const onBack = () => {
    if (depth > 0) { history.back(); return; }
    history.replaceState(null, '', location.pathname + location.search);
    render();
  };
  const render = () => {
    const id = currentEventId();
    const ev = id && (events.find((e) => e.id === id) || findSeriesFallback(events, id));
    if (ev) {
      if (showingList) scrollY = window.scrollY;
      showingList = false;
      detail.replaceChildren(renderDetail(ev, events, { backLabel, onBack }));
      main.hidden = true;
      detail.hidden = false;
      window.scrollTo(0, 0);
      scrollHostToTop();
      postToParent({ type: 'event', id: ev.id, title: ev.title });
    } else {
      showingList = true;
      depth = 0;
      detail.hidden = true;
      detail.replaceChildren();
      main.hidden = false;
      window.scrollTo(0, scrollY);
      postToParent({ type: 'event', id: null });
    }
  };
  window.addEventListener('hashchange', (ev) => {
    const wasEvent = /#event=/.test(new URL(ev.oldURL).hash);
    const isEvent = Boolean(currentEventId());
    if (isEvent) depth = wasEvent ? depth + (depth > 0 ? 1 : 0) : 1;
    render();
  });
  render();
  return render;
}

// Links to a past date of a repeating event fall back to its next date.
function findSeriesFallback(events, id) {
  const series = id.replace(/_\d{8}(T\d{6}Z)?$/, '');
  const now = new Date();
  return events.find((e) => e.series.startsWith(series) && isUpcoming(e, now)) || null;
}

function gcalDate(d, allDay) {
  return allDay ? d.toISOString().slice(0, 10).replace(/-/g, '') : d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function googleCalendarLink(e) {
  const end = e.allDay ? new Date(`${addDays(e.endKey, 1)}T12:00:00Z`) : e.endDate;
  const u = new URL('https://calendar.google.com/calendar/render');
  u.searchParams.set('action', 'TEMPLATE');
  u.searchParams.set('text', e.title);
  u.searchParams.set('dates', `${gcalDate(e.startDate, e.allDay)}/${gcalDate(end, e.allDay)}`);
  if (e.info.summary) u.searchParams.set('details', `${e.info.summary}\n\n${shareUrl(e)}`);
  if (e.location) u.searchParams.set('location', e.location);
  return u.href;
}

function icsFor(e) {
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
  const end = e.allDay ? new Date(`${addDays(e.endKey, 1)}T12:00:00Z`) : e.endDate;
  const dt = (d) => (e.allDay ? `;VALUE=DATE:${gcalDate(d, true)}` : `:${gcalDate(d, false)}`);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//whats-on//EN', 'BEGIN:VEVENT',
    `UID:${e.id}@whats-on`, `DTSTAMP:${gcalDate(new Date(), false)}`,
    `DTSTART${dt(e.startDate)}`, `DTEND${dt(end)}`, `SUMMARY:${esc(e.title)}`,
    e.location ? `LOCATION:${esc(e.location)}` : null,
    `DESCRIPTION:${esc([e.info.summary, shareUrl(e)].filter(Boolean).join('\n\n'))}`,
    `URL:${shareUrl(e)}`, 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
}

function downloadIcs(e) {
  const blob = new Blob([icsFor(e)], { type: 'text/calendar' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `${e.title.replace(/[^\w -]+/g, '').trim() || 'event'}.ics` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

const looksLikeAddress = (loc) => /\d|,/.test(loc) && loc.length > 8;

function fileSize(bytes) {
  if (!bytes) return '';
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fileKind(a) {
  const m = a.mimeType || '';
  if (m === 'application/pdf') return 'PDF';
  if (m.startsWith('image/')) return 'Image';
  if (/word|document/.test(m)) return 'Document';
  if (/sheet|excel/.test(m)) return 'Spreadsheet';
  if (/presentation|powerpoint/.test(m)) return 'Slides';
  return 'File';
}

const mapLink = (loc) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`;

// "St John the Baptist Church, Old Malden, …, UK / coffee lounge" -> "St John the Baptist Church · coffee lounge"
export function shortLocation(loc = '') {
  const [addr, room] = loc.split(/\s+\/\s+/);
  const first = addr.split(',')[0].trim();
  return room ? `${first} · ${room.trim()}` : first;
}

const formatShortDate = (d) => fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(d).replace(',', '');

export function renderDetail(e, events, { backLabel = 'Back', onBack } = {}) {
  const info = e.info || {};
  const img = info.image;
  const portrait = img && img.height > img.width * 1.05;
  const now = new Date();
  const clock = param('clock', '12');
  const multiDay = e.startKey !== e.endKey;
  const year = e.startDate.getFullYear() !== now.getFullYear();
  const moreDates = e.recurring
    ? events.filter((x) => x.series === e.series && x.id !== e.id && isUpcoming(x, now) && x.startDate > e.startDate).slice(0, num('moreDates', 6))
    : [];

  const back = h('button', { class: 'wo-back', type: 'button', onclick: () => onBack?.() }, icon('left'), backLabel);

  let media = null;
  if (img) {
    media = h('figure', { class: `wo-detail-media${portrait ? ' is-portrait' : ''}` },
      h('a', { href: img.src, target: '_blank', rel: 'noopener', title: 'Open full size' },
        h('img', { src: img.src, alt: img.alt || e.title, width: img.width, height: img.height })));
    media.style.setProperty('--wo-media-bg', `url("${(img.small || img.src).replace(/"/g, '%22')}")`);
  }

  const row = (name, label, ...value) => h('li', {}, icon(name),
    h('div', {}, h('span', { class: 'wo-info-label' }, label), h('span', { class: 'wo-info-value' }, ...value)));
  const info_ = h('ul', { class: 'wo-info' },
    row('calendar', 'Date', multiDay ? formatWhen(e, { clock, year }) : formatLongDate(e.startDate, year)),
    !multiDay && row('clock', 'Time', formatTimeRange(e, clock)),
    e.recurrence && row('repeat', 'Repeats', e.recurrence),
    e.location && row('pin', 'Where', e.location,
      looksLikeAddress(e.location) ? h('a', { class: 'wo-info-link', href: mapLink(e.location), target: '_blank', rel: 'noopener' }, 'Get directions', icon('arrow')) : null));

  const share = h('button', { class: 'wo-btn wo-btn-ghost', type: 'button', onclick: async (ev) => {
    const btn = ev.currentTarget;
    const url = shareUrl(e);
    try {
      if (navigator.share) { await navigator.share({ title: e.title, url }); return; }
    } catch (err) { if (err?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); btn.lastChild.textContent = 'Link copied'; } catch { prompt('Copy this link', url); }
  } }, icon('share'), h('span', {}, 'Share'));

  const actions = h('div', { class: 'wo-actions' },
    h('a', { class: 'wo-btn', href: googleCalendarLink(e), target: '_blank', rel: 'noopener' }, icon('plus'), 'Add to Google Calendar'),
    h('div', { class: 'wo-actions-row' },
      h('button', { class: 'wo-btn wo-btn-ghost', type: 'button', onclick: () => downloadIcs(e) }, icon('calendar'), 'Apple / Outlook'),
      share));

  const contacts = info.contacts && (info.contacts.emails.length || info.contacts.phones.length) && flag('contacts', true)
    ? h('section', { class: 'wo-panel' }, h('h3', {}, 'Contact'),
      h('ul', { class: 'wo-contact' },
        info.contacts.emails.map((m) => h('li', {}, icon('mail'), h('a', { href: `mailto:${m}?subject=${encodeURIComponent(e.title)}` }, m))),
        info.contacts.phones.map((p) => h('li', {}, icon('phone'), h('a', { href: p.href }, p.number)))))
    : null;

  const files = info.attachments?.length
    ? h('section', { class: 'wo-panel' }, h('h3', {}, info.attachments.length > 1 ? 'Downloads' : 'Download'),
      h('ul', { class: 'wo-files' }, info.attachments.map((a) => h('li', {},
        h('a', { href: a.url, target: '_blank', rel: 'noopener', download: a.url.startsWith(location.origin) ? '' : null },
          icon('file'),
          h('span', { class: 'wo-file-text' }, h('span', { class: 'wo-file-name' }, a.title),
            h('span', { class: 'wo-file-kind' }, [fileKind(a), fileSize(a.size)].filter(Boolean).join(' · '))),
          icon('download'))))))
    : null;

  const dates = moreDates.length
    ? h('section', { class: 'wo-detail-section' }, h('h3', {}, 'Next dates'),
      h('ul', { class: 'wo-dates' }, moreDates.map((x) => h('li', {}, h('a', { href: `#event=${encodeURIComponent(x.id)}` },
        formatShortDate(x.startDate), x.allDay ? '' : ` · ${formatTime(x.startDate, clock)}`)))))
    : null;

  const eyebrow = e.recurring && e.recurrence ? 'Regular event' : `${formatShortDate(e.startDate)}${e.allDay ? '' : ` · ${formatTime(e.startDate, clock)}`}`;

  return h('article', { class: `wo-detail${img ? ' has-media' : ''}` },
    h('div', { class: 'wo-detail-top' }, back),
    media,
    h('div', { class: 'wo-detail-layout' },
      h('header', { class: 'wo-detail-head' },
        h('p', { class: 'wo-eyebrow' }, eyebrow),
        h('h2', { class: 'wo-detail-title' }, e.title)),
      h('aside', { class: 'wo-detail-aside' }, h('div', { class: 'wo-panel' }, info_, actions), contacts, files),
      h('div', { class: 'wo-detail-body' },
        info.html ? h('div', { class: 'wo-description', html: info.html }) : null,
        dates)));
}

// A card: image (or placeholder) with a date badge, title, when and where.
export function renderCard(e, { showRecurrence = false, clock, summary = false, location = flag('cardLocation', true), more = null } = {}) {
  const img = e.info?.image;
  const { href, target } = eventHref(e);
  const c = clock || param('clock', '12');
  const regular = showRecurrence && e.recurring && e.recurrence;
  let when;
  if (regular) when = `${e.recurrence}${e.allDay ? '' : `, ${formatTime(e.startDate, c)}`}`;
  else if (e.startKey !== e.endKey) when = formatWhen(e, { clock: c, ordinals: false });
  else when = `${formatShortDate(e.startDate)} · ${formatTimeRange(e, c)}`;
  const d = e.startDate;
  return h('a', { class: `wo-card${img ? '' : ' no-image'}`, href, target },
    h('div', { class: 'wo-card-media' },
      img
        ? h('img', { src: img.small || img.src, alt: '', loading: 'lazy', width: img.width, height: img.height })
        : h('div', { class: 'wo-card-placeholder', 'aria-hidden': 'true' }, icon('calendar')),
      regular
        ? h('span', { class: 'wo-tag' }, icon('repeat'), 'Regular')
        : h('span', { class: 'wo-date-badge', 'aria-hidden': 'true' },
          h('b', {}, fmt({ day: 'numeric' }).format(d)), h('span', {}, fmt({ month: 'short' }).format(d)))),
    h('div', { class: 'wo-card-body' },
      h('h3', { class: 'wo-card-title' }, e.title),
      h('p', { class: 'wo-card-meta' }, icon(regular ? 'repeat' : 'clock'), h('span', {}, when)),
      location && e.location ? h('p', { class: 'wo-card-meta' }, icon('pin'), h('span', {}, shortLocation(e.location))) : null,
      summary && e.info?.summary ? h('p', { class: 'wo-card-summary' }, e.info.summary) : null,
      more ? h('span', { class: 'wo-card-link' }, more, icon('arrow')) : null));
}

// One day of the agenda (timetable and the calendar's list view).
export function renderAgendaDay(key, evs, { today = null, showLocation = flag('location', true), clock } = {}) {
  const d = new Date(`${key}T12:00:00Z`);
  const isToday = today && key === today;
  const isTomorrow = today && key === addDays(today, 1);
  return h('section', { class: `wo-day${isToday ? ' is-today' : ''}` },
    h('header', { class: 'wo-day-head' },
      h('span', { class: 'wo-day-name' }, fmt({ weekday: 'long' }).format(d)),
      h('span', { class: 'wo-day-date' }, fmt({ day: 'numeric', month: 'long' }).format(d)),
      isToday ? h('span', { class: 'wo-badge' }, 'Today') : isTomorrow ? h('span', { class: 'wo-badge is-soft' }, 'Tomorrow') : null),
    h('ul', { class: 'wo-day-list' }, evs.map((e) => {
      const { href, target } = eventHref(e);
      const thumb = e.info?.image;
      return h('li', { class: 'wo-tt-item' }, h('a', { class: 'wo-tt-row', href, target },
        h('span', { class: 'wo-tt-time' }, e.allDay ? 'All day' : formatTime(e.startDate, clock)),
        h('span', { class: 'wo-tt-main' },
          h('span', { class: 'wo-tt-title' }, e.title),
          showLocation && e.location ? h('span', { class: 'wo-tt-loc' }, shortLocation(e.location)) : null),
        thumb ? h('img', { class: 'wo-tt-thumb', src: thumb.small || thumb.src, alt: '', loading: 'lazy' }) : h('span'),
        icon('right')));
    })));
}

// Numbered pager like the Duda blog widget: ‹ 1 2 3 ›
export function renderPager(page, pages, onChange) {
  if (pages <= 1) return h('nav', { class: 'wo-pager', hidden: true });
  const btn = (label, p, cls, aria) => h('button', {
    type: 'button', class: cls, 'aria-label': aria, disabled: p < 0 || p >= pages, 'aria-current': cls === 'is-current' ? 'page' : null,
    onclick: () => onChange(p),
  }, label);
  const nums = [];
  for (let i = 0; i < pages; i++) {
    if (pages > 7 && i > 0 && i < pages - 1 && Math.abs(i - page) > 1) {
      if (nums.at(-1) !== '…') nums.push('…');
      continue;
    }
    nums.push(i);
  }
  return h('nav', { class: 'wo-pager', 'aria-label': 'Pages' },
    btn(icon('left'), page - 1, 'wo-pager-arrow', 'Previous page'),
    nums.map((i) => (i === '…' ? h('span', { class: 'wo-pager-gap' }, '…') : btn(String(i + 1), i, i === page ? 'is-current' : '', `Page ${i + 1}`))),
    btn(icon('right'), page + 1, 'wo-pager-arrow', 'Next page'));
}

// Called by each page on load: theme, height reporting and host handshake.
export async function init() {
  applyTheme();
  reportHeight();
  await helloHost();
  if (host.event && !currentEventId() && document.documentElement.dataset.detail === 'inline') {
    history.replaceState(null, '', `#event=${encodeURIComponent(host.event)}`);
  }
  window.addEventListener('message', (e) => {
    if (e.source === window.parent && e.data?.source === 'whatson-host' && e.data.type === 'open') {
      location.hash = e.data.event ? `event=${encodeURIComponent(e.data.event)}` : '';
    }
  });
}
