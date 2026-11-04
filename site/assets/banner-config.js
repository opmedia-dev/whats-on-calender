// Defaults for the homepage carousel. Pure helpers are regression-tested.
export function horizonDays(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 400 ? n : 400;
}
export function autoplaySeconds(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && (n === 0 || (n >= 3 && n <= 60)) ? n : 8;
}
export function mayAutoAdvance({ pages, hovered, focusWithin, hidden, detailOpen, reducedMotion }) {
  return pages > 1 && !hovered && !focusWithin && !hidden && !detailOpen && !reducedMotion;
}

// Mailing and magazine are fixed. Monthly notices now live in the rotating
// card sequence so they appear directly ahead of their month's featured events.
export function eventSlots({ magazine = false, mailing = false, max = 3 } = {}) {
  const requested = Number.isInteger(Number(max)) && Number(max) >= 1
    ? Math.min(6, Number(max)) : 3;
  const fixed = Number(Boolean(magazine)) + Number(Boolean(mailing));
  return Math.max(1, Math.min(requested, fixed ? 4 - fixed : requested));
}

// Month calculations are anchored to parish local time, including December → January.
export function currentAndNextMonths(now = new Date(), timeZone = 'Europe/London') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit',
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  const year = Number(parts.year), month = Number(parts.month);
  const current = parts.year + '-' + parts.month;
  const next = month === 12 ? (year + 1) + '-01' :
    year + '-' + String(month + 1).padStart(2, '0');
  return [current, next];
}

// Insert each published monthly notice before the FIRST featured event in
// that calendar month. A poster remains visible even if no events are featured.
export function chronologicalBannerItems(events = [], notices = {}, months = []) {
  const items = events.map((event) => {
    const start = event.startDate instanceof Date ? event.startDate.getTime() :
      new Date(event.startDate || event.start).getTime();
    const month = event.startKey?.slice(0, 7) ||
      (Number.isFinite(start) ? new Date(start).toISOString().slice(0, 7) : '9999-12');
    return { type: 'event', event, month, sortTime: Number.isFinite(start) ? start : Infinity };
  });
  for (const month of months) {
    const notice = notices[month];
    if (notice?.image?.src && notice?.file) {
      items.push({ type: 'monthly', notice, month, sortTime: -Infinity });
    }
  }
  return items.sort((a, b) => a.month.localeCompare(b.month) ||
    (a.type === 'monthly' ? -1 : 1) - (b.type === 'monthly' ? -1 : 1) ||
    a.sortTime - b.sortTime ||
    String(a.event?.title || '').localeCompare(String(b.event?.title || ''), 'en-GB'));
}
