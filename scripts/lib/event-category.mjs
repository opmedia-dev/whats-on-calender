// Shared category values published from Google Calendar's hidden event metadata.
// Never require calendar editors to add formatting markers to descriptions.
export const EVENT_CATEGORIES = Object.freeze([
  'general', 'worship', 'community', 'music', 'families', 'heritage', 'fundraising',
]);
export const EVENT_CATEGORY_KEY = 'woCategory';

export function suggestedCategory(title = '') {
  const name = String(title).toLowerCase();
  if (/\b(eucharist|communion|mass|evensong|worship|prayer service|morning prayer|evening prayer)\b/.test(name)) return 'worship';
  if (/\b(choir|concert|recital)\b/.test(name)) return 'music';
  if (/\b(coffee|tea\s*(?:and|&)\s*chat|community lunch|community breakfast)\b/.test(name)) return 'community';
  if (/\b(toddler|children|family activity|holiday club|messy church)\b/.test(name)) return 'families';
  if (/\b(heritage|history talk|church tour|guided tour)\b/.test(name)) return 'heritage';
  if (/\b(fundrais|raffle|charity sale|jumble sale)\b/.test(name)) return 'fundraising';
  return 'general';
}
export function eventCategory(event, master = null) {
  const override = event?.extendedProperties?.shared?.[EVENT_CATEGORY_KEY] ||
    master?.extendedProperties?.shared?.[EVENT_CATEGORY_KEY];
  if (EVENT_CATEGORIES.includes(override)) return { category: override, source: 'selected' };
  return { category: suggestedCategory(event?.summary || master?.summary), source: 'suggested' };
}
