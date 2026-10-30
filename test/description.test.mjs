import test from 'node:test';
import assert from 'node:assert/strict';
import { processDescription } from '../scripts/lib/description.mjs';

test('plain text becomes paragraphs with clickable links, emails and phones', () => {
  const r = processDescription('Everyone welcome.\n\nSee https://example.org/page?a=1&b=2.\nTel :020 8330 2817\nadmin@example.org (mailto:admin@example.org)');
  assert.match(r.html, /^<p>Everyone welcome\.<\/p><p>/);
  assert.match(r.html, /<a href="https:\/\/example\.org\/page\?a=1&amp;b=2" target="_blank" rel="noopener">/);
  assert.match(r.html, /<a href="tel:\+442083302817"[^>]*>020 8330 2817<\/a>/);
  assert.match(r.html, /<a href="mailto:admin@example\.org"[^>]*>admin@example\.org<\/a><\/p>$/);
  assert.doesNotMatch(r.html, /mailto:admin@example\.org\)/);
  assert.deepEqual(r.contacts.emails, ['admin@example.org']);
  assert.deepEqual(r.contacts.phones, [{ number: '020 8330 2817', href: 'tel:+442083302817' }]);
});

test('Google Calendar HTML is kept but sanitised', () => {
  const r = processDescription('<b>Bold</b> <i>it</i><ul><li>One</li></ul><a href="javascript:alert(1)">bad</a><script>x()</script><img src=x onerror=alert(1)><span style="color:red">red</span>');
  assert.match(r.html, /<b>Bold<\/b> <i>it<\/i><ul><li>One<\/li><\/ul>/);
  assert.doesNotMatch(r.html, /javascript|script|onerror|<img|style=/);
  assert.match(r.html, /<span>red<\/span>/);
});

test('existing links are not double-linked', () => {
  const r = processDescription('<a href="https://example.org">https://example.org</a> and mail@example.org');
  assert.equal((r.html.match(/<a /g) || []).length, 2);
});

test('mis-decoded non-breaking spaces are removed', () => {
  const r = processDescription('Contact Jo Hill via Parish Office\u00c2\u00a0\nThanks');
  assert.doesNotMatch(r.html, /\u00c2/);
});

test('empty descriptions', () => {
  assert.deepEqual(processDescription(''), { html: '', text: '', summary: '', contacts: { emails: [], phones: [] } });
  assert.equal(processDescription(null).html, '');
});

test('summary is shortened at a word boundary', () => {
  const r = processDescription('word '.repeat(100));
  assert.ok(r.summary.length <= 181);
  assert.ok(r.summary.endsWith('word…'));
});
