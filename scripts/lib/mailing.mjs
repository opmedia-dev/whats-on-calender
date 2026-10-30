// Parses the public Mailchimp sent-campaign RSS archive into a safe, compact
// listing. Full HTML stays with Mailchimp; our site links to each sent campaign.
const decodeEntities = (input = '') => String(input)
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (_m, code) => {
    const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
  })
  .replace(/&(amp|lt|gt|quot|apos|nbsp|ndash|mdash|rsquo|lsquo);/gi, (_m, name) =>
    ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘' })[name.toLowerCase()]);

const xmlTag = (block, name) => {
  const escaped = name.replace(/:/g, ':');
  const match = block.match(new RegExp('<' + escaped + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + escaped + '\\s*>', 'i'));
  return match ? decodeEntities(match[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim()) : '';
};
const plain = (value) => decodeEntities(value.replace(/<\/?(?:style|script)\b[^>]*>[\s\S]*?<\/\s*(?:style|script)>/gi, '')
  .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());

export function parseMailchimpRss(xml, { limit = 24 } = {}) {
  if (!/<(?:rss|rdf:RDF)\b/i.test(xml) || !/<item\b/i.test(xml)) {
    // A valid feed may have zero messages, but it must still look like RSS.
    if (!/<(?:rss|rdf:RDF)\b/i.test(xml)) throw new Error('Not a valid RSS feed');
  }
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  const ids = new Set();
  const mailings = [];
  for (const [, block] of items) {
    const url = xmlTag(block, 'link').trim();
    let valid;
    try {
      valid = new URL(url);
      if (valid.protocol !== 'https:' && valid.protocol !== 'http:') continue;
    } catch { continue; }
    const published = xmlTag(block, 'pubDate') || xmlTag(block, 'dc:date') || xmlTag(block, 'published');
    const when = new Date(published);
    if (!Number.isFinite(when.getTime())) continue;
    const title = plain(xmlTag(block, 'title')) || 'Parish weekly mailing';
    const guid = plain(xmlTag(block, 'guid')) || valid.href;
    if (ids.has(guid)) continue;
    ids.add(guid);
    const html = xmlTag(block, 'description') || xmlTag(block, 'content:encoded');
    mailings.push({
      id: guid.slice(0, 500),
      title: title.slice(0, 180),
      url: valid.href,
      published: when.toISOString(),
      summary: plain(html).slice(0, 260),
    });
  }
  return mailings.sort((a, b) => b.published.localeCompare(a.published)).slice(0, limit);
}

export function sampleMailings(now = new Date()) {
  const friday = new Date(now);
  friday.setUTCDate(friday.getUTCDate() - (friday.getUTCDay() + 2) % 7);
  friday.setUTCHours(9, 0, 0, 0);
  return {
    preview: true,
    generated: now.toISOString(),
    mailings: [
      {
        id: 'sample-weekly-mailing',
        title: "Parish Weekly Mailing — sample issue",
        url: 'https://mailchimp.com/',
        published: friday.toISOString(),
        summary: 'Demonstration weekly parish news, services and announcements. This is not a real mailing.',
      },
    ],
  };
}
