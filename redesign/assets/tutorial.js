(function () {
  'use strict';
  let current = null;
  let serial = 0;
  const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
  const focusable = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function start(config) {
    if (!config || !Array.isArray(config.steps) || !config.steps.length) return false;
    stop({silent: true});
    const token = ++serial;
    const abort = new AbortController();
    const state = current = {
      config, index: 0, token, abort, target: null, description: null,
      pending: null, frame: 0, timer: 0, missingTimer: 0, entered: false,
      previousFocus: document.activeElement, hasFocused: false, missing: false
    };
    const root = document.createElement('div');
    root.id = 'integram-tour';
    root.className = 'ig-tour';
    root.dataset.tourId = String(config.id || 'guide');
    root.innerHTML = '<div class="ig-tour-spotlight" aria-hidden="true" hidden></div><section class="ig-tour-card" role="region" aria-label="Пошаговое обучение"><div class="ig-tour-top"><span class="ig-tour-progress"></span><button type="button" class="ig-tour-skip" data-tour-action="skip" aria-label="Пропустить обучение">Пропустить</button></div><p class="ig-tour-name"></p><h2 class="ig-tour-heading" tabindex="-1"></h2><p class="ig-tour-body"></p><p class="ig-tour-missing" hidden>Нужный элемент сейчас не виден. Вернитесь к нему или начните этот пример заново.</p><div class="ig-tour-actions"><button type="button" class="ig-tour-locate" data-tour-action="locate">К нужному элементу</button><button type="button" class="ig-tour-restart" data-tour-action="restart" hidden>Начать заново</button><button type="button" class="ig-tour-next" data-tour-action="next" hidden>Далее</button></div></section><div class="ig-tour-live" role="status" aria-live="polite" aria-atomic="true"></div>';
    document.body.appendChild(root);
    const els = state.els = {
      root, card: root.querySelector('.ig-tour-card'), spot: root.querySelector('.ig-tour-spotlight'),
      progress: root.querySelector('.ig-tour-progress'), name: root.querySelector('.ig-tour-name'),
      heading: root.querySelector('.ig-tour-heading'), body: root.querySelector('.ig-tour-body'),
      missing: root.querySelector('.ig-tour-missing'), locate: root.querySelector('.ig-tour-locate'),
      restart: root.querySelector('.ig-tour-restart'), next: root.querySelector('.ig-tour-next'), live: root.querySelector('.ig-tour-live')
    };
    els.body.id = 'integram-tour-description-' + token;
    els.name.textContent = config.title || 'Знакомство с Интеграмом';
    const valid = () => current === state;
    const step = () => config.steps[state.index];

    function resolve() {
      try {
        const value = step().target;
        const target = typeof value === 'function' ? value() : typeof value === 'string' ? document.querySelector(value) : null;
        return target instanceof Element && target.isConnected && !root.contains(target) && target.getClientRects().length && getComputedStyle(target).visibility !== 'hidden' ? target : null;
      } catch (_) { return null; }
    }

    function releaseTarget() {
      if (!state.target) return;
      const element = state.target;
      const tokens = (element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).filter(id => id !== els.body.id);
      if (tokens.length) element.setAttribute('aria-describedby', tokens.join(' '));
      else if (state.description === '') element.setAttribute('aria-describedby', '');
      else element.removeAttribute('aria-describedby');
      state.resize.unobserve(element);
      state.target = null;
      state.description = null;
    }
    state.releaseTarget = releaseTarget;

    function setTarget(target) {
      if (target === state.target) return;
      releaseTarget();
      state.target = target;
      if (target) {
        state.description = target.getAttribute('aria-describedby');
        const ids = (state.description || '').split(/\s+/).filter(Boolean);
        ids.push(els.body.id);
        target.setAttribute('aria-describedby', Array.from(new Set(ids)).join(' '));
        state.resize.observe(target);
      }
    }

    function focusTarget() {
      const target = state.target;
      if (!target) return;
      const item = target.matches(focusable) ? target : target.querySelector(focusable);
      if (item) item.focus({preventScroll: true});
      else {
        const old = target.getAttribute('tabindex');
        target.setAttribute('tabindex', '-1');
        target.focus({preventScroll: true});
        if (old === null) target.removeAttribute('tabindex');
        else target.setAttribute('tabindex', old);
      }
    }

    function reveal(shouldFocus) {
      if (!state.target) return;
      state.target.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'});
      if (shouldFocus) focusTarget();
      schedule();
    }

    function viewport() {
      const vv = window.visualViewport;
      return {left: vv ? vv.offsetLeft : 0, top: vv ? vv.offsetTop : 0, width: vv ? vv.width : document.documentElement.clientWidth, height: vv ? vv.height : window.innerHeight};
    }

    function position() {
      if (!valid()) return;
      const v = viewport(), margin = 12, gap = 14;
      els.card.style.maxWidth = Math.max(180, v.width - margin * 2) + 'px';
      els.card.style.maxHeight = Math.max(100, v.height - margin * 2) + 'px';
      const width = els.card.offsetWidth;
      let height = els.card.offsetHeight;
      const maxX = v.left + v.width - width - margin, maxY = v.top + v.height - height - margin;
      const rect = state.target && state.target.getBoundingClientRect();
      if (!rect || rect.bottom < v.top || rect.top > v.top + v.height || rect.right < v.left || rect.left > v.left + v.width) {
        els.spot.hidden = true;
        els.card.style.left = clamp(v.left + v.width - width - 20, v.left + margin, maxX) + 'px';
        els.card.style.top = clamp(v.top + v.height - height - 20, v.top + margin, maxY) + 'px';
        root.dataset.placement = 'corner';
        return;
      }
      const target = {left: Math.max(v.left + 3, rect.left - 4), top: Math.max(v.top + 3, rect.top - 4), right: Math.min(v.left + v.width - 3, rect.right + 4), bottom: Math.min(v.top + v.height - 3, rect.bottom + 4)};
      Object.assign(els.spot.style, {left: target.left + 'px', top: target.top + 'px', width: Math.max(1, target.right - target.left) + 'px', height: Math.max(1, target.bottom - target.top) + 'px'});
      els.spot.hidden = false;
      const candidates = [
        {side: 'below', x: rect.left, y: target.bottom + gap},
        {side: 'above', x: rect.left, y: target.top - height - gap},
        {side: 'right', x: target.right + gap, y: rect.top},
        {side: 'left', x: target.left - width - gap, y: rect.top}
      ];
      for (const p of candidates) {
        const x = clamp(p.x, v.left + margin, maxX), y = clamp(p.y, v.top + margin, maxY);
        const overlap = Math.max(0, Math.min(x + width, target.right + 5) - Math.max(x, target.left - 5)) * Math.max(0, Math.min(y + height, target.bottom + 5) - Math.max(y, target.top - 5));
        p.score = overlap * 1000 + Math.abs(p.x - x) + Math.abs(p.y - y);
        p.x = x; p.y = y;
      }
      candidates.sort((a, b) => a.score - b.score);
      const best = candidates[0];
      // A short landscape viewport can require a scrollable guide. Keep the
      // skip control visible while leaving the actual target unobstructed.
      const above = target.top - v.top - margin - gap;
      const below = v.top + v.height - target.bottom - margin - gap;
      const room = Math.max(above, below);
      const overlaps = best.x < target.right && best.x + width > target.left && best.y < target.bottom && best.y + height > target.top;
      if (overlaps && room >= 112 && room < height) {
        els.card.style.maxHeight = Math.floor(room) + 'px';
        height = els.card.offsetHeight;
        best.y = below >= above ? target.bottom + gap : target.top - height - gap;
        best.side = below >= above ? 'below' : 'above';
      }
      els.card.style.left = best.x + 'px';
      els.card.style.top = best.y + 'px';
      root.dataset.placement = best.side;
    }

    function missingMode(missing) {
      state.missing = missing;
      root.dataset.missing = String(missing);
      els.missing.hidden = !missing;
      els.restart.hidden = !missing;
      els.locate.hidden = missing || !step().target || !step().event;
      els.next.hidden = missing || Boolean(step().event);
    }

    function refresh() {
      if (!valid()) return;
      const target = resolve();
      setTarget(target);
      els.next.disabled = Boolean(step().target && !target);
      if (target || !step().target) {
        clearTimeout(state.missingTimer); state.missingTimer = 0;
        if (state.missing) missingMode(false);
        if (target && !state.entered) {
          state.entered = true;
          reveal(false);
          if (!state.hasFocused || document.activeElement === document.body) {
            state.hasFocused = true;
            els.heading.focus({preventScroll: true});
          }
        }
      } else if (!state.missingTimer && !state.missing) {
        state.missingTimer = setTimeout(() => {
          state.missingTimer = 0;
          if (valid() && !resolve()) {
            missingMode(true);
            els.live.textContent = 'Нужный элемент сейчас не виден. Можно начать пример заново или пропустить обучение.';
            schedule();
          }
        }, 700);
      }
      position();
      checkPending();
    }

    function schedule() {
      if (!valid() || state.frame) return;
      state.frame = requestAnimationFrame(() => {state.frame = 0; refresh();});
    }

    function advance() {
      if (!valid()) return;
      clearTimeout(state.timer); state.timer = 0; state.pending = null;
      if (state.index === config.steps.length - 1) { stop({reason: 'complete'}); return; }
      state.index++;
      enter();
    }

    function checkPending() {
      const pending = state.pending;
      if (!pending || !valid() || pending.index !== state.index) return;
      let done = true;
      try { if (typeof step().done === 'function') done = Boolean(step().done()); }
      catch (_) { done = false; }
      if (done) { advance(); return; }
      if (Date.now() - pending.time >= 8000) { state.pending = null; return; }
      if (!state.timer) state.timer = setTimeout(() => {state.timer = 0; checkPending();}, 80);
    }

    function enter() {
      clearTimeout(state.missingTimer); state.missingTimer = 0;
      releaseTarget();
      state.entered = false;
      state.missing = false;
      const item = step();
      root.dataset.tourStep = String(state.index + 1);
      els.progress.textContent = 'Шаг ' + (state.index + 1) + ' из ' + config.steps.length;
      els.heading.textContent = item.title || 'Следующий шаг';
      els.body.textContent = item.body || '';
      els.next.textContent = item.next || (state.index === config.steps.length - 1 ? 'Завершить' : 'Далее');
      missingMode(false);
      els.live.textContent = els.progress.textContent + '. ' + els.heading.textContent + '. ' + els.body.textContent;
      refresh();
    }

    function capture(event) {
      if (!valid() || event.type !== step().event || !state.target || root.contains(event.target)) return;
      const target = state.target, path = event.composedPath();
      const form = event.type === 'submit' && target.matches('button,input') ? target.form : null;
      if (!path.includes(target) && !target.contains(event.target) && !(form && event.target === form)) return;
      state.pending = {index: state.index, time: Date.now()};
      clearTimeout(state.timer);
      // Delegated application handlers finish before the completion predicate runs.
      state.timer = setTimeout(() => {state.timer = 0; checkPending();}, 0);
    }

    root.addEventListener('click', event => {
      const button = event.target.closest('[data-tour-action]');
      if (!button) return;
      switch (button.dataset.tourAction) {
        case 'skip': stop({reason: 'skip'}); break;
        case 'next': if (!step().event && !state.missing) advance(); break;
        case 'locate': reveal(true); break;
        case 'restart': {
          const callback = config.onRestart;
          stop({silent: true});
          if (typeof callback === 'function') callback();
          else start(config);
          break;
        }
      }
    }, {signal: abort.signal});
    for (const event of ['click', 'input', 'change', 'submit']) document.addEventListener(event, capture, {capture: true, signal: abort.signal});
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !event.isComposing) {
        event.preventDefault(); event.stopPropagation();
        stop({reason: 'skip'});
      }
    }, {capture: true, signal: abort.signal});
    window.addEventListener('resize', schedule, {passive: true, signal: abort.signal});
    document.addEventListener('scroll', schedule, {capture: true, passive: true, signal: abort.signal});
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', schedule, {passive: true, signal: abort.signal});
      window.visualViewport.addEventListener('scroll', schedule, {passive: true, signal: abort.signal});
    }
    state.resize = new ResizeObserver(schedule);
    state.resize.observe(els.card);
    state.observer = new MutationObserver(records => {
      if (records.some(record => !root.contains(record.target))) schedule();
    });
    state.observer.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style', 'aria-expanded']});
    enter();
    return true;
  }

  function stop(options = {}) {
    const state = current;
    if (!state) return false;
    current = null;
    const focus = document.activeElement;
    const restore = state.els.root.contains(focus);
    state.abort.abort();
    state.observer.disconnect();
    state.resize.disconnect();
    cancelAnimationFrame(state.frame);
    clearTimeout(state.timer);
    clearTimeout(state.missingTimer);
    state.releaseTarget();
    state.els.root.remove();
    if (restore && state.previousFocus && state.previousFocus.isConnected) state.previousFocus.focus({preventScroll: true});
    if (!options.silent && typeof state.config.onEnd === 'function') state.config.onEnd({id: state.config.id, reason: options.reason || 'skip', step: state.index + 1});
    return true;
  }

  window.IntegramTour = Object.freeze({
    start, stop,
    get active() { return Boolean(current); },
    get currentStep() { return current ? current.index + 1 : 0; }
  });
})();
