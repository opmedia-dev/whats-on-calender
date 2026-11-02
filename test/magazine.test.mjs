import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { loadMagazineIssue, magazineDestination } from '../site/assets/magazine.js';

const preview = 'https://opmedia-dev.github.io/flipbook/preview.html';
const sampleIssues = [
  { id: 'november', title: 'Old Malden News — November', cover: 'covers/november.jpg', file: 'pdfs/november.pdf' },
  { id: 'october', title: 'Old Malden News — October', cover: 'covers/october.jpg', file: 'pdfs/october.pdf' },
];

function responseFor(issues = sampleIssues) {
  const calls = [];
  const fetcher = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => ({ issues }) };
  };
  return { fetcher, calls };
}

test('latest magazine cover loads from the flipbook GitHub Pages issue list', async () => {
  const { fetcher, calls } = responseFor();
  const issue = await loadMagazineIssue(preview, fetcher);
  assert.equal(calls[0].url, 'https://opmedia-dev.github.io/flipbook/issues.json');
  assert.equal(calls[0].opts.cache, 'no-cache');
  assert.equal(issue.title, sampleIssues[0].title);
  assert.equal(issue.cover, 'https://opmedia-dev.github.io/flipbook/covers/november.jpg');
  assert.equal(issue.preview, preview);
});

test('custom preview id selects that issue rather than the newest', async () => {
  const { fetcher } = responseFor();
  const issue = await loadMagazineIssue(preview + '?id=october', fetcher);
  assert.equal(issue.title, sampleIssues[1].title);
  assert.equal(issue.cover, 'https://opmedia-dev.github.io/flipbook/covers/october.jpg');
});

test('an issue without a generated cover can still link to the reader', async () => {
  const { fetcher } = responseFor([{ id: 'latest', title: 'Special Issue', cover: null }]);
  const issue = await loadMagazineIssue(preview, fetcher);
  assert.equal(issue.cover, null);
  assert.equal(issue.title, 'Special Issue');
});

test('unavailable issue metadata does not silently select an unrelated issue', async () => {
  const { fetcher } = responseFor();
  await assert.rejects(() => loadMagazineIssue(preview + '?id=missing', fetcher), /not found/);
});

test('unsupported preview protocols are rejected', async () => {
  await assert.rejects(() => loadMagazineIssue('http://example.test/preview.html', async () => {}), /HTTPS/);
});

test('banner uses magazine tile rather than oversized nested flipbook iframe', () => {
  const html = fs.readFileSync(path.join(import.meta.dirname, '../site/banner.html'), 'utf8');
  const css = fs.readFileSync(path.join(import.meta.dirname, '../site/assets/wo.css'), 'utf8');
  assert.match(html, /wo-magazine-card/);
  assert.match(html, /loadMagazineIssue/);
  assert.match(html, /target: '_blank'/);
  assert.doesNotMatch(html, /h\('iframe'/);
  assert.match(css, /\.wo-magazine-cover\s*\{[^}]*aspect-ratio:/);
});

test('configured parish archive overrides GitHub Pages magazine card destination', () => {
 const source = 'https://opmedia-dev.github.io/flipbook/preview.html?compact=1&tools=none';
 const archive = 'https://www.stjohnsoldmalden.org.uk/magazine-archive?from=homepage';
 const destination=magazineDestination(source,archive,'7a1424');
 assert.deepEqual(destination,{href:archive,usesArchive:true});
 const fallback=magazineDestination(source,'','7a1424');
 assert.equal(fallback.usesArchive,false);
 assert.equal(new URL(fallback.href).pathname,'/flipbook/preview.html');
 assert.equal(new URL(fallback.href).searchParams.has('tools'),false);
 assert.equal(new URL(fallback.href).searchParams.get('accent'),'7a1424');
});

test('reject unsafe or malformed archive destinations and preserve hosted reader fallback', () => {
 for(const invalid of ['javascript:alert(1)','http://example.com/archive','/relative-link','not a url']) {
   const destination=magazineDestination(preview, invalid);
   assert.equal(destination.usesArchive,false);
   assert.equal(destination.href,preview);
 }
 const banner=fs.readFileSync(path.join(import.meta.dirname,'../site/banner.html'),'utf8');
 assert.match(banner,/const destination = magazineDestination\(/);
 assert.match(banner,/href: destination\.href/);
 assert.match(banner,/destination\.usesArchive \? 'View magazine archive' : 'Read magazine'/);
});

test('external scheduled dispatch preserves change-detection rather than forced rebuilds', () => {
 const workflow=fs.readFileSync(path.join(import.meta.dirname,'../.github/workflows/deploy.yml'),'utf8');
 assert.match(workflow,/options: \[manual, external-cron\]/);
 assert.match(workflow,/SOURCE: \$\{\{ inputs\.source \|\| '' \}\}/);
 assert.match(workflow,/if \[ "\$EVENT" = 'schedule' \] \|\| \[ "\$SOURCE" = 'external-cron' \]; then/);
 assert.match(workflow,/github\.event_name == 'schedule' \|\| inputs\.source == 'external-cron'/);
 assert.match(workflow,/cron: '\*\/15 \* \* \* \*'/);
});
