// Keep weekly Mailchimp campaigns independent of Duda's blog. The public RSS
// URL is a GitHub Actions *variable*, not a secret. If not configured, publish
// explicitly marked sample mailings for pre-rollout layout testing.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseMailchimpRss, sampleMailings } from './lib/mailing.mjs';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(root, 'data/mailings.json');
const siteUrl = process.env.SITE_URL || '';
const source = (process.env.MAILCHIMP_RSS_URL || '').trim();
let data;
if (!source) {
  data = sampleMailings();
  console.warn('MAILCHIMP_RSS_URL is unset: publishing clearly labelled sample mailings.');
} else {
  const url = new URL(source);
  if (url.protocol !== 'https:') throw new Error('MAILCHIMP_RSS_URL must use HTTPS');
  const response = await fetch(url, { headers: { Accept: 'application/rss+xml, application/xml, text/xml;q=0.9' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Mailchimp RSS feed returned HTTP ${response.status}`);
  const xml = await response.text();
  const mailings = parseMailchimpRss(xml);
  if (!mailings.length) throw new Error('Mailchimp RSS feed contained no usable sent campaigns; refusing to overwrite existing mailings.');
  data = { preview: false, generated: new Date().toISOString(), mailings };
}

const fingerprint = crypto.createHash('sha256').update(JSON.stringify({preview: data.preview, mailings: data.mailings})).digest('hex');
data.fingerprint = fingerprint;
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(data, null, 2));
let changed = true;
if (siteUrl && process.env.FORCE !== 'true') {
  try {
    const response = await fetch(new URL('mailings.json', siteUrl.endsWith('/') ? siteUrl : siteUrl + '/'), { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (response.ok && (await response.json()).fingerprint === fingerprint) changed = false;
  } catch { /* First deployment or temporary connection issue: publish safely. */ }
}
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}
console.log(`Mailings: ${data.mailings.length} ${data.preview ? 'sample' : 'RSS'} issue(s); changed=${changed}`);
