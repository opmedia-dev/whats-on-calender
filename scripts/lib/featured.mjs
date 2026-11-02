// Editor-selected events are featured independently of whether they have a poster.
// Google Calendar extendedProperties.shared values are strings.
// A single recurring occurrence can explicitly override its series master.
export function eventFeatured(event, master = null) {
  const value = event?.extendedProperties?.shared?.woFeatured;
  if (value === 'true' || value === 'false') return value === 'true';
  return master?.extendedProperties?.shared?.woFeatured === 'true';
}
