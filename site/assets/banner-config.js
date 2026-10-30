// Defaults for the homepage carousel. Pure helpers are regression-tested.
export function horizonDays(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 90 ? n : 14;
}
export function autoplaySeconds(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && (n === 0 || (n >= 3 && n <= 60)) ? n : 8;
}
export function mayAutoAdvance({ pages, hovered, focusWithin, hidden, detailOpen, reducedMotion }) {
  return pages > 1 && !hovered && !focusWithin && !hidden && !detailOpen && !reducedMotion;
}
