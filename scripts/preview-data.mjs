// Public, clearly labelled sample content used only when a Google API key
// is not configured. These are not actual parish calendar events.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pad = (x) => String(x).padStart(2, '0');
const DAY = 86400000;
const londonDay = (now) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(now);
const dateAt = (base, offset) => {
  const d = new Date(base.getTime() + offset * DAY);
  return d.toISOString().slice(0, 10);
};
const weekday = (day) => new Date(`${day}T12:00:00Z`).getUTCDay();

// Attach clearly marked vector sample artwork; no real flyers or people.
const media = (name, portrait = false) => ({
  src: `assets/sample-${name}.svg`,
  small: `assets/sample-${name}.svg`,
  alt: `Sample ${name} poster — demonstration only`,
  width: portrait ? 750 : 1200,
  height: portrait ? 1050 : 750,
});
const person = { emails: ['example@example.org'], phones: [{ number: '020 0000 0000', href: 'tel:+442000000000' }] };

export function makePreviewData(now = new Date()) {
  const today = londonDay(now);
  const base = new Date(`${today}T12:00:00Z`);
  const events = [];
  const details = {
    regular: {
      html: '<p>Sample weekly community activity. Everyone is welcome.</p><p><strong>Demonstration content only.</strong> Please do not use these details to plan a visit.</p>',
      summary: 'Sample weekly community activity. Everyone is welcome.',
      contacts: person, image: media('community'),
      attachments: [],
    },
    music: {
      html: '<p>Join a sample musical evening with refreshments.</p><ul><li>Doors open before the event</li><li>All ages welcome</li></ul><p><a href="https://example.org">Example information link</a></p>',
      summary: 'An example musical evening with refreshments.',
      contacts: person, image: media('music'),
      attachments: [{ title: 'Sample programme (not a real event)', url: 'assets/sample-programme.txt', mimeType: 'text/plain', size: 126 }],
    },
    poster: {
      html: '<h3>Sample community fair</h3><p>Demonstration event with a portrait poster and a linked attachment.</p><p><strong>Tickets:</strong> Free (sample only).</p>',
      summary: 'Sample community fair with poster, details and downloads.',
      contacts: person, image: media('fair', true),
      attachments: [{ title: 'Sample event information', url: 'assets/sample-programme.txt', mimeType: 'text/plain', size: 126 }],
    },
    normal: {
      html: '<p>Sample calendar-only event without a poster. This demonstrates the complete calendar and search results.</p>',
      summary: 'Sample event without a poster.',
      contacts: { emails: [], phones: [] }, image: null, attachments: [],
    },
  };
  const push = ({ id, series = id, title, date, hour = 10, minute = 0, duration = 60, allDay = false, recurring = false, recurrence = null, detail = 'normal', location = 'Example venue, Old Malden', colorId = '3' }) => {
    const start = allDay ? date : `${date}T${pad(hour)}:${pad(minute)}:00Z`;
    const endDate = allDay ? dateAt(new Date(`${date}T12:00:00Z`), 1) : new Date(new Date(start).getTime() + duration * 60000).toISOString();
    events.push({ id, series, title, start, end: endDate, allDay, location, colorId, recurring, recurrence, featured: Boolean(details[detail].image), detail });
  };
  const regular = [
    { title: 'Community Coffee Morning (sample)', weekday: 1, hour: 10, detail: 'regular', colorId: '2' },
    { title: 'Community Music Group (sample)', weekday: 3, hour: 19, detail: 'music', colorId: '3' },
    { title: 'Weekly Social Gathering (sample)', weekday: 5, hour: 14, detail: 'regular', colorId: '5' },
  ];
  // Include dates in the past and future to test month navigation, repeating
  // events, series grouping and upcoming filters across month boundaries.
  for (const [seriesIndex, series] of regular.entries()) {
    for (let offset = -35; offset <= 95; offset++) {
      const day = dateAt(base, offset);
      if (weekday(day) !== series.weekday) continue;
      push({
        id: `demo-series-${seriesIndex}-${day}`,
        series: `demo-series-${seriesIndex}`,
        title: series.title, date: day, hour: series.hour, duration: 90,
        recurring: true, recurrence: `Every ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][series.weekday]}`,
        detail: series.detail, colorId: series.colorId,
      });
    }
  }
  const singles = [
    ['Seasonal Fair (sample)', 2, 11, 'poster', '4'],
    ['Choir Evening (sample)', 4, 19, 'music', '3'],
    ['Open Community Afternoon (sample)', 6, 13, 'regular', '2'],
    ['History Talk (sample)', 9, 18, 'normal', '7'],
    ['Weekend Drop-in (sample)', 14, 11, 'normal', '9'],
    ['Family Celebration (sample)', 21, 11, 'poster', '5'],
    ['Local Arts Evening (sample)', 28, 19, 'music', '3'],
    ['Community Open Day (sample)', 43, 12, 'poster', '4'],
  ];
  singles.forEach(([title, offset, hour, detail, colorId], i) => push({
    id: `demo-event-${i}`, title, date: dateAt(base, offset), hour,
    detail, colorId, duration: 120,
  }));
  push({ id: 'demo-all-day', title: 'All-day Community Event (sample)', date: dateAt(base, 12), allDay: true, detail: 'poster', colorId: '7' });
  events.sort((a, b) => a.start.localeCompare(b.start));
  return {
    preview: true,
    generated: now.toISOString(),
    timeZone: 'Europe/London',
    calendar: { name: 'Sample events — PREVIEW', description: 'Not connected to Google Calendar.' },
    range: { from: dateAt(base, -35), to: dateAt(base, 100) },
    events, details,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const output = path.join(root, 'data');
  fs.mkdirSync(output, { recursive: true });
  const preview = makePreviewData();
  fs.writeFileSync(path.join(output, 'events.json'), JSON.stringify(preview));
  console.log(`Generated ${preview.events.length} clearly labelled sample event occurrences for GitHub Pages pre-release testing.`);
}
