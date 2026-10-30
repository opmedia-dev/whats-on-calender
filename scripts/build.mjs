// Builds the static site into _site/: the embed pages in site/ plus the synced
// calendar data in data/ (written by sync-calendar.mjs).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, '_site');
const data = path.join(root, 'data');

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'site'), out, { recursive: true });
if (fs.existsSync(path.join(data, 'events.json'))) {
  fs.cpSync(data, out, { recursive: true });
} else {
  console.warn('data/events.json not found: run scripts/sync-calendar.mjs first. Publishing an empty calendar.');
  fs.writeFileSync(path.join(out, 'events.json'), JSON.stringify({ generated: new Date().toISOString(), timeZone: 'Europe/London', events: [], details: {} }));
}
fs.writeFileSync(path.join(out, '.nojekyll'), '');
const { events = [] } = JSON.parse(fs.readFileSync(path.join(out, 'events.json'), 'utf8'));
console.log(`Built _site/ with ${events.length} event(s)`);
