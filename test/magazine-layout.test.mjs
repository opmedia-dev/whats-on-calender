import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const css = fs.readFileSync(path.join(import.meta.dirname, '../site/assets/wo.css'), 'utf8');

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
  assert.ok(match, 'Missing style rule: ' + selector);
  return match[1];
}

test('magazine card cover area has a constrained event-card aspect ratio', () => {
  const cover = rule('.wo-magazine-cover');
  assert.match(cover, /aspect-ratio:\s*var\(--wo-ratio,\s*16\s*\/\s*10\)/);
  assert.match(cover, /position:\s*relative/);
  assert.match(cover, /overflow:\s*hidden/);
  assert.match(cover, /width:\s*100%/);
  assert.match(cover, /flex:\s*0\s+0\s+auto/);
});

test('portrait cover image cannot contribute its intrinsic width or height to card layout', () => {
  const image = rule('.wo-magazine-cover img');
  assert.match(image, /position:\s*absolute/);
  assert.match(image, /width:\s*calc\(100%\s*-\s*16px\)/);
  assert.match(image, /height:\s*calc\(100%\s*-\s*16px\)/);
  assert.match(image, /object-fit:\s*contain/);
  assert.doesNotMatch(image, /width:\s*auto/);
});

test('long magazine issue titles cannot expand the card indefinitely', () => {
  const title = rule('.wo-magazine-title');
  assert.match(title, /-webkit-line-clamp:\s*2/);
  assert.match(title, /overflow:\s*hidden/);
});
