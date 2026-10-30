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

// One fixed publication leaves three event slots in the four-column banner;
// showing both publications leaves exactly two rotating event slots.
// Preserve the user's maximum when neither publication is enabled.
export function eventSlots({ magazine = false, mailing = false, max = 3 } = {}) {
  const requested = Number.isInteger(Number(max)) && Number(max) >= 1
    ? Math.min(6, Number(max)) : 3;
  const fixed = Number(Boolean(magazine)) + Number(Boolean(mailing));
  return Math.min(requested, fixed ? 4 - fixed : requested);
}
