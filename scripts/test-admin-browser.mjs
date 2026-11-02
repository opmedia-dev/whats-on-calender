import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

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
  const tinyPng = await sharp({create:{width:90,height:240,channels:3,background:'#a66d52'}}).png().toBuffer();
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
  assert.equal(await page.locator('#imageFocusControls').isVisible(),true);
  await page.locator('#imageFocusY').fill('80');
  assert.equal(await page.locator('#previewHeaderImage').evaluate(el=>el.style.objectPosition),'50% 80%');
  await page.locator('#imageFocusX').fill('25');
  assert.equal(await page.locator('#previewHeaderImage').evaluate(el=>el.style.objectPosition),'25% 80%');
  await page.locator('#resetImageFocus').click();
  assert.equal(await page.locator('#previewHeaderImage').evaluate(el=>el.style.objectPosition),'50% 50%');
  const rect = await page.locator('#previewHeaderImage').boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2 + 30, {steps:5});
  await page.mouse.up();
  assert.notEqual(await page.locator('#previewHeaderImage').evaluate(el=>el.style.objectPosition),'50% 50%',
    'dragging a portrait image changes its crop position');
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

  // Drive the real scope-change handlers with a simulated Apps Script backend.
  // The read-only demo intentionally closes its functions in an IIFE.
  const linkedPage = await browser.newPage({viewport:{width:1400,height:940}});
  linkedPage.on('pageerror', error => errors.push(error.stack || error.message));
  linkedPage.on('dialog', dialog => dialog.accept());
  await linkedPage.addInitScript(() => {
    const now = new Date();
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',
    }).format(now);
    const eventId='private-recurring-instance';
    const mockedEvent={
      id:eventId,selectedId:eventId,seriesId:'private-recurring-master',
      title:'Private weekly meeting',category:'general',categorySource:'selected',
      startDate:date,endDate:date,startTime:'10:00',endTime:'11:00',
      allDay:false,description:'Private meeting',location:'Hall',repeat:'weekly',
      featured:false,visibility:'private',revision:'etag',isRecurring:true,
      isInstance:true,attachments:[],
    };
    const scopeEvents=[{
      id:eventId,seriesId:'private-recurring-master',isInstance:true,recurring:true,
      title:'Private weekly meeting',category:'general',
      start:date+'T10:00:00Z',end:date+'T11:00:00Z',visibility:'private',
      allDay:false,
    }];
    function runner(success, failure) {
      return {
        withSuccessHandler: fn => runner(fn,failure),
        withFailureHandler: fn => runner(success,fn),
        editorBootstrap: () => success({
          calendarName:'Parish',timeZone:'Europe/London',
          capabilities:{eventCrud:true,recurring:true,imageUpload:false},
        }),
        editorListEvents: () => success(scopeEvents),
        editorGetEvent: (id,scope) => success({
          ...mockedEvent,selectedId:id,editScope:scope,
          isInstance:scope!=='series',
        }),
      };
    }
    window.google={script:{run:runner(()=>{},()=>{})}};
  });
  await linkedPage.goto(url);
  await linkedPage.getByText('Google Calendar · editor').waitFor({timeout:15000});
  await linkedPage.locator('.event-pill').first().click();
  await linkedPage.locator('#scopeBox .scope-option').first().waitFor();
  assert.equal(await linkedPage.locator('#scopeBox .scope-option').count(),3);
  assert.equal(await linkedPage.locator('#visibility').inputValue(),'private');
  assert.equal(await linkedPage.locator('#visibility').isDisabled(),true);
  assert.match(await linkedPage.locator('#visibilityHint').textContent(), /Current privacy: Private/);
  const scopeGeometry = await linkedPage.locator('#scopeBox').evaluate(fieldset => ({
    height:fieldset.getBoundingClientRect().height,
    labels:[...fieldset.querySelectorAll('.scope-option')].map(label=>{
      const radio=label.querySelector('input').getBoundingClientRect();
      const span=label.querySelector('span').getBoundingClientRect();
      return {radioX:radio.x,radioMidY:radio.y+radio.height/2,
        radioWidth:radio.width,textX:span.x,textMidY:span.y+span.height/2,
        labelHeight:label.getBoundingClientRect().height};
    }),
  }));
  assert.ok(scopeGeometry.height < 240, 'scope choices must be compact: '+JSON.stringify(scopeGeometry));
  for (const choice of scopeGeometry.labels) {
    assert.ok(choice.radioWidth <= 20, 'radio input must not expand across the row');
    assert.ok(choice.radioX + choice.radioWidth <= choice.textX,
      'radio must appear immediately before its label');
    assert.ok(Math.abs(choice.radioMidY-choice.textMidY) < 6,
      'radio and label text must share a horizontal baseline');
    assert.ok(choice.labelHeight < 58, 'one choice must not fill multiple rows');
  }
  await linkedPage.locator('input[name=scope][value=following]').check();
  await linkedPage.waitForFunction(() => {
    const select=document.getElementById('visibility');
    return select && !select.disabled && document.querySelector('input[name=scope][value=following]').checked;
  });
  assert.equal(await linkedPage.locator('#visibility').inputValue(),'private');
  await linkedPage.locator('#visibility').selectOption('public');
  assert.equal(await linkedPage.locator('#visibility').inputValue(),'public');
  await linkedPage.locator('input[name=scope][value=series]').check();
  await linkedPage.waitForFunction(() => {
    return document.querySelector('input[name=scope][value=series]').checked &&
      !document.getElementById('visibility').disabled &&
      document.getElementById('visibility').value==='private';
  });
  assert.match(await linkedPage.locator('#visibilityHint').textContent(), /every event in the series/);
  await linkedPage.close();

  await page.setViewportSize({ width: 390, height: 780 });
  await page.locator('#newEvent').click();
  await assertModal('mobile New event');
  const dialog = await page.locator('#editorDialog').boundingBox();
  assert.ok(dialog.width < 390, 'mobile dialog must fit viewport');
  assert.ok(dialog.height <= 780, 'mobile dialog must not exceed viewport');
  assert.deepEqual(errors, [], 'browser must not report runtime errors');
  console.log('PASS: Editor workflow, aligned recurring scope choices, private visibility by scope, mobile modal');
} finally { await browser.close(); }
