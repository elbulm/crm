(function () {
  'use strict';

  var data;
  var currentStep = 1;
  var selectedCandidate = null;
  var decisions = [];
  var workingRows = [];
  var matchingTimer = null;
  var previewFileKey = null;

  function byId(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }
  function money(value) {
    return value == null ? '—' : new Intl.NumberFormat('ru-RU').format(value) + ' ₽';
  }
  function showToast(message) {
    var toast = byId('toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () { toast.classList.remove('is-visible'); }, 2600);
  }
  function statusInfo(row) {
    if (row.status === 'matched') return {text:'Сопоставлено', cls:'good'};
    if (row.status === 'review') return {text:'Нужна проверка', cls:'warn'};
    return {text:'Нет пары', cls:'empty'};
  }

  function showPage(pageId) {
    document.querySelectorAll('.page').forEach(function (page) { page.classList.toggle('is-active', page.id === pageId); });
    document.querySelectorAll('.nav-link').forEach(function (button) { button.classList.toggle('is-active', button.dataset.page === pageId); });
    history.replaceState(null, '', '#' + pageId);
    window.scrollTo({top:0, behavior:'smooth'});
  }

  function renderMappings() {
    byId('mapping-body').innerHTML = data.mappings.map(function (item) {
      function select(value, columns, fileLabel) {
        var options = columns.slice();
        if (options.indexOf(value) < 0) options.push(value);
        options.push('Не используется');
        return '<select aria-label="Колонка для роли ' + escapeHtml(item.role) + ' ' + fileLabel + '">' + options.map(function (option) {
          return '<option' + (option === value ? ' selected' : '') + '>' + escapeHtml(option) + '</option>';
        }).join('') + '</select>';
      }
      return '<tr><td><b>' + escapeHtml(item.role) + '</b></td><td>' + select(item.rfp, data.files.rfp.columns, 'в заявке') + '</td><td>' + select(item.sku, data.files.sku.columns, 'в каталоге') +
        '</td><td><span class="confidence"><progress max="100" value="' + item.confidence + '"></progress><b>' + item.confidence + '%</b></span></td></tr>';
    }).join('');
  }

  function renderWizard() {
    byId('step-number').textContent = currentStep;
    document.querySelectorAll('.wizard-step').forEach(function (step) {
      step.classList.toggle('is-active', Number(step.dataset.step) === currentStep);
    });
    document.querySelectorAll('.stepper li').forEach(function (item, index) {
      item.classList.toggle('is-active', index + 1 === currentStep);
      item.classList.toggle('is-done', index + 1 < currentStep);
    });
    byId('wizard-back').disabled = currentStep === 1;
    byId('wizard-next').hidden = currentStep === 4;
    byId('wizard-next').textContent = currentStep === 3 ? 'Сохранить профиль' : 'Продолжить';
  }

  function renderMass(rows) {
    if (!rows.length) {
      byId('result-body').innerHTML = '<tr><td colspan="4" class="empty-cell">Результаты появятся здесь</td></tr>';
      return;
    }
    byId('result-body').innerHTML = rows.map(function (row) {
      var status = statusInfo(row);
      return '<tr><td><b>' + escapeHtml(row.source) + '</b><br><small>' + escapeHtml(row.sourceId) + '</small></td>' +
        '<td>' + escapeHtml(row.target) + '</td><td><b>' + row.accuracy + '%</b></td><td><span class="tag ' + status.cls + '">' + status.text + '</span></td></tr>';
    }).join('');
  }

  function updateStats(rows) {
    byId('found-stat').textContent = rows.filter(function (row) { return row.status === 'matched'; }).length;
    byId('review-stat').textContent = rows.filter(function (row) { return row.status === 'review'; }).length;
    byId('empty-stat').textContent = rows.filter(function (row) { return row.status === 'empty'; }).length;
  }

  function startMatching() {
    if (matchingTimer) return;
    var processed = 0;
    var total = workingRows.length;
    byId('start-match').disabled = true;
    byId('progress-panel').hidden = false;
    byId('mass-status').textContent = 'Сравниваем позиции по настроенному профилю.';
    renderMass([]);
    updateStats([]);
    matchingTimer = window.setInterval(function () {
      processed += 1;
      var visible = workingRows.slice(0, processed);
      byId('match-progress').value = processed;
      byId('progress-count').textContent = processed + ' из ' + total;
      byId('progress-label').textContent = processed === total ? 'Обработка завершена' : 'Проверяем ' + workingRows[processed - 1].sourceId;
      renderMass(visible);
      updateStats(visible);
      if (processed === total) {
        window.clearInterval(matchingTimer);
        matchingTimer = null;
        byId('start-match').disabled = false;
        byId('start-match').textContent = 'Запустить заново';
        byId('mass-status').textContent = '3 позиции сопоставлены автоматически, 1 ждёт решения, для 1 пары нет.';
        renderExport();
        showToast('Сопоставление завершено');
      }
    }, 360);
  }

  function renderCandidates() {
    byId('candidate-list').innerHTML = data.candidates.map(function (item) {
      return '<button type="button" class="candidate' + (selectedCandidate === item.id ? ' is-selected' : '') + '" data-candidate="' + item.id + '">' +
        '<div class="candidate-head"><div><h2>' + escapeHtml(item.name) + '</h2><p>' + escapeHtml(item.details) + '</p></div><strong>' + item.accuracy + '%</strong></div>' +
        '<div class="candidate-meta"><span>' + escapeHtml(item.brand) + '</span><b>' + money(item.price) + '</b>' +
        (item.recommended ? '<span class="recommended">Лучшее совпадение</span>' : '') + '</div></button>';
    }).join('');
    byId('accept-candidate').disabled = !selectedCandidate;
    byId('decision-hint').textContent = selectedCandidate ? 'Выбран товар ' + selectedCandidate : 'Выберите подходящий товар';
  }

  function addDecision(text) {
    decisions.unshift(new Date().toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}) + ' · ' + text);
    byId('decision-history').innerHTML = decisions.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('');
  }

  function acceptCandidate() {
    var candidate = data.candidates.find(function (item) { return item.id === selectedCandidate; });
    if (!candidate) return;
    workingRows[2].targetId = candidate.id;
    workingRows[2].target = candidate.name;
    workingRows[2].accuracy = candidate.accuracy;
    workingRows[2].status = 'matched';
    workingRows[2].price = candidate.price;
    addDecision('подтверждён ' + candidate.id + ' для RFP-003');
    renderMass(workingRows);
    updateStats(workingRows);
    renderExport();
    showToast('Решение сохранено в журнале');
  }

  function rejectAll() {
    workingRows[2].targetId = null;
    workingRows[2].target = 'Подходящий товар не найден';
    workingRows[2].accuracy = 0;
    workingRows[2].status = 'empty';
    selectedCandidate = null;
    renderCandidates();
    addDecision('все кандидаты отклонены для RFP-003');
    renderMass(workingRows);
    updateStats(workingRows);
    renderExport();
    showToast('Позиция отмечена как несопоставленная');
  }

  function askLlm() {
    var button = byId('ask-llm');
    var note = byId('ai-note');
    button.disabled = true;
    button.textContent = 'Анализируем характеристики…';
    note.hidden = true;
    window.setTimeout(function () {
      selectedCandidate = 'SKU-310';
      renderCandidates();
      note.innerHTML = '<b>Рекомендация: Dell P2723DE.</b><br>Укладывается в бюджет, поддерживает USB-C с запасом по мощности и соответствует QHD. У LG питание 60 Вт, ниже требования.';
      note.hidden = false;
      button.disabled = false;
      button.textContent = 'Обновить рекомендацию ИИ';
      showToast('Рекомендация готова');
    }, 650);
  }

  function exportRows() {
    return workingRows.map(function (row) {
      return {
        'ID заявки': row.sourceId,
        'Позиция заявки': row.source,
        'ID товара': row.targetId || '',
        'Подобранный товар': row.target,
        'Совпадение, %': row.accuracy,
        'Статус': statusInfo(row).text,
        'Цена, руб.': row.price || ''
      };
    });
  }

  function renderExport() {
    var matched = workingRows.filter(function (row) { return row.status === 'matched'; }).length;
    byId('confirmed-export').textContent = matched;
    byId('attention-export').textContent = workingRows.length - matched;
    byId('export-body').innerHTML = workingRows.map(function (row) {
      return '<tr><td>' + row.sourceId + '</td><td>' + escapeHtml(row.target) + '</td><td>' + row.accuracy + '%</td></tr>';
    }).join('');
  }

  function downloadBlob(contents, type, filename) {
    var url = URL.createObjectURL(new Blob([contents], {type:type}));
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function downloadExport() {
    var rows = exportRows();
    if (byId('export-format').value === 'json') {
      var columns = Object.keys(rows[0]);
      var payload = window.XcomExportWorkspace ?
        window.XcomExportWorkspace.buildJsonPayload(rows, columns, {database:'demo', report:'matching_export'}) :
        {meta:{database:'demo', report:'matching_export'}, rows:rows};
      downloadBlob(JSON.stringify(payload, null, 2), 'application/json;charset=utf-8', 'xcom-matching-demo.json');
      showToast('JSON подготовлен');
      return;
    }
    if (!window.XLSX) {
      showToast('Библиотека Excel не загрузилась');
      return;
    }
    var sheet = window.XLSX.utils.json_to_sheet(rows);
    var book = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(book, sheet, 'Сопоставление');
    window.XLSX.writeFile(book, 'xcom-matching-demo.xlsx');
    showToast('Excel подготовлен');
  }

  function downloadSourceFile(fileKey) {
    var file = data.files && data.files[fileKey];
    if (!file || !window.XLSX) {
      showToast('Не удалось подготовить Excel');
      return;
    }
    var sheet = window.XLSX.utils.json_to_sheet(file.rows, {header:file.columns});
    var book = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(book, sheet, file.sheet);
    window.XLSX.writeFile(book, file.filename);
    showToast('Файл «' + file.filename + '» подготовлен');
  }

  function renderFilePreview(fileKey) {
    var file = data.files && data.files[fileKey];
    if (!file) return;
    byId('file-preview-title').textContent = file.filename;
    byId('file-preview-meta').textContent = 'Лист «' + file.sheet + '», ' + file.rows.length + ' строк';
    byId('file-preview-head').innerHTML = '<tr>' + file.columns.map(function (column) {
      return '<th>' + escapeHtml(column) + '</th>';
    }).join('') + '</tr>';
    byId('file-preview-body').innerHTML = file.rows.map(function (row) {
      return '<tr>' + file.columns.map(function (column) {
        return '<td>' + escapeHtml(row[column]) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    previewFileKey = fileKey;
    byId('file-preview').hidden = false;
    byId('file-preview').scrollIntoView({behavior:'smooth', block:'nearest'});
  }

  function bindEvents() {
    document.addEventListener('click', function (event) {
      var pageButton = event.target.closest('[data-page], [data-go]');
      if (pageButton) showPage(pageButton.dataset.page || pageButton.dataset.go);
      var candidate = event.target.closest('[data-candidate]');
      if (candidate) {
        selectedCandidate = candidate.dataset.candidate;
        renderCandidates();
      }
      var previewButton = event.target.closest('[data-preview-file]');
      if (previewButton) renderFilePreview(previewButton.dataset.previewFile);
      var downloadButton = event.target.closest('[data-download-file]');
      if (downloadButton) downloadSourceFile(downloadButton.dataset.downloadFile);
    });
    byId('wizard-next').addEventListener('click', function () {
      if (currentStep < 4) currentStep += 1;
      renderWizard();
      if (currentStep === 4) showToast('Профиль «Офисное оборудование» сохранён');
    });
    byId('wizard-back').addEventListener('click', function () { if (currentStep > 1) currentStep -= 1; renderWizard(); });
    byId('threshold').addEventListener('input', function (event) { byId('threshold-value').textContent = event.target.value + '%'; });
    byId('start-match').addEventListener('click', startMatching);
    byId('ask-llm').addEventListener('click', askLlm);
    byId('accept-candidate').addEventListener('click', acceptCandidate);
    byId('reject-all').addEventListener('click', rejectAll);
    byId('download-export').addEventListener('click', downloadExport);
    byId('file-preview-download').addEventListener('click', function () { downloadSourceFile(previewFileKey); });
    byId('close-file-preview').addEventListener('click', function () { byId('file-preview').hidden = true; });
  }

  fetch('./demo-data.json')
    .then(function (response) { if (!response.ok) throw new Error('Данные демо недоступны'); return response.json(); })
    .then(function (payload) {
      data = payload;
      workingRows = JSON.parse(JSON.stringify(data.results));
      renderMappings();
      renderWizard();
      renderCandidates();
      renderExport();
      bindEvents();
      var initialPage = location.hash.slice(1);
      showPage(['setup','mass','review','export'].indexOf(initialPage) >= 0 ? initialPage : 'setup');
    })
    .catch(function (error) {
      document.querySelector('main').innerHTML = '<div class="panel"><h1>Демо не загрузилось</h1><p>' + escapeHtml(error.message) + '</p></div>';
    });
})();
