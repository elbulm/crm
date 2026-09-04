const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'demo/xcom/index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'demo/xcom/demo.js'), 'utf8');

assert(html.includes('Настройка шаблона') && html.includes('для интегратора'), 'demo separates the integrator setup');
assert(html.includes('Рабочее место') && html.includes('для оператора'), 'demo separates the operator workspace');

const filesStep = html.indexOf('Файлы и запуск');
const reviewStep = html.indexOf('Решите спорные позиции');
const exportStep = html.indexOf('Скачайте готовый результат');
assert(filesStep >= 0 && filesStep < reviewStep && reviewStep < exportStep, 'operator stages are presented in task order');

assert(html.includes('Сейчас товары ещё не сравниваются'), 'column mapping explains what does not happen yet');
assert(html.includes('Уверенность подсказки'), 'mapping confidence is named as suggestion confidence');
assert(html.includes('id="mass-next" hidden'), 'matching reveals the next action only after completion');
assert(html.includes('id="review-next" hidden'), 'review reveals export only after a decision');
assert(/id="download-export"[^>]*disabled/.test(html), 'export starts locked');
assert(html.includes('id="export-blocker"'), 'locked export explains how to continue');
assert(html.includes('id="completion-note" hidden'), 'completed export offers a repeat run');

assert(script.includes("target === 'review' ? !hasMatched"), 'review is gated by a completed matching run');
assert(script.includes("target === 'export' ? !ready"), 'export is gated by completed review');
assert(script.includes('function prepareNewRun()'), 'repeat run has an explicit reset');
assert(script.includes("byId('download-export').disabled = !ready"), 'download state follows readiness');
assert(script.includes("pendingReviewCount() === 0"), 'readiness is based on unresolved decisions');

console.log('OK: test-issue-4816-xcom-guided-flow');
