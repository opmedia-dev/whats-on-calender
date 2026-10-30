import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(path.join(import.meta.dirname, '../site/index.html'), 'utf8');
const script = html.split('<script type="module">')[1]?.split('</script>')[0];

function generator() {
  assert.ok(script, 'embed generator inline script is present');
  const elements = new Map();
  const ids = [...html.matchAll(/<(?:input|select)\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  function el(id) {
    if (!elements.has(id)) {
      const handlers = new Map();
      elements.set(id, {
        id, value: '', checked: false, href: '', textContent: '', dataset: {},
        addEventListener(type, cb) {
          if (!handlers.has(type)) handlers.set(type, []);
          handlers.get(type).push(cb);
        },
        fire(type) { for (const fn of handlers.get(type) || []) fn(); },
      });
    }
    return elements.get(id);
  }
  const document = {
    getElementById: el,
    querySelectorAll: (selector) => selector === 'input,select' ? ids.map(el) : [],
  };
  vm.runInNewContext(script, {
    document, URL, URLSearchParams,
    location: { href: 'https://opmedia-dev.github.io/whats-on-calender/', origin: 'https://opmedia-dev.github.io' },
    fetch: () => Promise.reject(new Error('data not needed for generator tests')),
    navigator: { clipboard: {} },
  });
  return { el, bannerUrl: () => new URL(el('open-banner').href) };
}

test('a custom preview URL enables the magazine and is passed to the banner', () => {
  const g = generator();
  assert.equal(g.bannerUrl().searchParams.has('flipbook'), false);
  g.el('flipbookUrl').value = 'https://opmedia-dev.github.io/flipbook/preview.html';
  g.el('flipbookUrl').fire('input');
  assert.equal(g.el('flipbook').checked, true);
  assert.equal(g.bannerUrl().searchParams.get('flipbook'), '1');
  assert.equal(g.bannerUrl().searchParams.get('flipbookUrl'), g.el('flipbookUrl').value);
  assert.match(g.el('code-banner').value, /flipbook%3D1|flipbook=1/);
});

test('a magazine archive URL also enables the column and controls the archive link', () => {
  const g = generator();
  g.el('flipbookLink').value = 'https://opmedia-dev.github.io/flipbook/library.html';
  g.el('flipbookLink').fire('input');
  assert.equal(g.el('flipbook').checked, true);
  assert.equal(g.bannerUrl().searchParams.get('flipbookLink'), g.el('flipbookLink').value);
});

test('manual enablement uses the default magazine preview URL', () => {
  const g = generator();
  g.el('flipbook').checked = true;
  g.el('flipbook').fire('change');
  assert.equal(g.bannerUrl().searchParams.get('flipbook'), '1');
  assert.equal(g.bannerUrl().searchParams.has('flipbookUrl'), false);
  assert.match(g.el('flipbookHelp').textContent, /latest issue/);
});

test('manual disabling is respected even if a custom URL remains filled in', () => {
  const g = generator();
  g.el('flipbookUrl').value = 'https://opmedia-dev.github.io/flipbook/preview.html';
  g.el('flipbookUrl').fire('input');
  g.el('flipbook').checked = false;
  g.el('flipbook').fire('change');
  assert.equal(g.bannerUrl().searchParams.has('flipbook'), false);
  assert.match(g.el('flipbookHelp').textContent, /disabled/);
});
