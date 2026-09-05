/* Shared table interactions for the three design concepts. All state is local to the page. */
window.IntegramGrid=function({root,s,rows,render,esc,ico,money,dt,pill,report}){
  const columns=[{key:'name',label:'Сделка',type:'text'},{key:'stage',label:'Этап',type:'enum'},{key:'amount',label:'Сумма',type:'number'},{key:'owner',label:'Ответственный',type:'enum'},{key:'date',label:'Срок',type:'date'},{key:'company',label:'Компания',type:'text'}];
  const col=key=>columns.find(c=>c.key===key);
  let order=columns.map(c=>c.key),hidden=new Set(['company']),sort=null,filters={},panel=null,current='name',dragged=null;
  let draft={key:'name',op:'contains',value:''};
  const operators={text:[['contains','содержит'],['eq','равно'],['neq','не равно'],['starts','начинается с'],['empty','не заполнено'],['filled','заполнено']],enum:[['eq','равно'],['neq','не равно'],['empty','не заполнено'],['filled','заполнено']],number:[['eq','='],['neq','≠'],['gt','>'],['gte','≥'],['lt','<'],['lte','≤'],['empty','не заполнено'],['filled','заполнено']],date:[['eq','в дату'],['gt','после'],['gte','не раньше'],['lt','до'],['lte','не позже'],['empty','не заполнено'],['filled','заполнено']]};
  const visible=()=>order.filter(key=>!hidden.has(key));
  const button=(label,attributes='',classes='',icon='')=>`<button type="button" class="button ${classes}" ${attributes}>${icon?ico(icon):''}${label}</button>`;
  const fieldOptions=key=>columns.map(c=>`<option value="${c.key}" ${c.key===key?'selected':''}>${c.label}</option>`).join('');
  const directionLabel=dir=>col(current).type==='number'?(dir==='asc'?'По возрастанию':'По убыванию'):col(current).type==='date'?(dir==='asc'?'Сначала ранние':'Сначала поздние'):(dir==='asc'?'От А до Я':'От Я до А');
  function refresh(selector){
    const active=root.contains(document.activeElement)?document.activeElement:null;
    if(!selector&&active){const attributes=[...active.attributes].filter(a=>a.name.startsWith('data-grid-')||a.name==='data-delta');if(attributes.length)selector=attributes.map(a=>'['+a.name+'="'+CSS.escape(a.value)+'"]').join('');}
    render();
    if(selector){let target=root.querySelector(selector);if(target?.disabled&&target.dataset.gridMove)target=root.querySelector('[data-grid-visible="'+target.dataset.gridMove+'"]');target?.focus({preventScroll:true});}
  }
  function openFilter(key){current=key;draft={key,op:operators[col(key).type][0][0],value:'',...(filters[key]||{})};panel='filters';refresh('[data-grid-field]');}
  function clearFilters(){filters={};s.filter='Все статусы';s.mine=false;s.checked=[];}
  function setSort(key,dir){sort=dir?{key,dir}:null;report(dir?'Сортировка: '+col(key).label+(dir==='asc'?' ↑':' ↓'):'Сортировка снята');refresh();}
  function reorder(key,target,focusSelector){const from=order.indexOf(key),to=order.indexOf(target);if(from<0||to<0||from===to)return;order.splice(from,1);order.splice(to,0,key);report('Порядок столбцов изменён');refresh(focusSelector);}
  function move(key,delta){const keys=panel==='columns'?order:visible();const i=keys.indexOf(key);if(keys[i+delta])reorder(key,keys[i+delta],`[data-grid-move="${key}"][data-delta="${delta}"]`);}
  function apply(input){
    let result=input.filter(row=>Object.entries(filters).every(([key,f])=>{
      const raw=row[key],empty=raw===null||raw===undefined||raw==='';
      if(f.op==='empty')return empty;if(f.op==='filled')return !empty;if(empty)return false;
      const numeric=col(key).type==='number';
      const a=numeric?Number(raw):String(raw).toLocaleLowerCase('ru-RU'),b=numeric?Number(f.value):String(f.value).toLocaleLowerCase('ru-RU');
      return f.op==='contains'?a.includes(b):f.op==='starts'?a.startsWith(b):f.op==='eq'?a===b:f.op==='neq'?a!==b:f.op==='gt'?a>b:f.op==='gte'?a>=b:f.op==='lt'?a<b:f.op==='lte'?a<=b:true;
    }));
    if(sort){const {key,dir}=sort;result.sort((a,b)=>{const x=a[key],y=b[key];if(x==null||x==='')return y==null||y===''?0:1;if(y==null||y==='')return -1;const diff=col(key).type==='number'?Number(x)-Number(y):String(x).localeCompare(String(y),'ru',{numeric:true});return dir==='asc'?diff:-diff;});}
    return result;
  }
  function filterForm(){
    const c=col(draft.key),empty=['empty','filled'].includes(draft.op);
    let value='';
    if(!empty){value=c.type==='enum'?`<select data-grid-value required aria-label="Значение фильтра"><option value="">Выберите значение</option>${[...new Set(rows.map(r=>r[c.key]).filter(Boolean))].map(v=>`<option value="${esc(v)}" ${v===draft.value?'selected':''}>${esc(v)}</option>`).join('')}</select>`:`<input data-grid-value type="${c.type==='number'?'number':c.type==='date'?'date':'text'}" ${c.type==='number'?'step="any"':''} required aria-label="Значение фильтра" placeholder="${c.type==='number'?'Например, 500000':'Введите значение'}" value="${esc(draft.value)}">`;}
    return `<form class="grid-filter-form" data-grid-filter-form><label>Столбец<select data-grid-field aria-label="Столбец для фильтра">${fieldOptions(draft.key)}</select></label><label>Условие<select data-grid-op aria-label="Условие фильтра">${operators[c.type].map(([key,label])=>`<option value="${key}" ${draft.op===key?'selected':''}>${label}</option>`).join('')}</select></label>${empty?'':`<label class="grid-value-label">Значение${value}</label>`}<button type="submit" class="button primary">${filters[draft.key]?'Обновить фильтр':'Применить фильтр'}</button></form><p class="grid-hint">Условия разных столбцов действуют одновременно.</p>`;
  }
  function settings(){
    if(!panel)return '';
    let title='',content='';
    if(panel==='filters'){title='Фильтры';content=filterForm();}
    if(panel==='sort'){title='Сортировка';content=`<div class="grid-sort-row"><label>Столбец<select data-grid-sort-field aria-label="Столбец для сортировки">${fieldOptions(current)}</select></label>${button(directionLabel('asc'),'data-grid-direction="asc"',sort?.key===current&&sort?.dir==='asc'?'active':'','arrow-up')}${button(directionLabel('desc'),'data-grid-direction="desc"',sort?.key===current&&sort?.dir==='desc'?'active':'','arrow-down')}${sort?button('Снять сортировку','data-grid-clear-sort','quiet'):''}</div>`;}
    if(panel==='columns'){
      title='Столбцы';content=`<p class="grid-hint">Перетащите строку или используйте стрелки. Флажок управляет видимостью.</p><div class="grid-column-list">${order.map((key,i)=>`<div class="grid-column-row" data-grid-drag="${key}" draggable="true">${ico('grip-vertical')}<label><input type="checkbox" data-grid-visible="${key}" ${hidden.has(key)?'':'checked'} ${key==='name'?'disabled':''}>${col(key).label}${key==='name'?'<small>основной</small>':''}</label>${button('','data-grid-move="'+key+'" data-delta="-1" aria-label="Переместить '+col(key).label+' выше" '+(i===0?'disabled':''),'quiet','arrow-up')}${button('','data-grid-move="'+key+'" data-delta="1" aria-label="Переместить '+col(key).label+' ниже" '+(i===order.length-1?'disabled':''),'quiet','arrow-down')}</div>`).join('')}</div>${button('Вернуть исходный вид','data-grid-reset-columns','quiet')}`;
    }
    if(panel==='column'){
      title='Столбец «'+col(current).label+'»';const keys=visible(),i=keys.indexOf(current);
      content=`<div class="grid-column-actions">${button(directionLabel('asc'),'data-grid-direction="asc"','','arrow-up')}${button(directionLabel('desc'),'data-grid-direction="desc"','','arrow-down')}${button('Фильтр по столбцу','data-grid-filter="'+current+'"','','list-filter')}${button('Левее','data-grid-move="'+current+'" data-delta="-1" '+(i===0?'disabled':''),'quiet','arrow-left')}${button('Правее','data-grid-move="'+current+'" data-delta="1" '+(i===keys.length-1?'disabled':''),'quiet','arrow-right')}${current==='name'?'':button('Скрыть столбец','data-grid-hide="'+current+'"','quiet','eye-off')}${sort?.key===current?button('Снять сортировку','data-grid-clear-sort','quiet'):''}</div>`;
    }
    return `<section class="grid-settings" aria-label="${esc(title)}"><div class="grid-settings-head"><h3>${esc(title)}</h3>${button('Закрыть','data-grid-close','quiet','x')}</div>${content}</section>`;
  }
  function toolbar(){
    const n=Object.keys(filters).length+(s.filter!=='Все статусы'?1:0)+(s.mine?1:0);
    return `<div class="tools"><label class="search">${ico('search')}<input data-search aria-label="Поиск сделок" placeholder="Найти сделку" value="${esc(s.search)}"></label>${button('Фильтры'+(n?' · '+n:''),'data-grid-panel="filters" aria-expanded="'+(panel==='filters')+'"',n||panel==='filters'?'active':'','list-filter')}${button('Сортировка','data-grid-panel="sort" aria-expanded="'+(panel==='sort')+'"',sort||panel==='sort'?'active':'','arrow-down-wide-narrow')}${button('Столбцы','data-grid-panel="columns" aria-expanded="'+(panel==='columns')+'"',panel==='columns'?'active':'','columns-3')}<span class="tools-end">${button(s.compact?'Плотно':'Обычно','data-a="density"','quiet','rows-3')}</span></div>${settings()}<div class="grid-active" aria-label="Активные условия">${Object.entries(filters).map(([key,f])=>button(esc(col(key).label+': '+operators[col(key).type].find(o=>o[0]===f.op)[1]+(['empty','filled'].includes(f.op)?'':' '+(col(key).type==='date'?dt(f.value):f.value))),`data-grid-remove-filter="${key}" aria-label="Снять фильтр: ${col(key).label}"`,'grid-chip','x')).join('')}${s.filter!=='Все статусы'?button('Этап: '+esc(s.filter),'data-grid-clear-legacy="stage"','grid-chip','x'):''}${s.mine?button('Ответственный: я','data-grid-clear-legacy="owner"','grid-chip','x'):''}${sort?button('Сортировка: '+col(sort.key).label+(sort.dir==='asc'?' ↑':' ↓'),'data-grid-clear-sort','grid-chip','x'):''}${n>1?button('Сбросить фильтры','data-grid-clear-filters','quiet'):''}</div>`;
  }
  function cell(row,key){
    if(key==='name')return `<button class="record-link" data-record="${row.id}">${esc(row.name)}</button>${hidden.has('company')?`<div class="secondary">${esc(row.company)}</div>`:''}`;
    if(key==='stage')return pill(row.stage);if(key==='amount')return money(row.amount);if(key==='date')return dt(row.date);return esc(row[key]);
  }
  function table(input){
    const keys=visible();
    return `<div class="table-wrap"><table class="data-table grid-data"><thead><tr><th class="check"><input type="checkbox" data-check-all aria-label="Выбрать все записи" ${input.length&&input.every(r=>s.checked.includes(r.id))?'checked':''}></th>${keys.map(key=>`<th scope="col" data-grid-drag="${key}" data-column="${key}" draggable="true" aria-sort="${sort?.key===key?(sort.dir==='asc'?'ascending':'descending'):'none'}"><div class="grid-th"><button class="grid-sort-heading" data-grid-sort="${key}" aria-label="Сортировать по столбцу ${col(key).label}">${col(key).label}${sort?.key===key?ico(sort.dir==='asc'?'arrow-up':'arrow-down'):''}${filters[key]?ico('list-filter'):''}</button><button class="grid-column-menu" data-grid-column="${key}" aria-label="Настройки столбца ${col(key).label}" aria-expanded="${panel==='column'&&current===key}">${ico('chevron-down')}</button></div></th>`).join('')}</tr></thead><tbody>${input.map(r=>`<tr><td class="check"><input type="checkbox" data-check="${r.id}" aria-label="Выбрать ${esc(r.name)}" ${s.checked.includes(r.id)?'checked':''}></td>${keys.map(key=>`<td data-cell="${key}" data-label="${col(key).label}" class="${key==='amount'?'number':''}">${cell(r,key)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  root.addEventListener('click',e=>{
    const el=e.target.closest('button');if(!el)return;const d=el.dataset;
    if(d.gridPanel){panel=panel===d.gridPanel?null:d.gridPanel;if(panel==='sort')current=sort?.key||current;refresh();return;}
    if(d.gridColumn){current=d.gridColumn;panel='column';refresh('.grid-settings button');return;}
    if(d.gridSort){const key=d.gridSort;const dir=sort?.key!==key?'asc':sort.dir==='asc'?'desc':null;setSort(key,dir);root.querySelector(`[data-grid-sort="${key}"]`)?.focus({preventScroll:true});return;}
    if(d.gridDirection){setSort(current,d.gridDirection);return;}
    if('gridClearSort' in d){sort=null;refresh('[data-grid-panel="sort"]');return;}
    if(d.gridFilter){openFilter(d.gridFilter);return;}
    if(d.gridMove){move(d.gridMove,Number(d.delta));return;}
    if(d.gridHide&&d.gridHide!=='name'){hidden.add(d.gridHide);panel=null;refresh('[data-grid-panel="columns"]');return;}
    if('gridClose' in d){const previous=panel;panel=null;refresh(previous==='column'?`[data-grid-column="${current}"]`:`[data-grid-panel="${previous}"]`);return;}
    if(d.gridRemoveFilter){delete filters[d.gridRemoveFilter];s.checked=[];refresh('[data-grid-panel="filters"]');return;}
    if('gridClearFilters' in d){clearFilters();refresh('[data-grid-panel="filters"]');return;}
    if(d.gridClearLegacy){if(d.gridClearLegacy==='stage')s.filter='Все статусы';else s.mine=false;s.checked=[];refresh();return;}
    if('gridResetColumns' in d){order=columns.map(c=>c.key);hidden=new Set(['company']);report('Исходный вид восстановлен');refresh('[data-grid-reset-columns]');}
  });
  root.addEventListener('input',e=>{if(e.target.matches('[data-grid-value]'))draft.value=e.target.value;});
  root.addEventListener('change',e=>{
    const el=e.target;
    if(el.matches('[data-grid-field]')){openFilter(el.value);return;}
    if(el.matches('[data-grid-op]')){draft.op=el.value;refresh('[data-grid-op]');return;}
    if(el.matches('[data-grid-value]')){draft.value=el.value;return;}
    if(el.matches('[data-grid-sort-field]')){current=el.value;refresh('[data-grid-sort-field]');return;}
    if(el.matches('[data-grid-visible]')){const key=el.dataset.gridVisible;if(key!=='name'){if(el.checked)hidden.delete(key);else hidden.add(key);}refresh(`[data-grid-visible="${key}"]`);}
  });
  root.addEventListener('submit',e=>{
    if(!e.target.matches('[data-grid-filter-form]'))return;e.preventDefault();
    filters[draft.key]={...draft};s.checked=[];
    if(draft.key==='stage'){s.filter='Все статусы';if(draft.op==='eq')s.mobileStage=draft.value;}
    if(draft.key==='owner')s.mine=false;
    report('Фильтр применён: '+col(draft.key).label);panel=null;refresh('[data-grid-panel="filters"]');
  });
  root.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel){e.stopImmediatePropagation();const prev=panel;panel=null;refresh(prev==='column'?`[data-grid-column="${current}"]`:`[data-grid-panel="${prev}"]`);}});
  root.addEventListener('dragstart',e=>{const item=e.target.closest('[data-grid-drag]');if(!item)return;dragged=item.dataset.gridDrag;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragged);});
  root.addEventListener('dragover',e=>{if(dragged&&e.target.closest('[data-grid-drag]')){e.preventDefault();e.dataTransfer.dropEffect='move';}});
  root.addEventListener('drop',e=>{const target=e.target.closest('[data-grid-drag]');if(!target||!dragged)return;e.preventDefault();const from=dragged;dragged=null;reorder(from,target.dataset.gridDrag);});
  root.addEventListener('dragend',()=>{dragged=null;});
  return {apply,toolbar,table,clearFilters,close(){panel=null;}};
};
