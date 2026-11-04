import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { eventSlots } from '../site/assets/banner-config.js';
const root=path.resolve(import.meta.dirname,'..');
const source=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const backend=source('admin/apps-script/Code.gs');
const editor=source('admin/apps-script/Index.html');
const banner=source('site/banner.html');
const sync=source('scripts/sync-calendar.mjs');
const timetable=source('site/timetable.html');

test('monthly notice uses one fixed banner slot and only one rotating event when publications enabled',()=>{
 assert.equal(eventSlots({monthly:true,mailing:true,magazine:true,max:3}),1);
 assert.equal(eventSlots({monthly:true,mailing:true,magazine:false,max:3}),2);
 assert.equal(eventSlots({monthly:true,mailing:false,magazine:false,max:3}),3);
 assert.match(banner,/banner\.insertBefore\(holder, banner\.firstChild\)/);
 assert.match(banner,/monthlyNotices\[currentMonth\]/);
 assert.match(banner,/wo-banner-monthly/);
 assert.match(banner,/mimeType === 'application\/pdf'/);
 assert.match(source('site/assets/wo.css'),/\.wo-banner\.has-monthly\.has-mailing\.has-side \.wo-banner-main \{ grid-column:span 1; \}/);
});
test('monthly poster is published separately and excluded from ordinary public calendar events',()=>{
 assert.match(sync,/woMonthlyNotice === 'true'/);
 assert.match(sync,/monthlyNotices\[month\] = candidate/);
 assert.match(sync,/monthlyNotices,\s*details,/);
 assert.match(sync,/if \(monthlyMarker\) \{/);
 assert.match(sync,/continue;\s*\}\s*const allDay/);
 assert.match(sync,/e\.start\?\.date === month \+ '-01'/);
 assert.match(sync,/imageSource\.mimeType|mimeType: imageSource\.mimeType/);
});
test('editor enforces monthly notice date and format, keeping public visibility',()=>{
 const env=vm.createContext({Utilities:{formatDate:(date,zone,format)=>new Date(date).toISOString().slice(0,10)}});
 vm.runInContext(backend,env);
 const form={title:"What's On this Month",category:'general',startDate:'2026-11-01',endDate:'2026-11-01',
  startTime:'09:00',endTime:'10:00',allDay:true,repeat:'none',monthlyNotice:true,featured:true,visibility:'public'};
 const normal=env.normalise_(form);
 assert.equal(normal.body.extendedProperties.shared.woMonthlyNotice,'true');
 assert.equal(normal.body.extendedProperties.shared.woFeatured,'false');
 assert.equal(normal.body.start.date,'2026-11-01');
 assert.throws(()=>env.normalise_({...form,startDate:'2026-11-02',endDate:'2026-11-02'}),/first day/);
 assert.throws(()=>env.normalise_({...form,visibility:'private'}),/publicly visible/);
 assert.throws(()=>env.normalise_({...form,repeat:'weekly'}),/non-repeating/);
 assert.match(editor,/id="newMonthly"/);
 assert.match(editor,/id="monthlyNotice"/);
 assert.match(editor,/image\/png,application\/pdf/);
 assert.match(backend,/const EDITOR_UPLOAD_FOLDER_ID = '[A-Za-z0-9_-]+';/);
});
test('weekly compact timetable exposes full-calendar button within the fixed hero',()=>{
 assert.match(timetable,/const more = param\('moreLink'\) \|\| new URL\('calendar\.html'/);
 assert.doesNotMatch(timetable,/!flag\('compact', true\) && more &&/);
 assert.match(source('site/assets/wo.css'),/\.wo-hero-compact \.wo-tt-more/);
});
