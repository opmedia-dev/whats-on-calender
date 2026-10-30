// Cleans up Google Calendar event descriptions for publishing: Google stores
// either limited HTML (from the Calendar web editor) or plain text (from phones
// and other apps). Output is sanitised HTML with links, emails and phone numbers
// made clickable, plus extracted contact details and a short plain-text summary.
import sanitizeHtml from 'sanitize-html';

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/gi;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
// UK-style numbers: 020 8330 2817, 07700 900123, +44 20 8330 2817
const PHONE_RE = /(?<![\w+])(?:\+44\s?\(?0?\)?\s?|0)(?:\d[\s-]?){9,10}(?!\d)/g;

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function decodeEntities(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function fixText(s) {
  return s
    // UTF-8 non-breaking space mis-decoded as Latin-1 ("Â ").
    .replace(/\u00c2(?=[\u00a0 ]|$)/gm, '')
    .replace(/\u00a0/g, ' ')
    // Some apps append "(mailto:x@y)" / "<mailto:x@y>" after an email address.
    .replace(/\s*[(<]mailto:[^)>\s]+[)>]/gi, '')
    .replace(/\s*[(<](https?:\/\/[^)>\s]+)[)>]/gi, (m, url, offset, str) => (str.slice(0, offset).trimEnd().endsWith(url) ? '' : m));
}

function phoneHref(num) {
  const digits = num.replace(/[^\d+]/g, '');
  return `tel:${digits.startsWith('+') ? digits : digits.replace(/^0/, '+44')}`;
}

// Linkifies a run of already-escaped text.
function linkifyText(text) {
  const tokens = [];
  const collect = (re, type) => {
    for (const m of text.matchAll(re)) tokens.push({ start: m.index, end: m.index + m[0].length, value: m[0], type });
  };
  collect(URL_RE, 'url');
  collect(EMAIL_RE, 'email');
  collect(PHONE_RE, 'phone');
  tokens.sort((a, b) => a.start - b.start || b.end - a.end);
  let out = '';
  let pos = 0;
  for (const t of tokens) {
    if (t.start < pos) continue;
    out += text.slice(pos, t.start);
    const value = t.value.trim();
    const trailing = t.value.slice(value.length);
    const href = t.type === 'url' ? decodeEntities(value) : t.type === 'email' ? `mailto:${value}` : phoneHref(value);
    out += `<a href="${escapeHtml(href)}">${value}</a>${trailing}`;
    pos = t.end;
  }
  return out + text.slice(pos);
}

function linkifyHtml(html) {
  let depth = 0;
  return html.split(/(<[^>]+>)/).map((part) => {
    if (part.startsWith('<')) {
      if (/^<a[\s>]/i.test(part)) depth++;
      else if (/^<\/a>/i.test(part)) depth = Math.max(0, depth - 1);
      return part;
    }
    return depth ? part : linkifyText(part);
  }).join('');
}

const SANITIZE = {
  allowedTags: ['b', 'strong', 'i', 'em', 'u', 's', 'br', 'p', 'div', 'span', 'ul', 'ol', 'li', 'a',
    'h1', 'h2', 'h3', 'h4', 'blockquote', 'hr', 'sub', 'sup'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: {
    a: (tagName, attribs) => ({ tagName, attribs: { href: attribs.href || '', target: '_blank', rel: 'noopener' } }),
    // Google wraps headings etc. in spans with inline styles; flatten them.
    span: () => ({ tagName: 'span', attribs: {} }),
  },
  exclusiveFilter: (frame) => frame.tag === 'a' && !frame.attribs.href,
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'title'],
};

export function htmlToText(html) {
  return decodeEntities(html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function extractContacts(text) {
  const emails = [...new Set((text.match(EMAIL_RE) || []).map((e) => e.toLowerCase()))];
  const phones = [...new Set((text.match(PHONE_RE) || []).map((p) => p.trim().replace(/\s+/g, ' ')))]
    .map((number) => ({ number, href: phoneHref(number) }));
  return { emails, phones };
}

function summarise(text, max = 180) {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

export function processDescription(raw) {
  if (!raw || !raw.trim()) return { html: '', text: '', summary: '', contacts: { emails: [], phones: [] } };
  const fixed = fixText(raw.replace(/\r\n?/g, '\n'));
  const isHtml = /<\/?(b|i|u|br|p|div|span|a|ul|ol|li|strong|em|h\d)\b[^>]*>/i.test(fixed);
  let html;
  if (isHtml) {
    // The Calendar editor keeps typed newlines as text as well as <br>s.
    html = sanitizeHtml(fixed.replace(/\n/g, '<br>'), SANITIZE);
  } else {
    html = escapeHtml(fixed.trim()).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  }
  html = sanitizeHtml(linkifyHtml(html), SANITIZE)
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
    .replace(/^(\s*<br\s*\/?>)+|(<br\s*\/?>\s*)+$/gi, '')
    .replace(/<p>\s*<\/p>/g, '');
  const text = htmlToText(html);
  return { html, text, summary: summarise(text), contacts: extractContacts(text) };
}
