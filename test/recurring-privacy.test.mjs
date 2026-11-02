import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(import.meta.dirname,'..');
const backend=fs.readFileSync(path.join(root,'admin/apps-script/Code.gs'),'utf8');
const editor=fs.readFileSync(path.join(root,'admin/apps-script/Index.html'),'utf8');
const sync=fs.readFileSync(path.join(root,'scripts/sync-calendar.mjs'),'utf8');

const fixture = ({count=0, exception=false, first=false, failedTrim=false}={}) => {
 const master={
  id:'weekly-series',etag:'master-etag',summary:'Community Coffee Morning',
  start:{dateTime:'2026-11-01T10:00:00Z'},end:{dateTime:'2026-11-01T11:00:00Z'},
  recurrence:['RRULE:FREQ=WEEKLY;BYDAY=SU'+(count?';COUNT='+count:'')],
  location:'Church Hall',description:'Original description',visibility:'default',
  extendedProperties:{shared:{woCategory:'community',woFeatured:'true',woImageFocus:'70,30',otherField:'preserved'}},
  attachments:[{fileId:'poster-image',fileUrl:'https://drive.google.com/file/d/poster-image/view',title:'Poster',mimeType:'image/png'}],
 };
 const original=first?'2026-11-01T10:00:00Z':'2026-11-15T10:00:00Z';
 const selected={
  id:'weekly-series_20261115T100000Z',recurringEventId:master.id,
  originalStartTime:{dateTime:original},
  etag:'instance-etag',summary:master.summary,description:master.description,
  start:{dateTime:original},end:{dateTime:first?'2026-11-01T11:00:00Z':'2026-11-15T11:00:00Z'},
  visibility:'default',extendedProperties:{shared:{}},attachments:master.attachments,
 };
 const calls=[];
 const records={
  [master.id]:master,
  [selected.id]:selected,
 };
 const calendar={
  CalendarList:{get:()=>({summary:'Parish',accessRole:'writer'})},
  Events:{
   get:(_cal,id)=>records[id],
   list:(_cal,opts)=>{
    calls.push({method:'list',opts});
    return {items:exception?[{id:'exception',recurringEventId:master.id}]:[]};
   },
   instances:(_cal,_id,opts)=>{
    calls.push({method:'instances',opts});
    return {items:[{id:'one'},{id:'two'}]};
   },
   insert:(body,_cal,opts)=>{
    calls.push({method:'insert',body,opts});
    return {id:'future-series',etag:'new-etag'};
   },
   patch:(body,_cal,id,opts)=>{
    calls.push({method:'patch',id,body,opts});
    if(failedTrim && id===master.id && body.recurrence?.[0].includes('UNTIL='))throw Error('Calendar patch rejected');
    return {id,etag:'updated-etag'};
   },
   remove:(_cal,id)=>{calls.push({method:'remove',id})},
  },
 };
 const Utilities={formatDate:(date,zone,format)=>{
  const parts=new Intl.DateTimeFormat('en-GB',{
   timeZone:zone,day:'2-digit',month:'2-digit',year:'numeric',
   hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  }).formatToParts(new Date(date));
  const dict=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  if(format==='yyyy-MM-dd')return dict.year+'-'+dict.month+'-'+dict.day;
  if(format==='HH:mm')return dict.hour+':'+dict.minute;
  throw Error('Unexpected format: '+format);
 }};
 const context=vm.createContext({Calendar:calendar,Utilities,LockService:{
  getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}}),
 }});
 vm.runInContext(backend,context,{filename:'Code.gs'});
 const form={
  id:selected.id,editScope:'following',revision:selected.etag,
  title:'Updated Coffee Morning',category:'community',featured:true,visibility:'public',
  startDate:first?'2026-11-01':'2026-11-15',
  endDate:first?'2026-11-01':'2026-11-15',startTime:'10:00',endTime:'11:00',
  location:'New Hall',repeat:count?'custom':'weekly',
  customRepeat:count?{unit:'WEEKLY',interval:1,days:['SU'],ends:'count',count}:undefined,
  descriptionChanged:false,imageFocus:'80,25',headerImageId:'poster-image',
 };
 return {master,selected,context,form,calls};
};

test('non-recurring event can become private through native Calendar visibility',()=>{
 const {context,master,calls,form}=fixture();
 const standAlone={...master,id:'one-off',recurrence:[],etag:'single-etag',visibility:'default'};
 // The event-specific gate is tested by directly normalising and inspecting the save body.
 const body=context.normalise_({...form,id:'',editScope:'',repeat:'none',visibility:'private'});
 assert.equal(body.body.visibility,'private');
 assert.equal(body.body.extendedProperties.shared.woFeatured,'false');
 assert.ok(standAlone);
});

test('this-event-only supports non-privacy edits but refuses native series privacy changes',()=>{
 const {context,form,calls}=fixture();
 assert.throws(
  ()=>context.editorSaveEvent({...form,editScope:'occurrence',visibility:'private',repeat:'none'}),
  /Privacy cannot be changed for just one recurring occurrence/
 );
 assert.equal(calls.filter(c=>c.method==='patch').length,0);
 const result=context.editorSaveEvent({...form,editScope:'occurrence',visibility:'default',repeat:'none'});
 assert.equal(result.status,'updated');
 const patches=calls.filter(c=>c.method==='patch');
 assert.equal(patches.length,1);
 assert.equal(patches[0].id,'weekly-series_20261115T100000Z');
 assert.equal(patches[0].body.summary,'Updated Coffee Morning');
 assert.equal('visibility' in patches[0].body,false);
 assert.equal('recurrence' in patches[0].body,false);
});

test('existing private recurring event retains privacy when editing one occurrence, while a broader scope can change visibility',()=>{
 const {context,master,selected,form,calls}=fixture();
 master.visibility='private';
 // Google recurring instances sometimes report default while inheriting the
 // master series' native Private flag.
 selected.visibility='default';
 const occurrence=context.editorGetEvent(selected.id,'occurrence');
 assert.equal(occurrence.visibility,'private');
 assert.equal(occurrence.editScope,'occurrence');
 const future=context.editorGetEvent(selected.id,'following');
 assert.equal(future.visibility,'private');
 const series=context.editorGetEvent(selected.id,'series');
 assert.equal(series.visibility,'private');
 assert.equal(series.editScope,'series');
 // Updating a single occurrence's title must not change private visibility.
 context.editorSaveEvent({...form,editScope:'occurrence',visibility:'private',repeat:'none'});
 const single=calls.find(c=>c.method==='patch');
 assert.equal(single.id,selected.id);
 assert.equal('visibility' in single.body,false);
 // A deliberate whole-series visibility change may be sent to the master.
 context.editorSaveEvent({...form,editScope:'series',revision:master.etag,
  visibility:'public',repeat:'weekly'});
 const updateMaster=calls.find(c=>c.method==='patch'&&c.id===master.id);
 assert.equal(updateMaster.body.visibility,'public');
});

test('all-series editing shows the clicked occurrence date but never moves the master date',()=>{
 const {context,master,selected,form,calls}=fixture();
 const data=context.editorGetEvent(selected.id,'series');
 assert.equal(data.selectedId,selected.id);
 assert.equal(data.id,master.id);
 assert.equal(data.startDate,'2026-11-15');
 assert.equal(data.endDate,'2026-11-15');
 assert.equal(data.selectedOccurrenceDate,'2026-11-15');
 assert.equal(data.seriesStartDate,'2026-11-01');
 assert.equal(data.startTime,'10:00');
 context.editorSaveEvent({...form,editScope:'series',revision:master.etag,startTime:'12:30',endTime:'13:30'});
 const update=calls.find(c=>c.method==='patch');
 assert.equal(update.id,master.id);
 assert.equal(update.body.start.dateTime,'2026-11-01T12:30:00');
 assert.equal(update.body.end.dateTime,'2026-11-01T13:30:00');
 assert.equal(update.body.recurrence[0],'RRULE:FREQ=WEEKLY;BYDAY=SU');
 assert.throws(()=>context.editorSaveEvent({...form,editScope:'series',revision:master.etag,
  startDate:'2026-11-16',endDate:'2026-11-16'}),/reference only/);
 assert.equal(calls.filter(c=>c.method==='patch').length,1,'reject date drift before mutation');
});

test('attachment removal only detaches the selected file and preserves the original Drive object',()=>{
 const {context,master,selected,calls}=fixture();
 master.attachments.push({fileId:'second-file',fileUrl:'https://drive.google.com/file/d/second-file/view',title:'Flyer',mimeType:'application/pdf'});
 const removed=context.editorRemoveAttachment(selected.id,'series',master.etag,'poster-image');
 assert.equal(removed.removed,true);
 assert.equal(removed.driveFileRetained,true);
 const patch=calls.find(c=>c.method==='patch');
 assert.equal(patch.id,master.id);
 assert.equal(patch.opts.supportsAttachments,true);
 assert.equal(patch.body.attachments.length,1);
 assert.equal(patch.body.attachments[0].title,'Flyer');
 assert.equal(patch.body.extendedProperties.shared.woHeaderImageId,'none');
 assert.equal(calls.some(c=>c.method==='remove'),false);
});

test('removing a file from future occurrences without first splitting is refused',()=>{
 const {context,selected,calls}=fixture();
 assert.throws(()=>context.editorRemoveAttachment(selected.id,'following',selected.etag,'poster-image'),/first save a separate future series/);
 assert.equal(calls.filter(c=>c.method==='patch').length,0);
});
test('this-and-future splits series, retains media and previous history, and returns new series ID',()=>{
 const {context,form,calls}=fixture();
 const res=context.editorSaveEvent(form);
 assert.equal(res.id,'future-series');
 assert.equal(res.scope,'series');
 const inserted=calls.find(c=>c.method==='insert');
 const trimmed=calls.find(c=>c.method==='patch');
 assert.equal(inserted.body.summary,'Updated Coffee Morning');
 assert.equal(inserted.body.description,'Original description');
 assert.equal(inserted.body.visibility,'public');
 assert.equal(inserted.body.start.dateTime,'2026-11-15T10:00:00');
 assert.equal(inserted.body.extendedProperties.shared.woImageFocus,'80,25');
 assert.equal(inserted.body.extendedProperties.shared.otherField,'preserved');
 assert.equal(inserted.body.attachments.length,1);
 assert.equal(inserted.body.recurrence[0],'RRULE:FREQ=WEEKLY;BYDAY=SU');
 assert.equal(trimmed.id,'weekly-series');
 assert.equal(trimmed.body.recurrence[0],'RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=20261115T095959Z');
 assert.ok(calls.findIndex(c=>c.method==='insert')<calls.findIndex(c=>c.method==='patch'));
});

test('count-based series preserves total recurrence count when splitting the future',()=>{
 const {context,form,calls}=fixture({count:8});
 context.editorSaveEvent(form);
 const inserted=calls.find(c=>c.method==='insert');
 assert.equal(inserted.body.recurrence[0],'RRULE:FREQ=WEEKLY;BYDAY=SU;COUNT=6');
 assert.equal(calls.filter(c=>c.method==='instances').length,1);
});

test('existing future exceptions refuse splitting before performing mutations',()=>{
 const {context,form,calls}=fixture({exception:true});
 assert.throws(()=>context.editorSaveEvent(form),/exceptions/);
 assert.equal(calls.filter(c=>['insert','patch'].includes(c.method)).length,0);
});

test('split at first recurrence simply edits original master without duplication',()=>{
 const {context,form,calls}=fixture({first:true});
 const res=context.editorSaveEvent(form);
 assert.equal(res.id,'weekly-series');
 assert.equal(calls.filter(c=>c.method==='insert').length,0);
 assert.equal(calls.filter(c=>c.method==='patch').length,1);
});

test('failed trim removes new future series to avoid duplicate calendar occurrences',()=>{
 const {context,form,calls}=fixture({failedTrim:true});
 assert.throws(()=>context.editorSaveEvent(form),/rolled back/);
 assert.ok(calls.find(c=>c.method==='remove'&&c.id==='future-series'));
});

test('deleting from this event keeps prior occurrences and trims the master',()=>{
 const {context,selected,calls}=fixture();
 const res=context.editorDeleteEvent(selected.id,'following',selected.etag);
 assert.equal(res.scope,'following');
 assert.equal(calls.filter(c=>c.method==='insert').length,0);
 assert.equal(calls.filter(c=>c.method==='remove').length,0);
 assert.equal(calls.filter(c=>c.method==='patch').length,1);
});

test('editor exposes every scope and private-event control while public sync hides inherited master privacy',()=>{
 for(const scope of ['occurrence','following','series']){
  assert.match(editor,new RegExp('name="scope" value="'+scope+'"'));
 }
 assert.match(editor,/id="visibility"/);
 assert.match(editor,/state\.scope===\x27following\x27/);
 assert.match(sync,/e\.visibility === 'private'/);
 assert.match(sync,/masters\.has\(e\.recurringEventId\) && !isHidden\(masters\.get\(e\.recurringEventId\)\)/);
 assert.doesNotMatch(sync,/woPrivate/);
 assert.match(editor,/\$\('visibility'\)\.disabled=!!e\.isRecurring && state\.scope==='occurrence'/);
 assert.match(sync,/events = events\.filter[\s\S]*?Attachment metadata/);
});
