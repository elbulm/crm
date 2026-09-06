/* Single-design site routing. Existing table and shared-view links remain valid. */
(()=>{
'use strict';
const S=IntegramScenarios,T=IntegramTour;
const root=document.getElementById('integram-contour'),home=document.getElementById('home-page'),workspace=document.getElementById('workspace-page');
const theme=document.getElementById('preview-theme'),dataset=document.getElementById('preview-data'),status=document.getElementById('tutorial-status');
let app=null,currentScenario=null;
const params=new URL(location.href).searchParams;
if(['sample','large','stress'].includes(params.get('data')))dataset.value=params.get('data');
try{const stored=localStorage.getItem('integram-preview-theme');if(['system','light','dark'].includes(stored))theme.value=stored;}catch{}
function applyTheme(){const value=theme.value;document.documentElement.dataset.theme=value;document.documentElement.style.colorScheme=value==='system'?'light dark':value;root.style.colorScheme=value==='system'?'light dark':value;try{localStorage.setItem('integram-preview-theme',value);}catch{}}
function routeTitle(){document.getElementById('scenario-title').textContent=currentScenario?S.definitions[currentScenario].title:'Общий реестр';document.title=(currentScenario?S.definitions[currentScenario].title:app?'Рабочее пространство':'Рабочие таблицы')+' — Интеграм';}
function showWorkspace(){home.hidden=true;workspace.hidden=false;workspace.tabIndex=-1;document.querySelector('.skip-to-content').href='#workspace-page';document.getElementById('data-control').hidden=false;document.querySelector('.preview-shell').classList.toggle('stress-preview',dataset.value==='stress');}
function viewKey(id){return 'integram-demo-v3-contour-'+dataset.value+'-example-'+id;}
function createApp(id){app?.abort.abort();root.replaceChildren();app=new IntegramApp('contour',root,dataset.value,id?{viewStorage:viewKey(id)}:{});applyTheme();}
function remember(id,value){try{sessionStorage.setItem('integram-tutorial-'+id+'-'+app.mode,value);}catch{}}
function previous(id){try{return sessionStorage.getItem('integram-tutorial-'+id+'-'+app.mode);}catch{return null;}}
function tutorialEnd({id,reason}){remember(id,reason);status.hidden=false;status.textContent=reason==='complete'?'Обучение завершено. Продолжайте работу или откройте другой пример.':'Обучение пропущено. Можно работать самостоятельно или начать снова.';document.getElementById('start-tutorial').textContent='Пройти обучение снова';}
function runTutorial(prepare=true){
 if(!app||!app.canLeaveWorkspace())return;
 const id=currentScenario||'registry';
 T.stop({silent:true});status.hidden=true;
 try{
  if(prepare)S.prepare(app,id);
  remember(id,'active');
  T.start({id,title:S.definitions[id].title,steps:S.steps(app,id),onEnd:tutorialEnd,onRestart:()=>runTutorial(true)});
 }catch(error){status.hidden=false;status.textContent='Не удалось подготовить обучение: '+error.message+' Можно продолжить работу в таблице.';app.render();}
}
function beginTutorial(){
 if(!app||!app.canLeaveWorkspace())return;
 if(!currentScenario){
  currentScenario=app.s.screen==='dictionaries'||app.s.screen==='dictionary'?'dictionaries':app.v.screen==='pivot'?'pivot':app.v.screen==='hierarchy'?(app.t.id==='tasks'?'hierarchy':'relations'):app.v.groupRules.length?'groups':'registry';
  if(currentScenario!=='registry'&&app.mode!=='stress'){dataset.value='stress';createApp(currentScenario);}
  else {app.viewStorage=viewKey(currentScenario);app.config=app.read('views')||{};}
  const url=new URL(location.href);for(const key of ['view','screen','table','example','section'])url.searchParams.delete(key);url.searchParams.set('scenario',currentScenario);url.searchParams.set('data',dataset.value);url.hash='contour';history.replaceState(null,'',url);
 }
 routeTitle();runTutorial(true);
}
function normalizeHash(){if(['register','focus'].includes(location.hash.slice(1))){const url=new URL(location.href);url.hash='contour';history.replaceState(null,'',url);}}
document.getElementById('preview-options').addEventListener('click',e=>{const open=e.currentTarget.getAttribute('aria-expanded')!=='true';e.currentTarget.setAttribute('aria-expanded',String(open));document.querySelector('.preview-banner').classList.toggle('options-open',open);});
theme.addEventListener('change',applyTheme);
document.getElementById('start-tutorial').addEventListener('click',beginTutorial);
dataset.addEventListener('change',()=>{
 if(app&&!app.canLeaveWorkspace()){dataset.value=app.mode;return;}
 T.stop({silent:true});status.hidden=true;currentScenario=null;
 const url=new URL(location.href);for(const key of ['view','scenario','screen','table','example','section'])url.searchParams.delete(key);url.searchParams.set('data',dataset.value);url.hash='contour';history.replaceState(null,'',url);
 createApp(null);app.render();showWorkspace();routeTitle();document.getElementById('start-tutorial').textContent='Пройти обучение';
});
window.addEventListener('hashchange',normalizeHash);
window.addEventListener('beforeunload',e=>{if(app&&(app.dirty()||app.pendingDictionaryDraft())){e.preventDefault();e.returnValue='';}});
normalizeHash();applyTheme();
const requested=params.get('scenario');
if(requested&&!Object.hasOwn(S.definitions,requested)){
 const note=document.createElement('p');note.className='tutorial-status';note.textContent='Такого примера нет. Выберите один из сценариев ниже.';home.prepend(note);
}else if(requested||['data','view','section','table','screen','example'].some(k=>params.has(k))||['contour','register','focus'].includes(location.hash.slice(1))){
 currentScenario=requested||null;
 if(currentScenario&&(currentScenario!=='registry'||!['sample','large','stress'].includes(params.get('data'))))dataset.value='stress';
 showWorkspace();createApp(currentScenario);routeTitle();
 if(currentScenario){
  const reload=performance.getEntriesByType('navigation')[0]?.type==='reload',state=previous(currentScenario);
  if(reload&&['skip','complete'].includes(state)){
   // Restore the current example instead of replaying dismissed instructions.
   app.advancedRouteLoaded=true;app.s.tableId=S.definitions[currentScenario].table;
   if(currentScenario==='dictionaries'){app.s.screen='dictionaries';app.s.dictionaryContext=true;}
   app.render();tutorialEnd({id:currentScenario,reason:state});
  }else runTutorial(true);
 }else app.render();
}else routeTitle();
window.IntegramSite={get app(){return app;},get scenario(){return currentScenario;},startTutorial:beginTutorial};
})();
