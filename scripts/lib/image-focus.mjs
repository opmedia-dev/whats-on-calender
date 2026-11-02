// An event may override its recurring series' image focal point.
// Keep this strictly numeric: the output is inserted into a CSS property.
export function eventImageFocus(event, master = null) {
  const value = event?.extendedProperties?.shared?.woImageFocus ??
    master?.extendedProperties?.shared?.woImageFocus ?? '50,50';
  const match = String(value).match(/^(\d{1,3}),(\d{1,3})$/);
  if (!match) return '50% 50%';
  const x = Number(match[1]), y = Number(match[2]);
  return x <= 100 && y <= 100 ? x + '% ' + y + '%' : '50% 50%';
}
