/* Follow the published walkthroughs by interacting with their highlighted controls.
   Assertions compare each drill with source records and verify the final workspace. */
const assert=require('node:assert/strict');
const {start,server,chromium,fs,reportDir}=require('./harness.cjs');
const scenarios=['registry','groups','columns','pivot','hierarchy','relations','dictionaries'];
const viewports=[{width:320,height:768},{width:390,height:844},{width:1440,height:1000}];
const counts={registry:5,groups:6,columns:5,pivot:6,hierarchy:5,relations:5,dictionaries:5};
const sorted=ids=>ids.map(String).sort();
(async()=>{
 const base=await start(),browser=await chromium.launch({headless:true,channel:'chrome'}),results=[];
 try{
  for(const viewport of viewports)for(const scenario of scenarios){
   const page=await browser.newPage({viewport}),errors=[],result={scenario,viewport,steps:[]};
   page.on('pageerror',error=>errors.push(error.message));
   try{
    await page.goto(base+'?scenario='+scenario);
    await page.waitForFunction(()=>window.IntegramTour?.active);
    const baseline=await page.evaluate(()=>IntegramSite.app.data.tables.map(t=>({id:t.id,count:t.rows.length,first:t.rows[0],last:t.rows.at(-1)})));
    let relatedIds=null,expectedDrill=null,search=null;
    while(await page.evaluate(()=>IntegramTour.active)){
     assert.ok(result.steps.length<12,'Guide should finish without cycling');
     await page.waitForTimeout(100);
     const step=await page.evaluate(()=>{
      const a=IntegramSite.app,n=IntegramTour.currentStep,d=IntegramScenarios.steps(a,IntegramSite.scenario)[n-1];
      const target=typeof d.target==='function'?d.target():document.querySelector(d.target),card=document.querySelector('.ig-tour-card');
      const r=target?.getBoundingClientRect(),c=card.getBoundingClientRect(),skip=document.querySelector('[data-tour-action="skip"]').getBoundingClientRect();
      const action=target?.dataset.action,meta={};
      if(action==='g-drill'){
       const node=a.groupNodes.get(target.dataset.path),path=node.path.map(id=>a.groupNodes.get(id));
       meta.expectedIds=a.t.rows.filter(row=>path.every(p=>String(row[p.rule.key]??'')===String(p.value??''))).map(row=>String(row.id));
      }
      if(action==='pivot-drill')meta.expectedIds=a.s.pivotCells.get(target.dataset.cell).map(String);
      if(action==='h-related-toggle'){
       const [id]=JSON.parse(target.dataset.key);
       meta.relatedIds=IntegramModel.table(a.data,'items').rows.filter(row=>String(row.deal)===String(id)).map(row=>String(row.id));
      }
      if(action==='dictionary-usage')meta.expectedIds=IntegramModel.table(a.data,target.dataset.table).rows.filter(row=>String(row[target.dataset.key]??'')===String(target.dataset.value??'')).map(row=>String(row.id));
      if(action==='band-toggle')meta.visibleBefore=IntegramColumns.layout(a).fields.length;
      return {n,title:d.title,body:d.body,event:d.event,action,targetId:target?.dataset.id,meta,missing:document.querySelector('#integram-tour').dataset.missing,
       overlap:!!r&&r.left<c.right&&r.right>c.left&&r.top<c.bottom&&r.bottom>c.top,
       cardFits:c.left>=0&&c.right<=innerWidth+1&&c.top>=0&&c.bottom<=innerHeight+1,
       skipFits:skip.top>=0&&skip.bottom<=innerHeight,
       pageFits:document.documentElement.scrollWidth<=innerWidth+1};
     });
     assert.notEqual(step.missing,'true','Target must be available: '+step.title);
     assert.ok(step.cardFits&&step.skipFits&&step.pageFits,'Guide must fit the viewport: '+step.title);
     if(step.event)assert.equal(step.overlap,false,'Guide must leave action target clickable: '+step.title);
     if(step.meta.relatedIds)relatedIds=step.meta.relatedIds;
     if(step.meta.expectedIds)expectedDrill=step.meta.expectedIds;
     const target=page.locator('[aria-describedby*="integram-tour-description-"]').first();
     if(step.event==='input'){search=step.body.match(/«([^»]+)»/)[1];await target.fill(search);}
     else if(step.event==='change')await target.selectOption('amount');
     else if(step.event==='click')await target.click();
     else await page.locator('[data-tour-action="next"]').click();
     await page.waitForFunction(n=>!IntegramTour.active||IntegramTour.currentStep!==n,step.n,{timeout:10000});
     const state=await page.evaluate(()=>{
      const a=IntegramSite.app;return {screen:a.s.screen,table:a.s.tableId,view:a.v.screen,ids:a.rows.map(r=>String(r.id)),recordId:a.s.recordId,search:a.s.search,
       scope:a.v.recordScope?.ids.map(String),visible:IntegramColumns.layout(a).fields.length,finance:a.v.bands.find(b=>b.id==='finance'),
       parentContext:[...a.root.querySelectorAll('.hierarchy-context')].map(el=>el.dataset.hNode)};
     });
     if(['g-drill','pivot-drill','dictionary-usage'].includes(step.action)){
      assert.ok(expectedDrill.length>0&&expectedDrill.length<baseline.find(t=>t.id===state.table).count,'Drill must select a proper source subset');
      assert.deepEqual(sorted(state.ids),sorted(expectedDrill),'Drill must contain exactly the underlying source records');
      if(step.action!=='dictionary-usage')assert.deepEqual(sorted(state.scope),sorted(expectedDrill),'Fixed scope must retain every drilled record');
     }
     if(step.action==='related-list'){
      assert.equal(state.table,'items');assert.ok(relatedIds.length>0&&relatedIds.length<50000);
      assert.deepEqual(sorted(state.ids),sorted(relatedIds),'Related list must contain only this contract’s items');
     }
     if(step.action==='open'||step.action==='h-open'){assert.equal(state.screen,'record');assert.equal(String(state.recordId),step.targetId);}
     if(step.event==='input'){
      assert.equal(state.search,search);assert.ok(state.ids.includes(search),'Search must find the requested identifier');
      if(scenario==='hierarchy'){assert.equal(state.ids.length,1);assert.equal(state.parentContext.length,1);}
     }
     if(step.event==='click'&&step.action==='band-toggle')assert.ok(state.visible<step.meta.visibleBefore,'Collapsing a section must reduce visible fields');
     if(step.event==='change'){assert.equal(state.finance.keep[0],'amount');assert.equal(state.finance.collapsed,true);}
     result.steps.push({step:step.n,title:step.title,action:step.action||step.event||'next',records:state.ids.length});
    }
    assert.equal(result.steps.length,counts[scenario]+(scenario==='columns'&&viewport.width<651?1:0));
    const final=await page.evaluate(()=>{
     const a=IntegramSite.app;return {screen:a.s.screen,table:a.s.tableId,view:a.v.screen,rows:a.rows.length,search:a.s.search,drill:!!a.s.drill,scope:!!a.v.recordScope,
      groups:a.v.groupRules.map(r=>r.key),expandedGroups:a.v.groupOptions.expanded.length,pivot:a.v.pivot,
      related:a.root.querySelectorAll('.hierarchy-related').length,context:a.root.querySelectorAll('.hierarchy-context').length,
      dictionaryValues:a.root.querySelectorAll('[data-dictionary-value]').length,options:a.t.fields.find(f=>f.key==='stage')?.options.length,
      undo:a.undo.length,changedTables:a.changedTables.size,storedData:localStorage.getItem(a.storage+'-data'),
      data:a.data.tables.map(t=>({id:t.id,count:t.rows.length,first:t.rows[0],last:t.rows.at(-1)})),descriptions:document.querySelectorAll('[aria-describedby*="integram-tour-description-"]').length};
    });
    assert.deepEqual(final.data,baseline,'Table counts and boundary records must remain intact');
    assert.equal(final.undo,0,'Tutorial must not commit record changes');assert.equal(final.changedTables,0);assert.equal(final.storedData,null);
    assert.equal(final.descriptions,0,'Completed tour must clean up temporary ARIA descriptions');
    if(scenario==='registry'){assert.equal(final.screen,'list');assert.equal(final.search,search);assert.ok(final.rows>0&&final.rows<12000);}
    if(scenario==='groups'){assert.deepEqual(final.groups,['company','stage','date']);assert.equal(final.rows,12000);assert.ok(final.expandedGroups>=2);assert.equal(final.drill,false);assert.equal(final.scope,false);}
    if(scenario==='columns'){assert.equal(final.screen,'list');assert.equal(final.view,'table');assert.equal(final.rows,12000);}
    if(scenario==='pivot'){assert.equal(final.view,'pivot');assert.equal(final.rows,25000);assert.ok(final.pivot.rowExpanded.length&&final.pivot.columnExpanded.length);assert.equal(final.drill,false);assert.equal(final.scope,false);}
    if(scenario==='hierarchy'){assert.equal(final.table,'tasks');assert.equal(final.view,'hierarchy');assert.equal(final.rows,1);assert.equal(final.context,1);}
    if(scenario==='relations'){assert.equal(final.table,'deals');assert.equal(final.view,'hierarchy');assert.ok(final.related>0);assert.equal(final.rows,12000);}
    if(scenario==='dictionaries'){assert.equal(final.screen,'dictionary');assert.equal(final.dictionaryValues,final.options);}
    assert.deepEqual(errors,[]);result.pass=true;
   }catch(error){result.pass=false;result.error=String(error);result.errors=errors;await page.screenshot({path:reportDir+'/onboarding-'+scenario+'-'+viewport.width+'.png'});}
   results.push(result);console.log((result.pass?'PASS':'FAIL')+' '+scenario+' '+viewport.width+'px '+result.steps.length+' steps'+(result.error?' '+result.error:''));await page.close();
  }
 }finally{await browser.close();server.close();fs.writeFileSync(reportDir+'/onboarding.json',JSON.stringify(results,null,2));}
 console.log('RESULT '+results.filter(r=>r.pass).length+'/'+results.length);
 if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
