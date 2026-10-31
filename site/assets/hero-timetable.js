// Space-constrained 7-day hero schedule, separate from the full calendar agenda.
// At the specified 593×434 desktop footprint, four rows of two day panels
// show the whole week without images or an internal scroll bar.
const dayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' });
const dateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short' });
const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false });

export function heroWeek(daysStart, count, events, { addDays, eventHref, h, maxPerDay = 4 } = {}) {
  if (!Number.isInteger(count) || count < 1 || count > 60) throw new RangeError('days must be between 1 and 60');
  if (typeof h !== 'function' || typeof addDays !== 'function' || typeof eventHref !== 'function') {
    throw new Error('heroWeek requires rendering and navigation helpers');
  }
  const result = [];
  const perDay = Math.max(1, Math.min(4, Number(maxPerDay) || 4));
  const sorted = [...events].sort((a, b) => a.startDate - b.startDate || a.title.localeCompare(b.title));
  for (let offset = 0; offset < count; offset++) {
    const key = addDays(daysStart, offset);
    const date = new Date(`${key}T12:00:00Z`);
    // Ongoing multi-day events remain under their original day, or Today if
    // they started before this seven-day window. No duplicate entries.
    const onDay = sorted.filter((ev) => (ev.startKey < daysStart ? daysStart : ev.startKey) === key);
    const overflow = Math.max(0, onDay.length - perDay);
    const shown = overflow ? onDay.slice(0, perDay - 1) : onDay;
    const entries = shown.map((ev) => {
      const { href, target } = eventHref(ev);
      const time = ev.allDay ? 'All day' : timeFormat.format(ev.startDate);
      return h('li', { class: 'wo-hero-event' },
        h('a', { href, target, title: `${time} — ${ev.title}`, 'aria-label': `${time}: ${ev.title}` },
          h('span', { class: 'wo-hero-time' }, time),
          h('span', { class: 'wo-hero-title' }, ev.title)));
    });
    if (overflow) {
      // Indicate genuine capacity limits rather than silently clipping a
      // particularly busy day. The full agenda is always a click away.
      const u = new URL('calendar.html?view=list', location.href);
      const summary = onDay.slice(perDay - 1).map((ev) => ev.title).join('; ');
      entries.push(h('li', { class: 'wo-hero-event wo-hero-more' },
        h('a', { href: u.href, target: '_blank', title: summary,
          'aria-label': `View ${overflow + 1} additional events on ${dateFormat.format(date)}` },
          `+${overflow + 1} more events`)));
    }
    result.push(h('section', { class: `wo-hero-day${offset === 0 ? ' is-today' : ''}`,
      'aria-label': `${dayFormat.format(date)} ${dateFormat.format(date)}` },
      h('header', { class: 'wo-hero-day-head' },
        h('strong', {}, dayFormat.format(date)),
        h('span', {}, dateFormat.format(date))),
      h('ul', { class: 'wo-hero-events' },
        ...(entries.length ? entries : [h('li', { class: 'wo-hero-none' }, 'No events')]))));
  }
  return result;
}
