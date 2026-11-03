// Compact dropdown-menu carousel settings and deterministic slide ordering.
// Pure functions make it safe to unit-test without an iframe or DOM.
export function menuHeight(raw) {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 220 && value <= 560 ? value : 320;
}
export function menuSeconds(raw) {
  const value = Number(raw);
  return Number.isInteger(value) && (value === 0 || (value >= 3 && value <= 60)) ? value : 8;
}
export function menuEventLimit(raw) {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 12 ? value : 4;
}
export function menuSlides({ events = [], mailing = null, magazine = null, maxEvents = 4 } = {}) {
  const selectedEvents = events.slice(0, menuEventLimit(maxEvents)).map((event) => ({ type: 'event', event }));
  const [first, second, ...rest] = selectedEvents;
  // Editorial content and publications all rotate: no fixed magazine column.
  // Surface both publications within the first four slides when available.
  return [
    first,
    mailing ? { type: 'mailing', mailing } : null,
    second,
    magazine ? { type: 'magazine', magazine } : null,
    ...rest,
  ].filter(Boolean);
}
export function canAdvanceMenu({ slideCount = 0, paused = false, hovered = false, focused = false,
  hidden = false, reducedMotion = false } = {}) {
  return slideCount > 1 && !paused && !hovered && !focused && !hidden && !reducedMotion;
}
