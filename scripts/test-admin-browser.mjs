import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  await page.waitForFunction(() => /^[0-9]+m [0-9]{2}s$/.test(document.getElementById('refresh-countdown')?.textContent || ''));
  assert.match(await page.locator('#refresh-time').textContent(), /^[0-9]{2}:[0-9]{2}$/);
  assert.ok((await page.locator('#refresh-history').getAttribute('href')).includes('/actions/workflows/deploy.yml'));
  await page.getByText('Demonstration · read-only').waitFor({ timeout: 15000 });
  console.log('Loaded demo:', url);
  fs.mkdirSync('ui-review', {recursive:true});
  assert.equal(await page.locator('.workspace-grid').count(),1,'Events workspace must render');
  assert.ok(await page.locator('#agendaList .agenda-item').count() >= 1,'Agenda must include today's demo events');
  await page.screenshot({path:'ui-review/event-manager-calendar-desktop.png',fullPage:true});
  await page.locator('#eventSearch').fill('Sunday Eucharist');
  assert.equal(await page.locator('#agendaList .agenda-item').count(),1,'Search should filter agenda');
  assert.equal(await page.locator('.cal-day .event-pill').count(),1,'Search should filter calendar');
  await page.locator('#categoryFilter').selectOption('music');
  assert.equal(await page.locator('#agendaList .agenda-item').count(),0,'Category and search compose');
  assert.match(await page.locator('#agendaList').textContent(),/No matching events/);
  await page.locator('#clearFilters').click();
  assert.equal(await page.locator('#eventSearch').inputValue(),'');
  assert.equal(await page.locator('#categoryFilter').inputValue(),'');
  assert.ok(await page.locator('#agendaList .agenda-item').count() >= 1,'Clear restores agenda');

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
  assert.equal(await page.locator('.form-group-heading').count(),4,'Editor fields must be grouped');
  assert.ok(await page.locator('.editor-footer #save').count()===1,'Save must be accessible in footer');
  await page.screenshot({path:'ui-review/event-manager-editor-desktop.png'});
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
  assert.equal(await page.locator('#uploadSelected').isVisible(),true,'selected file has clear summary');
  assert.equal(await page.locator('#uploadSelectedName').textContent(),'draft-header.png');
  assert.equal(await page.locator('.crop-pad button').count(),9);
  await page.locator('.crop-pad button[data-focus="50,100"]').click();
  assert.equal(await page.locator('#previewHeaderImage').evaluate(el=>el.style.objectPosition),'50% 100%');
  await page.locator('.crop-pad button[data-focus="0,0"]').click();
  assert.equal(await page.locator('#previewHeaderImage').evaluate(el=>el.style.objectPosition),'0% 0%');
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
  assert.equal(await page.locator('#appConfirmDialog').isVisible(),true,'discard confirmation is rendered on-site');
  await page.locator('#appConfirmCancel').click();
  assert.equal(await page.locator('#editorDialog').evaluate(el => el.open),true,'cancelling keeps the editor open');
  await page.locator('#closeEditor').click();
  await page.locator('#appConfirmYes').click();
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
  await page.locator('#description').fill('Read details');
  await page.locator('[data-format="createLink"]').click();
  assert.equal(await page.locator('#appConfirmDialog').isVisible(),true,'link entry uses an in-app dialog');
  await page.locator('#appConfirmInput').fill('javascript:alert(1)');
  await page.locator('#appConfirmYes').click();
  assert.match(await page.locator('#appConfirmInputError').textContent(),/valid https:/);
  assert.equal(await page.locator('#appConfirmDialog').isVisible(),true,'invalid URL remains in the in-app prompt');
  await page.locator('#appConfirmCancel').click();
  assert.equal(await page.locator('#appConfirmDialog').isVisible(),false);
  await page.locator('#closeEditor').click();
  await page.locator('#appConfirmYes').click();
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
  await page.locator('#appConfirmYes').click();

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
      isInstance:true,headerImageId:'test-attachment-2026',attachments:[{
        fileId:'test-attachment-2026',mimeType:'image/png',
        title:'907e3e0a-c45c-f6f1-69a5-c28361091cfe.png',
        fileUrl:'https://drive.google.com/file/d/test-attachment-2026/view',
      }],
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
          ...(scope==='series' ? {
            id:'private-recurring-master',selectedOccurrenceDate:date,
            seriesStartDate:'2026-01-05',
          } : {}),
        }),
        editorRemoveAttachment: (id,scope,revision,fileId) => {
          mockedEvent.attachments=mockedEvent.attachments.filter(a => a.fileId!==fileId);
          mockedEvent.headerImageId='none';
          success({removed:true,driveFileRetained:true,eventId:id,revision:'next-etag'});
        },
      };
    }
    window.google={script:{run:runner(()=>{},()=>{})}};
  });
  await linkedPage.route('https://drive.google.com/thumbnail**', route => route.fulfill({
    status:200,contentType:'image/png',body:tinyPng,
  }));
  await linkedPage.goto(url);
  await linkedPage.getByText('Google Calendar · editor').waitFor({timeout:15000});
  await linkedPage.locator('.event-pill').first().click();
  await linkedPage.locator('#scopeBox .scope-option').first().waitFor();
  assert.equal(await linkedPage.locator('#scopeBox .scope-option').count(),3);
  assert.equal(await linkedPage.locator('#visibility').inputValue(),'private');
  // Real Drive attachment UI: thumbnails, compact selection and working
  // pointer drag on a previously uploaded header (not just draft photos).
  await linkedPage.locator('#attachmentList .attachment-item').first().waitFor();
  assert.equal(await linkedPage.locator('#attachmentList .attachment-item').count(),1);
  assert.equal(await linkedPage.locator('.attachment-meta strong').textContent(),'Image 1');
  assert.equal(await linkedPage.locator('.attachment-thumb').count(),1);
  assert.equal(await linkedPage.locator('.attachment-choice input').isChecked(),true);
  assert.equal(await linkedPage.locator('#attachmentList button.attachment-remove').count(),1);
  assert.equal(await linkedPage.locator('.attachment-no-header').isVisible(),true);
  await linkedPage.locator('#previewHeaderImage').evaluate(img => img.decode());
  await linkedPage.locator('#art').scrollIntoViewIfNeeded();
  assert.equal(await linkedPage.locator('#previewHeaderImage').getAttribute('draggable'),'false');
  const existingBefore = await linkedPage.locator('#previewHeaderImage').evaluate(img=>img.style.objectPosition);
  const frameRect = await linkedPage.locator('#art').boundingBox();
  await linkedPage.mouse.move(frameRect.x+frameRect.width/2,frameRect.y+frameRect.height/2);
  await linkedPage.mouse.down();
  await linkedPage.mouse.move(frameRect.x+frameRect.width/2,frameRect.y+frameRect.height/2-80,{steps:8});
  await linkedPage.mouse.up();
  const existingAfter = await linkedPage.locator('#previewHeaderImage').evaluate(img=>img.style.objectPosition);
  assert.notEqual(existingAfter,existingBefore,'dragging an existing Drive thumbnail adjusts crop');
  await linkedPage.locator('#resetImageFocus').click();
  await linkedPage.locator('.attachment-no-header input').check();
  assert.equal(await linkedPage.locator('#previewHeaderImage').isVisible(),false);
  await linkedPage.locator('.attachment-choice input').check();
  assert.equal(await linkedPage.locator('#previewHeaderImage').isVisible(),true);

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
  await linkedPage.locator('#appConfirmDialog').waitFor();
  await linkedPage.locator('#appConfirmYes').click();
  await linkedPage.waitForFunction(() => {
    const select=document.getElementById('visibility');
    return select && !select.disabled && document.querySelector('input[name=scope][value=following]').checked;
  });
  assert.equal(await linkedPage.locator('#visibility').inputValue(),'private');
  await linkedPage.locator('#visibility').selectOption('public');
  assert.equal(await linkedPage.locator('#visibility').inputValue(),'public');
  await linkedPage.locator('input[name=scope][value=series]').check();
  await linkedPage.locator('#appConfirmDialog').waitFor();
  await linkedPage.locator('#appConfirmYes').click();
  await linkedPage.waitForFunction(() => {
    return document.querySelector('input[name=scope][value=series]').checked &&
      !document.getElementById('visibility').disabled &&
      document.getElementById('visibility').value==='private';
  });
  assert.match(await linkedPage.locator('#visibilityHint').textContent(), /every event in the series/);
  assert.equal(await linkedPage.locator('#startDate').inputValue(),
    await linkedPage.evaluate(() => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())),
    'the date clicked must stay visible when switching to All in series');
  assert.equal(await linkedPage.locator('#startDate').isDisabled(),true,
    'selected reference date is not editable in all-series scope');
  assert.match(await linkedPage.locator('#seriesDateHint').textContent(),/2026-01-05/);
  assert.equal(await linkedPage.locator('.attachment-remove').count(),1);
  await linkedPage.locator('.attachment-remove').first().click();
  assert.equal(await linkedPage.locator('#appConfirmDialog').isVisible(),true);
  assert.match(await linkedPage.locator('#appConfirmMessage').textContent(),/original stays in Google Drive/);
  await linkedPage.locator('#appConfirmCancel').click();
  assert.equal(await linkedPage.locator('#attachmentList .attachment-item').count(),1,'cancel keeps attachment');
  await linkedPage.locator('.attachment-remove').first().click();
  await linkedPage.locator('#appConfirmYes').click();
  await linkedPage.waitForFunction(() => document.querySelectorAll('#attachmentList .attachment-item').length === 0);
  assert.match(await linkedPage.locator('#appNoticeText').textContent(),/original file retained in Google Drive/i);
  await linkedPage.locator('#title').fill('');
  await linkedPage.locator('#save').click();
  assert.equal(await linkedPage.locator('#appNotice').isVisible(),true,'required-field errors appear within editor');
  assert.match(await linkedPage.locator('#appNoticeText').textContent(),/Enter an event title/);
  assert.equal(await linkedPage.locator('#title').getAttribute('aria-invalid'),'true');
  await linkedPage.locator('#title').fill('Private weekly meeting');
  await linkedPage.locator('#appNoticeClose').click();
  await linkedPage.locator('#uploadAttachment').setInputFiles({
    name:'testing.png',mimeType:'image/png',buffer:tinyPng,
  });
  await linkedPage.locator('#save').click();
  assert.equal(await linkedPage.locator('#appNotice').isVisible(),true,'an upload error is shown in-app');
  assert.equal(await linkedPage.locator('#appNotice').getAttribute('data-kind'),'error');
  assert.match(await linkedPage.locator('#appNoticeText').textContent(),/Drive upload folder is not configured/);
  await linkedPage.locator('#appNoticeClose').click();
  assert.equal(await linkedPage.locator('#appNotice').isVisible(),false,'error notification can be dismissed');
  await linkedPage.close();

  await page.setViewportSize({ width: 390, height: 780 });
  await page.locator('#newEvent').click();
  await assertModal('mobile New event');
  const dialog = await page.locator('#editorDialog').boundingBox();
  assert.ok(dialog.width < 390, 'mobile dialog must fit viewport');
  assert.ok(dialog.height <= 780, 'mobile dialog must not exceed viewport');
  assert.equal(await page.locator('.editor-footer #save').isVisible(),true,'Save action must remain visible on mobile');
  await page.screenshot({path:'ui-review/event-manager-editor-mobile.png'});
  assert.deepEqual(errors, [], 'browser must not report runtime errors');
  console.log('PASS: Editor workflow, aligned recurring scope choices, private visibility by scope, mobile modal');
} finally { await browser.close(); }
