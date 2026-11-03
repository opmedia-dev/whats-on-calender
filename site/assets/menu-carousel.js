// Compact dropdown-menu carousel settings and deterministic slide ordering.
// Pure functions make it safe to unit-test without an iframe or DOM.
export function menuHeight(raw) {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 220 && value <= 560 ? value : 320;
}
export function menuSeconds(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return 8;
  const value = Number(raw);
  return Number.isInteger(value) && (value === 0 || (value >= 3 && value <= 60)) ? value : 8;
}
export function menuEventLimit(raw) {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 12 ? value : 4;
}
export function menuSlides({ events = [], mailing = null, magazine = null, maxEvents = 4 } = {}) {
  // Sort BEFORE applying the event limit. Calendar feeds aren't guaranteed to
  // arrive in date order; never shuffle events with publication content.
  const timestamp = (event) => {
    const source = event.startDate ?? event.start ?? event.startTime ?? null;
    const time = source instanceof Date ? source.getTime() : Date.parse(source);
    return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
  };
  const ordered = [...events].sort((a, b) =>
    timestamp(a) - timestamp(b) ||
    String(a.title ?? '').localeCompare(String(b.title ?? ''), 'en-GB') ||
    String(a.id ?? '').localeCompare(String(b.id ?? ''), 'en-GB'));
  const selected = ordered.slice(0, menuEventLimit(maxEvents)).map((event) => ({
    type: 'event', event,
  }));
  // Publications follow the dated events as a predictable final part of the
  // rotation. They don't break up the chronological sequence.
  if (mailing) selected.push({ type: 'mailing', mailing });
  if (magazine) selected.push({ type: 'magazine', magazine });
  return selected;
}
export function canAdvanceMenu({ slideCount = 0, paused = false, hovered = false, focused = false,
  hidden = false, reducedMotion = false } = {}) {
  return slideCount > 1 && !paused && !hovered && !focused && !hidden && !reducedMotion;
}
