const assert = require('assert');
const { durationMinutes, median, computePilotMetrics } = require('../scripts/xcom-pilot-metrics.js');

assert.strictEqual(durationMinutes({ started_at: '2026-09-01T09:00:00Z', first_run_at: '2026-09-01T09:42:00Z' }), 42);
assert.strictEqual(durationMinutes({ minutes_to_first_run: 17.5 }), 17.5);
assert.strictEqual(durationMinutes({ started_at: 'bad', first_run_at: 'also bad' }), null);
assert.strictEqual(median([60, 30, 45]), 45);
assert.strictEqual(median([30, 60]), 45);

const metrics = computePilotMetrics({
    target_minutes: 60,
    deployments: [
        { id: 'one', started_at: '2026-09-01T09:00:00Z', first_run_at: '2026-09-01T09:30:00Z', author_tickets: 0, template_code_changed: false },
        { id: 'two', minutes_to_first_run: 70, author_tickets: 2, template_code_changed: true },
        { id: 'three', started_at: 'bad', first_run_at: '', author_tickets: 0, template_code_changed: false }
    ]
});
assert.strictEqual(metrics.deployment_count, 3);
assert.strictEqual(metrics.completed_deployment_count, 2);
assert.strictEqual(metrics.deployments_without_author_tickets, 2);
assert.strictEqual(metrics.deployments_without_author_tickets_share_percent, 66.67);
assert.strictEqual(metrics.median_minutes_to_first_run, 50);
assert.strictEqual(metrics.deployments_with_code_changes_share_percent, 33.33);
assert.strictEqual(metrics.deployments_within_target, 1);
assert.deepStrictEqual(metrics.invalid_duration_ids, ['three']);

console.log('OK: test-issue-4823-xcom-pilot-metrics');
