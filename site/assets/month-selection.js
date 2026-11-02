// Calendar-month browsing for What's On. Unlike the All events view,
// a month must retain every occurrence of a repeating event.
export function shiftMonth(month, offset) {
  const d = new Date(month + '-15T12:00:00Z');
  if (!Number.isFinite(d.getTime())) throw new Error('Invalid month');
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 7);
}
export function isValidMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
}
export function clampMonth(month, min, max) {
  return month < min ? min : month > max ? max : month;
}
export function eventsInMonth(events, month) {
  const start = month + '-01';
  const end = shiftMonth(month, 1) + '-01';
  // Also include multi-day events overlapping month boundaries.
  return events.filter((event) => event.startKey < end && event.endKey >= start);
}
