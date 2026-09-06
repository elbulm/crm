/* Prepared views and real interaction steps; records are never changed by a tutorial. */
window.IntegramScenarios=(()=>{
'use strict';
const M=IntegramModel;
const definitions={
 registry:{title:'Общий реестр',table:'deals'},
 groups:{title:'От контрагента — к договорам',table:'deals'},
 columns:{title:'36 полей в рабочей таблице',table:'deals'},
 pivot:{title:'Платежи по периодам',table:'payments'},
 hierarchy:{title:'Подзадача и её контекст',table:'tasks'},
 relations:{title:'Состав конкретной поставки',table:'deals'},
 dictionaries:{title:'От значения списка — к записям',table:'deals'}
};
function prepare(a,id){
 const def=definitions[id]||definitions.registry;
 if(!M.table(a.data,def.table))throw Error('Для этого примера нужен набор «Рабочие крайности».');
 a.advancedRouteLoaded=true;
 const storageErrors={...a.s.storageErrors};
 a.s={tableId:def.table,screen:'list',search:'',page:1,checked:new Set(),panel:null,filterDraft:null,recordId:null,recordTab:0,context:[],draft:{},errors:{},stack:[],mobileStage:'all',message:'',storageErrors,inline:null};
 a.dictionaryTrail=[];
 a.entry.current=M.defaults(a.t,'contour',a.mode==='large');
 const v=a.v;
 v.screen='table';v.filters=[];v.sorts=[];v.groups=[];v.groupRules=[];v.recordScope=null;
 if(id==='groups'){
  v.groupRules=[{key:'company',mode:'value'},{key:'stage',mode:'value'},{key:'date',mode:'month'}];v.groups=v.groupRules.map(r=>r.key);v.groupOptions.depth=0;
 }else if(id==='columns'){
  v.hidden=[];v.bands=IntegramColumns.defaults(a.t);
 }else if(id==='pivot'){
  v.screen='pivot';v.pivot=IntegramPivot.defaults(a.data,a.t);
  Object.assign(v.pivot,{rows:[{key:'direction',mode:'value'},{key:'stage',mode:'value'}],columns:[{key:'date',mode:'year'},{key:'date',mode:'quarter'}],rowDepth:1,columnDepth:1,maxColumns:30});
 }else if(id==='hierarchy'){
  v.screen='hierarchy';v.hierarchy=IntegramHierarchy.defaults(a.data,a.t);v.hierarchy.parentKey='parent';v.hierarchy.relations=[];v.hierarchy.expanded=[];v.hierarchy.collapsed=[];
 }else if(id==='relations'){
  v.screen='hierarchy';v.hierarchy=IntegramHierarchy.defaults(a.data,a.t);v.hierarchy.parentKey='';v.hierarchy.relations=['items::deal'];
 }else if(id==='dictionaries'){
  a.s.screen='dictionaries';a.s.dictionaryContext=true;
 }
 a.persistView();a.render();
}
function steps(a,id){
 const one=selector=>()=>[...a.root.querySelectorAll(selector)].find(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden')||null;
 const click=(target,title,body,done)=>({target:typeof target==='string'?one(target):target,title,body,event:'click',done});
 const result=(target,title,body)=>({target:typeof target==='string'?one(target):target,title,body,next:'Завершить обучение'});
 const record='[data-form="record"]',open='tr[data-row] [data-action="open"]';
 if(id==='groups')return [
  click('[data-group-depth="0"] [data-action="g-toggle"]','Раскройте контрагента','Нажмите стрелку рядом с контрагентом. Внутри появятся этапы его договоров; количество и суммы относятся ко всей группе.',()=>!!a.root.querySelector('[data-group-depth="1"]')),
  click('[data-group-depth="1"] [data-action="g-toggle"]','Перейдите на следующий уровень','Раскройте этап. Договоры внутри него разделены по месяцам — так видно, как распределены сроки.',()=>!!a.root.querySelector('[data-group-depth="2"]')),
  click('[data-group-depth="1"] [data-action="g-drill"]','Проверьте, из чего сложился итог','Нажмите «Записи» у этапа. Откроется плоский список только его договоров, со всеми обычными действиями таблицы.',()=>!!a.s.drill&&a.v.screen==='table'&&!a.v.groupRules.length),
  {target:one('.drill-context'),title:'Это точный состав выбранной группы',body:'Число записей в выборке относится к выбранному этапу этого контрагента. Список можно фильтровать, сортировать и открывать отдельные договоры.',next:'К возврату'},
  click('[data-action="advanced-return"]','Вернитесь к общей картине','Нажмите кнопку возврата. Раскрытые уровни сохранятся, а итоги снова будут видны рядом с группами.',()=>!a.s.drill&&a.v.groupRules.length===3),
  result('.group-controls','Готово: от итога к записям и обратно','Вы прошли от контрагента через этап к срокам, проверили состав группы и вернулись к тому же представлению. Дальше попробуйте «Группы», чтобы задать свои уровни.')
 ];
 if(id==='columns'){
  const band=()=>a.v.bands.find(b=>b.id==='finance');
  const keep='amount',label=a.t.fields.find(f=>f.key===keep)?.label||'Сумма';
  const list=[
   click('[data-action="band-toggle"][data-id="finance"]','Сверните финансовую секцию','Нажмите «Финансы». Столбцы этой секции свернутся до опорного поля; данные и остальные секции останутся доступны.',()=>!!band()?.collapsed),
   click('[data-action="panel"][data-panel="columns"]','Выберите, что оставить на виду','Откройте «Столбцы». Здесь настраивается, какие поля объединены в секции и что видно при сворачивании.',()=>a.s.panel==='columns'),
   {target:one('[data-band-keep="finance"]'),title:'Оставьте сумму договора',body:'В списке «Оставить при сворачивании» выберите «'+label+'». Секция останется свёрнутой, но опорным показателем станет сумма.',event:'change',done:()=>band()?.keep[0]===keep},
   click('[data-action="panel-close"]','Посмотрите на получившуюся таблицу','Закройте настройки. Вместо всех финансовых полей в секции теперь показывается выбранная сумма.',()=>!a.s.panel),
   result('[data-action="band-toggle"][data-id="finance"]','Готово: широкая таблица стала короче','Финансовые поля доступны за одним нажатием на секцию. Точно так же можно свернуть сроки, ответственных и подробности — без удаления столбцов.')
  ];
  if(a.mobile.matches)list.unshift(click('[data-action="more"]','Откройте дополнительные действия','Нажмите «Ещё». На узком экране здесь находятся настройки групп и столбцов.',()=>!!a.s.more));
  return list;
 }
 if(id==='pivot')return [
  click('[data-action="pivot-toggle-row"]','Раскройте направление платежей','Нажмите стрелку у направления. Вложенный уровень покажет состояния платежей, а итог направления останется доступен.',()=>a.v.pivot.rowExpanded.length>0),
  click('[data-action="pivot-toggle-column"]','Раскройте период','Нажмите стрелку у года. В столбцах появятся кварталы: строки и столбцы сводной раскрываются независимо.',()=>a.v.pivot.columnExpanded.length>0),
  click('tbody [data-action="pivot-drill"]:not(:disabled)','Откройте исходные платежи','Нажмите выделенное значение. За каждой ячейкой стоят конкретные записи — сейчас вы увидите именно их.',()=>!!a.s.drill&&a.v.screen==='table'),
  {target:one('.drill-context'),title:'Сумму можно проверить по документам',body:'Вы открыли записи выбранного пересечения направления и периода. Это обычная таблица: доступны поиск, фильтрация и карточки платежей.',next:'К возврату'},
  click('[data-action="advanced-return"]','Вернитесь в сводную','Нажмите кнопку возврата. Раскрытые направления и периоды останутся в том же состоянии.',()=>a.v.screen==='pivot'&&!a.s.drill),
  result('.pivot-toolbar','Готово: сводная с проверяемыми итогами','Вы раскрыли обе оси и проверили исходные записи ячейки. В настройках сводной можно менять уровни, периоды и расчётные показатели.')
 ];
 if(id==='hierarchy'){
  const child=a.t.rows.find(r=>r.parent&&a.t.rows.some(p=>String(p.id)===String(r.parent))),parent=String(child?.parent||''),childId=String(child?.id||'');
  const sel=id=>CSS.escape(id);
  return [
   click('[data-action="h-toggle"][data-id="'+sel(parent)+'"]','Раскройте задачу','Нажмите стрелку рядом с родительской задачей. Под ней появятся дочерние записи с отступом.',()=>!!a.root.querySelector('[data-h-node="'+sel(childId)+'"]')),
   {target:one('[data-search]'),title:'Найдите одну подзадачу',body:'Введите в поиск «'+childId+'». Останется нужная подзадача, а родитель будет показан для контекста и не попадёт в число найденных записей.',event:'input',done:()=>a.s.search===childId&&a.rows.length===1&&!!a.root.querySelector('.hierarchy-context')},
   click('[data-h-node="'+sel(childId)+'"] [data-action="h-open"]','Откройте найденную подзадачу','Нажмите название дочерней записи. В карточке доступны её поля, ответственный и связи.',()=>a.s.screen==='record'&&a.s.recordId===childId),
   click('[data-action="back"]','Вернитесь к дереву','Нажмите «К списку». Поиск и связь с родительской задачей сохранятся.',()=>a.s.screen==='list'&&!!a.root.querySelector('.hierarchy-context')),
   result('.hierarchy-context','Готово: запись найдена вместе с контекстом','В выборке одна подзадача, а её родитель показан отдельно для ориентира. Очистите поиск, чтобы снова работать со всем деревом.')
  ];
 }
 if(id==='relations')return [
  click('[data-action="h-related-toggle"]','Посмотрите состав договора','Нажмите «Позиции поставок» у первого договора. Связанные строки откроются прямо под ним, со своими столбцами.',()=>!!a.root.querySelector('.hierarchy-related')),
  click('.hierarchy-related [data-action="related-list"]','Откройте весь состав отдельно','Нажмите кнопку полного списка. Из 50 000 позиций будут выбраны только те, которые относятся к этому договору.',()=>a.s.tableId==='items'&&a.s.screen==='list'),
  click(open,'Проверьте позицию','Откройте первую позицию. В карточке доступны количество, единица измерения, товар и связанный договор.',()=>a.s.screen==='record'),
  click('[data-action="reference-back"]','Вернитесь к исходному договору','Нажмите кнопку возврата к исходной таблице. Раскрытый состав договора останется на месте.',()=>a.s.tableId==='deals'&&a.s.screen==='list'&&!!a.root.querySelector('.hierarchy-related')),
  result('.hierarchy-related','Готово: связь между двумя таблицами видна','Вы проверили состав договора в отдельной выборке большой таблицы и вернулись к исходной записи. У связанных строк собственные поля и обычные карточки.')
 ];
 if(id==='dictionaries')return [
  click('[data-action="dictionary-open"][data-kind="choice"][data-table="deals"][data-key="stage"]','Откройте источник выпадающего списка','Нажмите справочник «Этап» для договоров. Здесь отдельно видны все допустимые значения и число записей, в которых они используются.',()=>a.s.screen==='dictionary'),
  click('[data-action="dictionary-usage"]:not(:disabled)','Найдите записи с одним значением','Нажмите «Открыть записи» напротив выделенного значения. Таблица откроется с точным фильтром по нему.',()=>a.s.screen==='list'&&a.v.filters.some(f=>f.key==='stage')),
  click(open,'Откройте одну из найденных записей','Нажмите название договора. Значение в его выпадающем поле берётся из того же справочника.',()=>a.s.screen==='record'),
  click('[data-action="dictionary-back"]','Вернитесь к источнику','Нажмите кнопку возврата в справочник. Так можно пройти от значения к его использованию и обратно.',()=>a.s.screen==='dictionary'),
  result('.dictionary-values','Готово: список и его использование связаны','Это доступный отдельно источник значений, а не скрытый набор вариантов в поле. Кнопка «Настроить список» позволяет управлять его содержимым.')
 ];
 const example=a.t.rows.find(r=>r.id!=null),token=String(example?.id||'');
 return [
  {target:one('[data-search]'),title:'Найдите конкретный договор',body:'Введите в поиск «'+token+'». Поиск проверяет идентификатор, поля записи и подписи связей — большая таблица сузится до нужной записи.',event:'input',done:()=>a.s.search===token&&a.rows.length>0&&a.rows.length<a.t.rows.length},
  click(open,'Откройте найденную запись','Нажмите название договора. Его поля откроются в карточке. После просмотра можно вернуться к той же выборке.',()=>a.s.screen==='record'),
  click('[data-action="record-tab"][data-tab="1"]','Посмотрите связанные данные','Нажмите «Связи». Здесь видны записи других таблиц, которые ссылаются на этот договор.',()=>a.s.recordTab===1),
  click('[data-action="back"]','Вернитесь в реестр','Нажмите «К списку». Поиск сохранится: не придётся находить договор заново.',()=>a.s.screen==='list'),
  result('[data-search]','Готово: договор найден и проверен','Очистите поиск, чтобы вернуть все записи. Фильтры уточняют выборку, заголовки столбцов задают сортировку, а «Столбцы» меняют состав и порядок полей. Обучение всегда можно запустить снова.')
 ];
}
return {definitions,prepare,steps};
})();
