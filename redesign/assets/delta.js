/* Store only local changes to the generated workload; keep undo snapshots small. */
window.IntegramDelta=(()=>{
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const metadata=t=>Object.fromEntries(Object.entries(t).filter(([key])=>key!=='rows'));
let indexes;
function baseline(){return IntegramStressSeed.baseline();}
function baseIndex(){if(!indexes)indexes=new Map(baseline().tables.map(t=>[t.id,{table:t,rows:new Map(t.rows.map(r=>[String(r.id),r]))}]));return indexes;}
function empty(){return {format:'integram-delta-v1',seed:baseline().seed,order:baseline().tables.map(t=>t.id),tables:{},history:{}};}
function pack(data,changed=new Set(data.tables.map(t=>t.id))){
 const result={...empty(),order:data.tables.map(t=>t.id),history:data.history};
 for(const t of data.tables){const old=baseIndex().get(t.id);if(!old){result.tables[t.id]={created:t};continue;}if(!changed.has(t.id))continue;const update={};if(!same(metadata(t),metadata(old.table)))update.metadata=metadata(t);
 const ids=new Set(),upsert=[],fieldKeys=new Set(t.fields.map(f=>f.key));for(const r of t.rows){const id=String(r.id);ids.add(id);const original=old.rows.get(id);if(!original){upsert.push({id,added:true,values:r});continue;}const values={};for(const key of Object.keys(r))if(!Object.is(r[key],original[key])&&!(original[key]===undefined&&(r[key]===''||r[key]===false)))values[key]=r[key];const unset=Object.keys(original).filter(key=>fieldKeys.has(key)&&!(key in r));if(Object.keys(values).length||unset.length)upsert.push({id,values,...unset.length?{unset}:{}});}
 const removed=old.table.rows.filter(r=>!ids.has(String(r.id))).map(r=>String(r.id));if(upsert.length)update.upsert=upsert;if(removed.length)update.removed=removed;if(Object.keys(update).length)result.tables[t.id]=update;
 }
 return structuredClone(result);
}
function unpack(patch){
 if(patch?.format!=='integram-delta-v1'||patch.seed!==baseline().seed||!Array.isArray(patch.order))throw new Error('Unsupported workload snapshot');
 const data={version:3,seed:baseline().seed,tables:[],history:structuredClone(patch.history||{})};
 for(const id of patch.order){const changes=patch.tables[id]||{};if(changes.created){data.tables.push(structuredClone(changes.created));continue;}const old=baseIndex().get(id);if(!old)throw new Error('Missing baseline table');
 const changed=new Map((changes.upsert||[]).map(r=>[String(r.id),r])),removed=new Set(changes.removed||[]);const t={...structuredClone(changes.metadata||metadata(old.table)),rows:[]},valid=new Set(t.fields.map(f=>f.key));
 for(const row of old.table.rows){const key=String(row.id);if(removed.has(key))continue;const patchRow=changed.get(key),copy={...row,...patchRow?.values};for(const key of patchRow?.unset||[])delete copy[key];if(changes.metadata){for(const key of Object.keys(copy))if(key!=='id'&&!valid.has(key))delete copy[key];for(const f of t.fields)if(!(f.key in copy))copy[f.key]=f.type==='boolean'?false:'';}t.rows.push(copy);changed.delete(key);}
 for(const row of changed.values())t.rows.push({...row.values});data.tables.push(t);
 }
 return data;
}
return {empty,pack,unpack};
})();
