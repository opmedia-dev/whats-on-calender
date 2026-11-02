import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 940 } });
  const errors = [];
  page.on('dialog', dialog => dialog.accept()); // Accept discard-confirmation during the close-flow smoke test.
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const url = pathToFileURL(path.resolve('site/admin-demo.html')).href;
  await page.goto(url);
  await page.getByText('Demonstration · read-only').waitFor({ timeout: 15000 });
  console.log('Loaded demo:', url);

  async function assertModal(label) {
    const modal = page.locator('#editorDialog');
    const opened = await modal.evaluate(el => el.open);
    if (!opened) {
      console.error('Modal failed for:', label);
      console.error('Status:', await page.locator('#status').textContent());
      console.error('Browser errors:', errors);
      await page.screenshot({ path: '/tmp/event-editor-failure.png', fullPage: true });
    }
    assert.equal(opened, true, label + ' must open the editor dialog');
    assert.equal(await modal.locator('#pvTitle').count(), 1, 'live preview should be inside modal');
    assert.equal(await page.locator('#save').isDisabled(), true, 'demo may not save events');
  }

  await page.locator('#newEvent').click();
  await assertModal('New event');
  assert.equal(await page.locator('#dialogTitle').textContent(), 'New event');
  // Reproduce the reported bug: choose an image for an unsaved new event,
  // discard it, then open another event. No image or file may cross over.
  const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64');
  await page.locator('#uploadAttachment').setInputFiles({
    name: 'draft-header.png', mimeType: 'image/png', buffer: tinyPng,
  });
  assert.equal(await page.locator('#uploadAttachment').evaluate(el => el.files.length), 1);
  const imgState = await page.locator('#previewHeaderImage').evaluate(el => ({
    hidden:el.hidden,src:el.getAttribute('src'),width:el.getBoundingClientRect().width,
    height:el.getBoundingClientRect().height,display:getComputedStyle(el).display,
    parent:el.parentElement.className,role:document.querySelector('#imageRole').value,
    upload:document.querySelector('#uploadAttachment').files[0]?.type,
  }));
  console.log('Draft header image preview:', JSON.stringify(imgState));
  assert.equal(await page.locator('#previewHeaderImage').isVisible(), true,
    'unsaved image should preview in the current draft');
  await page.locator('#imageRole').selectOption('gallery');
  assert.equal(await page.locator('#previewGallery').isVisible(), true,
    'gallery selection should not replace the header');
  await page.locator('#closeEditor').click();
  assert.equal(await page.locator('#editorDialog').evaluate(el => el.open), false);
  await page.locator('.event-pill').first().click();
  await assertModal('existing event after discarded draft image');
  assert.equal(await page.locator('#uploadAttachment').evaluate(el => el.files.length), 0,
    'discarded file input must never persist in a different event');
  assert.equal(await page.locator('#previewHeaderImage').isVisible(), false,
    'discarded header preview must never persist in another event');
  assert.equal(await page.locator('#previewGallery').isVisible(), false,
    'discarded gallery preview must never persist in another event');
  await page.locator('#closeEditor').click();
  await page.locator('#newEvent').click();
  await assertModal('New event');
  await page.locator('#title').fill('Test Parish Event');
  assert.equal(await page.locator('#pvTitle').textContent(), 'Test Parish Event');
  await page.locator('#closeEditor').click();
  assert.equal(await page.locator('#editorDialog').evaluate(el => el.open), false, 'close should dismiss modal');

  await page.locator('.date-btn').first().click();
  await assertModal('click calendar date');
  await page.locator('#closeEditor').click();

  await page.locator('.event-pill').first().click();
  await assertModal('click existing event');
  assert.equal(await page.locator('#dialogTitle').textContent(), 'Edit event');
  await page.locator('#repeat').selectOption('custom');
  assert.equal(await page.locator('#customRepeat').isVisible(), true, 'custom repeat should reveal controls');
  await page.locator('#repeatInterval').fill('2');
  await page.locator('#repeatEnds').selectOption('count');
  assert.equal(await page.locator('#repeatCountField').isVisible(), true, 'count end should show input');
  await page.locator('#closeEditor').click();

  await page.locator('#newEvent').click();
  await assertModal('reopening New event after editing');
  await page.locator('#resetChanges').click();
  await assertModal('Reset changes');
  assert.equal(await page.locator('#title').inputValue(), '');
  await page.locator('#closeEditor').click();

  await page.setViewportSize({ width: 390, height: 780 });
  await page.locator('#newEvent').click();
  await assertModal('mobile New event');
  const dialog = await page.locator('#editorDialog').boundingBox();
  assert.ok(dialog.width < 390, 'mobile dialog must fit viewport');
  assert.ok(dialog.height <= 780, 'mobile dialog must not exceed viewport');
  assert.deepEqual(errors, [], 'browser must not report runtime errors');
  console.log('PASS: New event, existing event, date, custom repeat, Reset, mobile modal');
} finally { await browser.close(); }
