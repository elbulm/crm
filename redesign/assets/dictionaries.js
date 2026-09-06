/* Browse the actual sources used by record fields, without copying their values. */
window.IntegramDictionaries = (() => {
  const M = IntegramModel, U = IntegramUI, {E, btn} = U;
  const count = n => new Intl.NumberFormat('ru-RU').format(n);
  const noun=(n,one,few,many)=>n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many;
  function sources(data) {
    const refs = new Map(), lists = [];
    for (const table of data.tables) for (const field of table.fields) {
      const use = {table: table.id, key: field.key, tableName: table.name, label: field.label};
      if (field.type === 'reference') {
        const target = M.table(data, field.ref);
        if (!target) continue;
        if (!refs.has(target.id)) refs.set(target.id, {kind: 'reference', table: target.id, name: target.name, size: target.rows.length, uses: []});
        refs.get(target.id).uses.push(use);
      } else if (field.type === 'choice') lists.push({kind: 'choice', table: table.id, key: field.key, name: field.label, size: field.options.length, uses: [use]});
    }
    return [...refs.values(), ...lists];
  }
  function catalog(a) {
    const all = sources(a.data), needle = (a.s.dictionarySearch || '').toLocaleLowerCase('ru');
    const shown = all.filter(x => [x.name, ...x.uses.map(u => u.tableName + ' ' + u.label)].join(' ').toLocaleLowerCase('ru').includes(needle));
    return `<div class="heading"><div><h2 tabindex="-1" data-focus="heading">Справочники</h2><small>${all.length} ${noun(all.length,'источник','источника','источников')} значений</small></div></div><p class="dictionary-intro">Здесь находятся значения выпадающих полей. Откройте справочник, чтобы посмотреть записи и поля, которые его используют.</p><label class="search catalog-search"><span class="sr-only">Найти справочник</span><input type="search" placeholder="Название справочника, таблицы или поля…" value="${E(a.s.dictionarySearch || '')}" data-dictionary-search data-focus="dictionary-search"></label>${[['reference','Таблицы-справочники'],['choice','Списки значений']].map(([kind, title]) => {
      const group = shown.filter(x => x.kind === kind);
      return group.length ? `<section class="dictionary-group" aria-label="${title}"><h3>${title} <span class="secondary">${group.length}</span></h3><div class="dictionary-catalog">${group.map(x => `<button type="button" class="dictionary-source" data-focus="source-${E(x.table)}-${E(x.key||'table')}" data-action="dictionary-open" data-kind="${x.kind}" data-table="${E(x.table)}"${x.key ? ` data-key="${E(x.key)}"` : ''}><span><strong>${E(x.name)}</strong><small>${E(x.kind==='reference'?'Используется в '+x.uses.length+' '+noun(x.uses.length,'поле','полях','полях'):x.uses[0].tableName)}</small></span><span class="dictionary-size">${count(x.size)} ${kind === 'choice' ? noun(x.size,'значение','значения','значений') : noun(x.size,'запись','записи','записей')}<span aria-hidden="true"> →</span></span></button>`).join('')}</div></section>` : '';
    }).join('')}${!shown.length ? '<div class="empty"><h3>Справочники не найдены</h3><p>Попробуйте название поля или таблицы.</p></div>' : ''}`;
  }
  function dictionary(a) {
    const d = a.s.dictionary, table = M.table(a.data, d?.table), field = table?.fields.find(f => f.key === d?.key && f.type === 'choice');
    if (!field) return `<div class="empty"><h2 tabindex="-1" data-focus="heading">Список больше недоступен</h2><p>Поле удалено или его тип изменён.</p>${btn('Все справочники','dictionaries')}</div>`;
    const usage = new Map(); let empty = 0;
    for (const row of table.rows) { const value = row[field.key]; if (value == null || value === '') empty++; else usage.set(String(value), (usage.get(String(value)) || 0) + 1); }
    const needle = (d.search || '').toLocaleLowerCase('ru');
    let values = field.options.map((value, index) => ({value, index, used: usage.get(value) || 0})).filter(x => x.value.toLocaleLowerCase('ru').includes(needle));
    if (d.sort === 'asc' || d.sort === 'desc') values.sort((x, y) => x.value.localeCompare(y.value, 'ru', {numeric:true}) * (d.sort === 'desc' ? -1 : 1));
    const pages = Math.max(1, Math.ceil(values.length / 50)); d.page = Math.max(1, Math.min(d.page || 1, pages));
    const rows = values.slice((d.page - 1) * 50, d.page * 50);
    return `<div class="crumb">Справочники / ${E(table.name)}</div><div class="heading"><div><h2 tabindex="-1" data-focus="heading">${E(field.label)}</h2><small data-dictionary-count>${count(values.length)} из ${count(field.options.length)} значений</small></div>${btn('Настроить список','dictionary-edit',{table:table.id,key:field.key})}</div><p class="dictionary-intro">Значения поля «${E(field.label)}» в таблице «${E(table.name)}». Изменения списка появятся в выпадающих полях и фильтрах.</p><div class="dictionary-tools"><label class="search"><span class="sr-only">Найти значение справочника</span><input type="search" placeholder="Найти значение…" value="${E(d.search || '')}" data-dictionary-value-search data-focus="dictionary-value-search"></label><label>Порядок ${U.select('dictionary-sort',[['source','Как в выпадающем списке'],['asc','От А до Я'],['desc','От Я до А']],d.sort || 'source',{'data-change':'dictionary-sort'})}</label></div><div class="dictionary-table-wrap"><table class="dictionary-values"><caption class="sr-only">Значения справочника ${E(field.label)}</caption><thead><tr><th scope="col">Значение</th><th scope="col">В записях</th><th scope="col"><span class="sr-only">Действия</span></th></tr></thead><tbody>${rows.map(x => `<tr data-dictionary-value="${E(x.value)}"><th scope="row">${E(x.value)}</th><td>${count(x.used)}</td><td>${btn('Открыть записи','dictionary-usage',{table:table.id,key:field.key,value:x.value},'quiet',{'aria-label':'Записи со значением: '+x.value,disabled:!x.used})}</td></tr>`).join('')}</tbody></table></div>${!values.length ? '<p class="empty">Значения не найдены.</p>' : ''}<div class="bottom"><span>${count(values.length)} значений</span><div class="pagination">${btn('Назад','dictionary-page',{delta:-1},'',{disabled:d.page===1,'aria-label':'Предыдущая страница справочника'})}<span>${d.page} / ${pages}</span>${btn('Далее','dictionary-page',{delta:1},'',{disabled:d.page===pages,'aria-label':'Следующая страница справочника'})}</div></div>${empty ? `<p class="dictionary-empty-count">Поле не заполнено у ${count(empty)} записей. ${btn('Посмотреть','dictionary-usage',{table:table.id,key:field.key,empty:'true'},'quiet',{'aria-label':'Записи без значения: '+field.label})}</p>` : ''}`;
  }
  function banner(a) {
    const trail = a.dictionaryTrail || [], previous = trail.at(-1); let html = '';
    if (previous) {
      const title = previous.state.screen === 'record' ? '← К карточке' : previous.state.screen === 'schema' ? '← К структуре таблицы' : previous.state.screen === 'dictionaries' ? '← К справочникам' : previous.state.screen === 'dictionary' ? '← К списку значений' : '← Вернуться к таблице';
      html += `<div class="dictionary-return">${btn(title,'dictionary-back',{},'quiet')}</div>`;
    }
    if (a.s.dictionaryContext && !['dictionaries','dictionary'].includes(a.s.screen)) {
      const uses = sources(a.data).find(x => x.kind === 'reference' && x.table === a.t.id)?.uses || [];
      if (uses.length) html += `<details class="dictionary-uses"><summary>Этот справочник используется в ${uses.length} ${noun(uses.length,'поле','полях','полях')}</summary><ul>${uses.map(u => `<li>${btn(u.tableName+' / '+u.label,'dictionary-usage',{table:u.table,key:u.key,filled:'true'},'reference')}</li>`).join('')}</ul></details>`;
    }
    return html;
  }
  return {sources, catalog, dictionary, banner};
})();

(() => {
  const P = IntegramApp.prototype, M = IntegramModel;
  const action = P.action, changeTable = P.changeTable, onInput = P.onInput, onChange = P.onChange;
  P.dictionaryPush = function(focus) {
    this.dictionaryTrail ??= [];
    this.dictionaryTrail.push({state:M.clone(this.s),view:M.clone(this.v),scroll:this.getScroll(),pageScroll:{top:scrollY,left:scrollX},dirty:this.dirty(),focus:focus||document.activeElement?.dataset.focus});
  };
  P.dictionaryEnter = function(table, screen) {
    Object.assign(this.s,{tableId:table,screen,search:'',page:1,panel:null,checked:new Set(),stack:[],inline:null,draft:{},errors:{},schemaDraft:null,mobileStage:'all',tableScroll:null,workspaceMenu:false,dictionaryContext:true});
  };
  P.pendingDictionaryDraft = function(){return !!this.dictionaryTrail?.some(x=>x.dirty);};
  P.canLeaveWorkspace = function(){return this.canLeave()&&(!this.pendingDictionaryDraft()||confirm('Есть несохранённые изменения в исходной форме. Покинуть справочник и отменить их?'));};
  P.changeTable = function(id) {
    if (!this.canLeaveWorkspace()) return;
    this.dictionaryTrail=[];this.s.dictionaryContext=false;changeTable.call(this,id);
  };
  P.action = function(name,d,e) {
    if (name === 'dictionaries') {
      if (this.s.screen === 'dictionaries') return;
      this.dictionaryPush(); this.dictionaryEnter(this.t.id,'dictionaries'); this.s.dictionarySearch=''; this.render('heading'); return;
    }
    if (name === 'dictionary-source' || name === 'dictionary-open') {
      let table = M.table(this.data,d.table), field = table?.fields.find(f=>f.key===d.key);
      const kind = name === 'dictionary-source' ? field?.type : d.kind;
      if (kind === 'reference' && name === 'dictionary-source') table = M.table(this.data,field.ref);
      if (!table || !['reference','choice'].includes(kind) || kind === 'choice' && field?.type !== 'choice') return;
      this.dictionaryPush(name === 'dictionary-source' ? 'dictionary-'+d.key : undefined);
      this.dictionaryEnter(table.id,kind === 'choice' ? 'dictionary' : 'list');
      this.s.dictionary={table:table.id,key:field?.key,search:'',page:1,sort:'source'};
      if (kind === 'reference') {this.dictionaryTrail.at(-1).targetView={table:table.id,view:M.clone(this.v)};this.entry.current=M.defaults(table,this.id,this.mode==='large');this.v.screen='table';}
      this.render('heading'); return;
    }
    if (name === 'dictionary-back') {
      if (!this.canLeave()) return;
      const previous=this.dictionaryTrail?.pop(); if (!previous) return;
      if(previous.targetView&&this.config[previous.targetView.table])this.config[previous.targetView.table].current=previous.targetView.view;
      const status={message:this.s.message,storageErrors:this.s.storageErrors};
      this.s={...previous.state,...status,tableScroll:previous.scroll};
      if (!M.table(this.data,this.s.tableId)) {this.s.tableId=this.data.tables[0].id;this.s.screen='dictionaries';}
      this.entry.current=M.normalize(this.t,previous.view,this.id,this.mode==='large');
      this.persistView();this.render(previous.focus || (this.s.screen==='record'?'record-heading':'heading'));if(previous.pageScroll)window.scrollTo(previous.pageScroll);return;
    }
    if (name === 'dictionary-page') {this.s.dictionary.page+=Number(d.delta);this.render('heading');return;}
    if (name === 'dictionary-usage') {
      this.dictionaryPush();this.dictionaryEnter(d.table,'list');this.dictionaryTrail.at(-1).targetView={table:d.table,view:M.clone(this.v)};this.entry.current=M.defaults(this.t,this.id,this.mode==='large');this.v.screen='table';
      this.v.filters=[{id:this.newId('filter'),key:d.key,op:d.empty==='true'?'empty':d.filled==='true'?'filled':'eq',value:d.value || ''}];this.render('heading');return;
    }
    if (name === 'dictionary-edit') {
      this.dictionaryPush();this.dictionaryEnter(d.table,'schema');this.s.schemaDraft=M.clone(this.t.fields.find(f=>f.key===d.key));this.s.newField=false;this.s.panelError='';this.render('schema-label');return;
    }
    if(['catalog','undo','redo','table-delete'].includes(name)&&!this.canLeaveWorkspace())return;
    const oldData=this.data,oldScreen=this.s.screen;const result=action.call(this,name,d,e);
    if (['catalog','undo','redo','reset','table-delete'].includes(name) && (oldData!==this.data||oldScreen!==this.s.screen) && ['catalog','list'].includes(this.s.screen)) {this.dictionaryTrail=[];this.s.dictionaryContext=false;this.render();}
    return result;
  };
  P.onInput = function(e) {
    if (e.target.matches('[data-dictionary-search]')) {this.s.dictionarySearch=e.target.value;this.render('dictionary-search');return;}
    if (e.target.matches('[data-dictionary-value-search]')) {this.s.dictionary.search=e.target.value;this.s.dictionary.page=1;this.render('dictionary-value-search');return;}
    return onInput.call(this,e);
  };
  P.onChange = function(e) {
    if(e.target.dataset.change==='dictionary-sort'){this.s.dictionary.sort=e.target.value;this.s.dictionary.page=1;this.render();return;}
    if(e.target.dataset.change==='table-mobile'&&e.target.value==='__dictionaries__'){this.action('dictionaries',{});return;}
    return onChange.call(this,e);
  };
})();
