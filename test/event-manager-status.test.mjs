import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const base=path.resolve(import.meta.dirname,'..');
const backend=fs.readFileSync(path.join(base,'admin/apps-script/Code.gs'),'utf8');
const frontend=fs.readFileSync(path.join(base,'admin/apps-script/Index.html'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'admin/apps-script/appsscript.json'),'utf8'));
const URL='https://parish-status.example.org/api/editor/warnings';
const TOKEN='s'.repeat(64);
const now=new Date().toISOString();
function testHarness({role='writer',config=true,code=200,response}={}){
  let outbound=0,properties=0,request=null;
  const data=response||{
    version:1,state:'attention',checkedAt:now,additionalCount:0,
    warnings:[{
      category:'publishing',level:'advisory',title:'Calendar updates may be delayed',
      message:'The latest completed publishing run did not succeed.',
      action:'Check the next successful publishing run.',
    }],
  };
  const context=vm.createContext({
    Calendar:{CalendarList:{get:()=>({summary:'Parish',accessRole:role})}},
    PropertiesService:{getScriptProperties(){
      properties++;
      return {getProperty(name){
        if(!config)return null;
        return name==='PARISH_STATUS_FEED_URL'?URL:
          name==='PARISH_STATUS_FEED_TOKEN'?TOKEN:null;
      }};
    }},
    UrlFetchApp:{fetch(url,opts){
      outbound++;
      request={url,options:opts};
      return {getResponseCode:()=>code,
        getContentText:()=>JSON.stringify(data)};
    }},
  });
  vm.runInContext(backend,context,{filename:'Code.gs'});
  return {context,get outbound(){return outbound},get properties(){return properties},
    get request(){return request}};
}
test('private status proxy checks calendar edit permission before reading a token or contacting Cloudflare',()=>{
  const s=testHarness({role:'reader'});
  assert.throws(()=>s.context.editorStatusWarnings(),/permission to edit/);
  assert.equal(s.properties,0);
  assert.equal(s.outbound,0);
});
test('unconfigured status feed fails quietly and does not affect event editing',()=>{
  const s=testHarness({config:false});
  const data=s.context.editorStatusWarnings();
  assert.equal(data.state,'unavailable');
  assert.equal(data.warnings.length,0);
  assert.equal(s.outbound,0);
  assert.equal(s.context.editorBootstrap().calendarName,'Parish');
});
test('editor proxy uses HTTPS, a scoped server-side bearer token and GET only',()=>{
  const s=testHarness();
  const data=s.context.editorStatusWarnings();
  assert.equal(data.state,'attention');
  assert.equal(data.warnings.length,1);
  assert.equal(s.outbound,1);
  assert.equal(s.request.url,URL);
  assert.equal(s.request.options.method,'get');
  assert.equal(s.request.options.followRedirects,false);
  assert.equal(s.request.options.headers.Authorization,'Bearer '+TOKEN);
  assert.ok(!JSON.stringify(data).includes(TOKEN));
  assert.ok(!JSON.stringify(data).includes(URL));
});
test('invalid status feed or HTTP failure returns Unknown-style unavailable, never a false clear result',()=>{
  assert.equal(testHarness({code:503}).context.editorStatusWarnings().state,'unavailable');
  assert.equal(testHarness({response:{version:1,state:'clear',warnings:[]}})
    .context.editorStatusWarnings().state,'unavailable');
  assert.equal(testHarness({response:{
    version:1,state:'attention',checkedAt:now,
    warnings:[{category:'fake',level:'advisory',title:'Wrong',message:'Wrong',action:'Wrong'}],
  }}).context.editorStatusWarnings().state,'unavailable');
});
test('private status payload is bounded and stripped of markup before the browser sees it',()=>{
  const s=testHarness({response:{
    version:1,state:'attention',checkedAt:now,warnings:[{
      category:'editing',level:'important',
      title:'<script>alert(1)</script>Google Calendar incident',
      message:'<b>Editing</b> could be affected',
      action:'Keep changes safe',secret:'LEAK-EXTERNAL-DIAGNOSTICS',
    }],
  }});
  const report=s.context.editorStatusWarnings();
  assert.equal(report.warnings.length,1);
  assert.ok(!report.warnings[0].title.includes('<'));
  assert.ok(!JSON.stringify(report).includes('LEAK-EXTERNAL-DIAGNOSTICS'));
});
test('editor UI shows small, dismissible grouped warnings without blocking or popping a toast',()=>{
  assert.match(frontend,/id="editorWarnings"/);
  assert.match(frontend,/id="editorWarningItems"/);
  assert.match(frontend,/id="editorWarningsDismiss"/);
  assert.match(frontend,/call\('editorStatusWarnings'\)/);
  assert.match(frontend,/if\(linked\)setInterval\(loadEditorWarnings,15\*60\*1000\)/);
  assert.match(frontend,/signature===dismissedEditorWarningKey/);
  assert.match(frontend,/panel\.hidden=true/);
  assert.doesNotMatch(frontend,/fetch\(['"]https:\/\/[^'"]+\/api\/editor\/warnings/);
  assert.doesNotMatch(frontend,/PARISH_STATUS_FEED_TOKEN/);
  assert.doesNotMatch(frontend,/EVENT_MANAGER_FEED_TOKEN/);
});
test('Apps Script allows external read-only HTTPS while preserving user-authorised Calendar and Drive',()=>{
  assert.equal(manifest.webapp.executeAs,'USER_ACCESSING');
  assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.external_request'));
  assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/calendar.events'));
  assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/drive'));
  assert.doesNotMatch(backend,/function\s+editorStatusWarnings\(\)[\s\S]*?ScriptApp\.getOAuthToken/);
});
