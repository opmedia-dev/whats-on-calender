import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { eventSlots, currentAndNextMonths, chronologicalBannerItems } from '../site/assets/banner-config.js';
const root=path.resolve(import.meta.dirname,'..');
const source=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const backend=source('admin/apps-script/Code.gs');
const editor=source('admin/apps-script/Index.html');
const banner=source('site/banner.html');
const sync=source('scripts/sync-calendar.mjs');
const timetable=source('site/timetable.html');

test('both monthly posters rotate with events without stealing a fixed banner column',()=>{
 assert.equal(eventSlots({mailing:true,magazine:true,max:3}),2);
 assert.equal(eventSlots({mailing:true,magazine:false,max:3}),3);
 assert.equal(eventSlots({mailing:false,magazine:false,max:3}),3);
 assert.match(banner,/chronologicalBannerItems\(upcoming, monthlyNotices, \[currentMonth, nextMonth\]\)/);
 assert.match(banner,/item\.type === 'monthly'/);
 assert.match(banner,/renderMonthlyCard\(item\)/);
 assert.match(banner,/monthly\.mimeType|notice\.mimeType === 'application\/pdf'/);
 assert.doesNotMatch(banner,/banner\.insertBefore\(holder, banner\.firstChild\)/);
 assert.doesNotMatch(banner,/wo-banner-monthly/);
 assert.match(source('site/assets/wo.css'),/\.wo-monthly-cover img/);
});
test('parish-local month transition includes December and January over New Year',()=>{
 assert.deepEqual(currentAndNextMonths(new Date('2026-11-04T14:00:00Z')),['2026-11','2026-12']);
 assert.deepEqual(currentAndNextMonths(new Date('2026-12-31T23:30:00Z')),['2026-12','2027-01']);
 assert.deepEqual(currentAndNextMonths(new Date('2026-03-31T23:30:00Z')),['2026-04','2026-05']);
});
test('a poster precedes every featured event in its month, regardless of feed order',()=>{
 const event=(id,month,date)=>({id,title:id,startKey:month+'-'+date.slice(8,10),
   startDate:new Date(date)});
 const events=[
  event('dec-two','2026-12','2026-12-20T16:00:00Z'),
  event('nov-two','2026-11','2026-11-18T12:00:00Z'),
  event('jan-event','2027-01','2027-01-06T09:00:00Z'),
  event('nov-one','2026-11','2026-11-10T09:00:00Z'),
  event('dec-one','2026-12','2026-12-03T09:00:00Z'),
 ];
 const poster=(month)=>({month,image:{src:'poster-'+month+'.webp'},
  file:'file-'+month+'.pdf',mimeType:'application/pdf'});
 const notices={'2026-11':poster('2026-11'),'2026-12':poster('2026-12'),'2027-01':poster('2027-01')};
 const items=chronologicalBannerItems(events,notices,['2026-11','2026-12']);
 assert.deepEqual(items.map(item=>item.type==='monthly'?'poster-'+item.month:item.event.id),
   ['poster-2026-11','nov-one','nov-two','poster-2026-12','dec-one','dec-two','jan-event']);
 assert.equal(items.filter(item=>item.type==='monthly').length,2);
 assert.deepEqual(events.map(item=>item.id),['dec-two','nov-two','jan-event','nov-one','dec-one'],
   'sorting must not mutate source events');
});
test('available posters display even when there are no featured events in that month',()=>{
 const notices={'2026-11':{image:{src:'a.webp'},file:'a.pdf'},
  '2026-12':{image:{src:'b.webp'},file:'b.pdf'}};
 assert.deepEqual(chronologicalBannerItems([],notices,['2026-11','2026-12']).map(item=>item.month),
   ['2026-11','2026-12']);
 assert.deepEqual(chronologicalBannerItems([],{'2026-12':notices['2026-12']},
   ['2026-11','2026-12']).map(item=>item.month),['2026-12']);
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
 assert.match(editor,/id="monthlyDialog"/);
 assert.match(editor,/id="monthlyThisMonth"/);
 assert.match(editor,/id="monthlyNextMonth"/);
 assert.match(editor,/\$\('monthlyMonth'\)\.value=monthlyCurrentNext\(\)\[0\]/,
   'monthly manager should open on the real UK month, not the Events calendar view');
 assert.match(editor,/id="monthlyForm"/);
 assert.match(editor,/id="monthlyFile"/);
 assert.match(editor,/id="monthlyPreviewImage"/);
 assert.doesNotMatch(editor,/id="monthlyNotice"/);
 assert.match(editor,/await call\('editorSaveMonthlyPoster',form\)/);
 assert.match(editor,/image\/png,application\/pdf/);
 assert.match(backend,/const EDITOR_UPLOAD_FOLDER_ID = '[A-Za-z0-9_-]+';/);
});
test('weekly compact timetable exposes full-calendar button within the fixed hero',()=>{
 assert.match(timetable,/const more = param\('moreLink'\) \|\| new URL\('calendar\.html'/);
 assert.doesNotMatch(timetable,/!flag\('compact', true\) && more &&/);
 assert.match(source('site/assets/wo.css'),/\.wo-hero-compact \.wo-tt-more/);
});

test('monthly poster manager uses dedicated backend operations rather than event editing fields',()=>{
 assert.match(backend,/function editorGetMonthlyPoster\(requestedMonth\)/);
 assert.match(backend,/function editorSaveMonthlyPoster\(form\)/);
 assert.match(backend,/function editorDeleteMonthlyPoster\(requestedMonth, revision\)/);
 assert.match(backend,/e\.extendedProperties\?\.shared\?\.\[MONTHLY_NOTICE_KEY\] === 'true'\) continue/);
 assert.match(editor,/id="monthlyDialog"/);
 const manager=editor.split('<dialog id="monthlyDialog"')[1].split('</dialog>')[0];
 for(const id of ['title','category','repeat','startDate','endDate','startTime','endTime','featured','visibility','description']){
  assert.doesNotMatch(manager,new RegExp('id="'+id+'"'),id+' must not be in monthly notice manager');
 }
 assert.match(manager,/name="month"/);
 assert.match(manager,/name="attachment"/);
 assert.match(manager,/name="revision"/);
});

test('dedicated save replaces one monthly file, preserves past months and rejects stale or invalid writes',()=>{
 const records=[];
 const actions=[];
 const calendar={
  CalendarList:{get:()=>({accessRole:'writer'})},
  Events:{
   list:()=>({items:records}),
   insert:(body)=>{actions.push({kind:'insert',body});const rec={
     ...body,id:'poster-2026-11',etag:'r1',updated:'2026-11-04T14:00:00Z'};
     records.push(rec);return rec;},
   patch:(body,cal,id)=>{actions.push({kind:'patch',body,id});const rec=records.find(x=>x.id===id);
     Object.assign(rec,body,{etag:'r2',updated:'2026-11-04T14:30:00Z'});return rec;},
   remove:(cal,id)=>{actions.push({kind:'remove',id});const n=records.findIndex(x=>x.id===id);records.splice(n,1);},
  },
 };
 let nextFile=0;
 const context=vm.createContext({
  Calendar:calendar,
  Drive:{Files:{create:(meta)=>({id:'file-'+(++nextFile),name:meta.name,mimeType:meta.mimeType,
    webViewLink:'https://drive.google.com/file/d/file-'+nextFile+'/view'})},
   Permissions:{create:(permission)=>{assert.equal(permission.type,'anyone')}}},
  Utilities:{formatDate:(date,zone,format)=>{
   if(format==='yyyy-MM-dd')return new Date(date).toISOString().slice(0,10);
   if(format==='MMMM yyyy')return 'November 2026';
   throw Error('Unexpected date format '+format);
  }},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
 });
 vm.runInContext(backend,context);
 const blob=(name,mime)=>({getName:()=>name,getContentType:()=>mime,
  getBytes:()=>new Uint8Array(1024)});
 assert.equal(context.editorGetMonthlyPoster('2026-11').exists,false);
 const first=context.editorSaveMonthlyPoster({
  month:'2026-11',revision:'',attachment:blob('November.png','image/png')});
 assert.equal(first.saved,true);
 assert.equal(first.month,'2026-11');
 assert.equal(first.revision,'r1');
 assert.equal(actions[0].kind,'insert');
 assert.equal(actions[0].body.extendedProperties.shared.woMonthlyNotice,'true');
 assert.equal(actions[0].body.extendedProperties.shared.woFeatured,'false');
 assert.equal(actions[0].body.start.date,'2026-11-01');
 assert.equal(actions[0].body.end.date,'2026-11-02');
 assert.equal(actions[0].body.transparency,'transparent');
 assert.equal(actions[0].body.attachments.length,1);
 assert.equal(actions[0].body.attachments[0].mimeType,'image/png');
 const later=context.editorSaveMonthlyPoster({
  month:'2026-11',revision:'r1',attachment:blob('November.pdf','application/pdf')});
 assert.equal(later.revision,'r2');
 assert.equal(actions[1].kind,'patch');
 assert.equal(actions[1].body.attachments.length,1,'replacing a poster removes old attachment from record');
 assert.equal(actions[1].body.attachments[0].mimeType,'application/pdf');
 assert.throws(()=>context.editorSaveMonthlyPoster({
  month:'2026-11',revision:'r1',attachment:blob('late.png','image/png')}),/changed/);
 assert.throws(()=>context.editorSaveMonthlyPoster({
  month:'2026-11',revision:'r2',attachment:blob('bad.jpg','image/jpeg')}),/PNG image or PDF/);
 assert.throws(()=>context.editorGetMonthlyPoster('2026-13'),/valid month/);
 const listed=context.editorListEvents('2026-11-01','2026-11-30');
 assert.equal(listed.length,0,'monthly poster is invisible in normal calendar editor');
 const removed=context.editorDeleteMonthlyPoster('2026-11','r2');
 assert.equal(removed.removed,true);
 assert.equal(actions.at(-1).kind,'remove');
 assert.equal(context.editorGetMonthlyPoster('2026-11').exists,false);
});

test('monthly upload locks interaction without disabling serializable file and month inputs',()=>{
 const start=editor.indexOf('function monthlyRender(){');
 const end=editor.indexOf('async function monthlyLoad()',start);
 assert.ok(start>=0&&end>start);
 const render=editor.slice(start,end);
 assert.match(render,/\$\('monthlyForm'\)\.inert=monthlyState\.busy/);
 assert.match(render,/\$\('monthlyForm'\)\.setAttribute\('aria-busy',String\(monthlyState\.busy\)\)/);
 assert.doesNotMatch(render,/monthlyMonth','monthlyFile'/,
   'month and file must not be disabled when saving; Apps Script omits disabled controls');
 assert.match(editor,/const outgoing=new FormData\(form\)/);
 assert.match(editor,/await call\('editorSaveMonthlyPoster',form\)/);
});
