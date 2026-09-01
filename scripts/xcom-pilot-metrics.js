#!/usr/bin/env node
'use strict';

function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function durationMinutes(deployment) {
    var explicit = finiteNumber(deployment && deployment.minutes_to_first_run);
    if (explicit !== null && explicit >= 0) return explicit;
    var started = Date.parse(deployment && deployment.started_at || '');
    var finished = Date.parse(deployment && deployment.first_run_at || '');
    if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return null;
    return Math.round((finished - started) / 600) / 100;
}

function median(values) {
    if (!values.length) return null;
    var sorted = values.slice().sort(function(a, b) { return a - b; });
    var middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) * 50) / 100;
}

function share(count, total) {
    return total ? Math.round(count / total * 10000) / 100 : 0;
}

function computePilotMetrics(journal) {
    var source = journal && typeof journal === 'object' ? journal : {};
    var deployments = Array.isArray(source.deployments) ? source.deployments : [];
    var target = finiteNumber(source.target_minutes);
    var durations = [];
    var noAuthorTickets = 0;
    var codeChanges = 0;
    var withinTarget = 0;
    var invalidDurations = [];

    deployments.forEach(function(deployment, index) {
        var duration = durationMinutes(deployment);
        if (duration === null) invalidDurations.push(deployment && deployment.id || ('row-' + (index + 1)));
        else {
            durations.push(duration);
            if (target !== null && duration <= target) withinTarget += 1;
        }
        if (finiteNumber(deployment && deployment.author_tickets) === 0) noAuthorTickets += 1;
        if (deployment && deployment.template_code_changed === true) codeChanges += 1;
    });

    return {
        target_minutes: target,
        deployment_count: deployments.length,
        completed_deployment_count: durations.length,
        deployments_without_author_tickets: noAuthorTickets,
        deployments_without_author_tickets_share_percent: share(noAuthorTickets, deployments.length),
        median_minutes_to_first_run: median(durations),
        deployments_with_code_changes: codeChanges,
        deployments_with_code_changes_share_percent: share(codeChanges, deployments.length),
        deployments_within_target: withinTarget,
        deployments_within_target_share_percent: share(withinTarget, durations.length),
        invalid_duration_ids: invalidDurations
    };
}

module.exports = {
    durationMinutes: durationMinutes,
    median: median,
    computePilotMetrics: computePilotMetrics
};

if (require.main === module) {
    var fs = require('fs');
    var input = process.argv[2];
    if (!input) {
        process.stderr.write('Usage: node scripts/xcom-pilot-metrics.js <pilot-journal.json>\n');
        process.exitCode = 2;
    } else {
        try {
            var journal = JSON.parse(fs.readFileSync(input, 'utf8'));
            process.stdout.write(JSON.stringify(computePilotMetrics(journal), null, 2) + '\n');
        } catch (error) {
            process.stderr.write('Cannot calculate pilot metrics: ' + error.message + '\n');
            process.exitCode = 1;
        }
    }
}
