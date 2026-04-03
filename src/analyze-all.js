/**
 * Competitive Time Machine - Analyze All Orchestrator
 *
 * One-command analysis runner with resume support, controlled concurrency,
 * and retry behavior across all analyzable page captures.
 *
 * Usage examples:
 *   npm run analyze:all
 *   npm run analyze:all -- --concurrency 4 --max-retries 3
 *   npm run analyze:all -- --competitors amazon,target --pages homepage,PDP --since 2026-04-01
 *   npm run analyze:all -- --resume 20260403T120112Z
 *   npm run analyze:all -- --dry-run
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { collectAnalyzablePages, analyzePageChanges } from './analyze.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const RUNS_DIR = join(ROOT_DIR, 'runs', 'analyze');

const DEFAULTS = {
  concurrency: 3,
  maxRetries: 3,
  dryRun: false,
  retryFailedOnly: false,
  skipExisting: true,
  force: false
};

function ensureRunsDir() {
  mkdirSync(RUNS_DIR, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function makeRunId() {
  const iso = new Date().toISOString();
  const stamp = iso.replace(/[-:]/g, '').replace('.', '').replace('Z', '');
  const randomSuffix = Math.random().toString(36).slice(2, 6);
  return `${stamp}Z-${randomSuffix}`;
}

function parseCsvArg(value) {
  if (!value) return null;
  const items = value.split(',').map(item => item.trim()).filter(Boolean);
  return items.length > 0 ? items : null;
}

function parseArgs(argv) {
  const args = {
    ...DEFAULTS,
    competitors: null,
    pages: null,
    since: null,
    resume: null
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token === '--concurrency') {
      args.concurrency = Number(argv[++i]);
    } else if (token === '--max-retries') {
      args.maxRetries = Number(argv[++i]);
    } else if (token === '--competitors') {
      args.competitors = parseCsvArg(argv[++i]);
    } else if (token === '--pages') {
      args.pages = parseCsvArg(argv[++i]);
    } else if (token === '--since') {
      args.since = argv[++i] || null;
    } else if (token === '--resume') {
      args.resume = argv[++i] || null;
    } else if (token === '--dry-run') {
      args.dryRun = true;
    } else if (token === '--retry-failed') {
      args.retryFailedOnly = true;
    } else if (token === '--force') {
      args.force = true;
      args.skipExisting = false;
    } else if (token === '--no-skip-existing') {
      args.skipExisting = false;
    }
  }

  if (!Number.isInteger(args.concurrency) || args.concurrency <= 0) {
    throw new Error('Invalid --concurrency value. Use a positive integer.');
  }

  if (!Number.isInteger(args.maxRetries) || args.maxRetries < 0) {
    throw new Error('Invalid --max-retries value. Use an integer >= 0.');
  }

  if (args.since && !/^\d{4}-\d{2}-\d{2}$/.test(args.since)) {
    throw new Error('Invalid --since format. Use YYYY-MM-DD.');
  }

  return args;
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function saveJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function hydrateRunFromDisk(runId) {
  const runDir = join(RUNS_DIR, runId);
  const manifestPath = join(runDir, 'manifest.json');
  const statePath = join(runDir, 'state.json');

  if (!existsSync(manifestPath) || !existsSync(statePath)) {
    throw new Error(`Run ${runId} is missing manifest or state files.`);
  }

  const manifest = loadJson(manifestPath);
  const state = loadJson(statePath);

  return {
    runId,
    runDir,
    manifestPath,
    statePath,
    summaryPath: join(runDir, 'summary.json'),
    manifest,
    state
  };
}

function createRun(options) {
  const runId = makeRunId();
  const runDir = join(RUNS_DIR, runId);
  mkdirSync(runDir, { recursive: true });

  const jobs = collectAnalyzablePages({
    competitors: options.competitors,
    pages: options.pages,
    since: options.since
  });

  const manifest = {
    runId,
    createdAt: nowIso(),
    options,
    totalJobs: jobs.length,
    jobs
  };

  const state = {
    runId,
    createdAt: manifest.createdAt,
    updatedAt: manifest.createdAt,
    status: 'running',
    counters: {
      queued: jobs.length,
      running: 0,
      completed: 0,
      failed: 0,
      skipped: 0
    },
    jobs: Object.fromEntries(
      jobs.map(job => [job.id, {
        status: 'queued',
        attempts: 0,
        lastError: null,
        startedAt: null,
        endedAt: null,
        analysisPath: null,
        reason: null
      }])
    )
  };

  const manifestPath = join(runDir, 'manifest.json');
  const statePath = join(runDir, 'state.json');
  saveJson(manifestPath, manifest);
  saveJson(statePath, state);

  return {
    runId,
    runDir,
    manifestPath,
    statePath,
    summaryPath: join(runDir, 'summary.json'),
    manifest,
    state
  };
}

function recalculateCounters(state) {
  const counters = {
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    skipped: 0
  };

  for (const jobState of Object.values(state.jobs)) {
    if (jobState.status in counters) {
      counters[jobState.status] += 1;
    }
  }

  state.counters = counters;
  state.updatedAt = nowIso();
}

function persistState(run) {
  recalculateCounters(run.state);
  saveJson(run.statePath, run.state);
}

function findAnalysisPath(result) {
  return result?.analysisPath || null;
}

function isRetriableError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return [
    'rate',
    'timeout',
    'timed out',
    'overloaded',
    'temporar',
    '429',
    '503',
    'network'
  ].some(term => message.includes(term));
}

async function runJobWithRetry(job, run, options) {
  const jobState = run.state.jobs[job.id];

  if (!jobState) {
    throw new Error(`Missing state for job ${job.id}`);
  }

  if (options.retryFailedOnly && jobState.status !== 'failed') {
    return;
  }

  if (jobState.status === 'completed' || jobState.status === 'skipped') {
    return;
  }

  let attempt = 0;

  while (attempt <= options.maxRetries) {
    attempt += 1;
    jobState.status = 'running';
    jobState.attempts = attempt;
    jobState.startedAt = jobState.startedAt || nowIso();
    jobState.lastError = null;
    persistState(run);

    try {
      const result = await analyzePageChanges(job.competitor, job.page, job.pagePath, {
        skipIfAnalysisExists: options.skipExisting,
        force: options.force
      });

      if (result?.skipped) {
        jobState.status = 'skipped';
        jobState.reason = result.reason || 'skipped';
        jobState.analysisPath = result.analysisPath || null;
      } else {
        jobState.status = 'completed';
        jobState.reason = null;
        jobState.analysisPath = findAnalysisPath(result);
      }

      jobState.endedAt = nowIso();
      persistState(run);
      return;
    } catch (error) {
      const message = String(error?.message || error);
      jobState.lastError = message;
      jobState.endedAt = nowIso();

      const shouldRetry = attempt <= options.maxRetries && isRetriableError(error);
      if (!shouldRetry) {
        jobState.status = 'failed';
        persistState(run);
        return;
      }

      persistState(run);
      const delayMs = 250 * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

async function runWithConcurrency(jobs, worker, concurrency) {
  const queue = jobs.slice();

  async function consume() {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) break;
      await worker(job);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, jobs.length || 1) }, () => consume());
  await Promise.all(workers);
}

function buildSummary(run) {
  const failedJobs = [];
  for (const [jobId, jobState] of Object.entries(run.state.jobs)) {
    if (jobState.status === 'failed') {
      failedJobs.push({
        id: jobId,
        attempts: jobState.attempts,
        lastError: jobState.lastError
      });
    }
  }

  return {
    runId: run.runId,
    finishedAt: nowIso(),
    status: failedJobs.length > 0 ? 'completed_with_failures' : 'completed',
    counters: run.state.counters,
    failedJobs
  };
}

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('COMPETITIVE TIME MACHINE - Analyze All');
  console.log('═'.repeat(60) + '\n');

  ensureRunsDir();

  const options = parseArgs(process.argv.slice(2));

  let run;
  if (options.resume) {
    run = hydrateRunFromDisk(options.resume);
    console.log(`Resuming run: ${run.runId}`);
  } else {
    run = createRun(options);
    console.log(`Created run: ${run.runId}`);
  }

  const jobs = run.manifest.jobs;

  if (jobs.length === 0) {
    run.state.status = 'completed';
    persistState(run);
    const summary = buildSummary(run);
    saveJson(run.summaryPath, summary);
    console.log('No analyzable jobs found for the selected filters.');
    return;
  }

  console.log(`Total jobs: ${jobs.length}`);
  console.log(`Concurrency: ${options.concurrency}`);
  console.log(`Max retries: ${options.maxRetries}`);
  console.log(`Skip existing analysis: ${options.skipExisting ? 'yes' : 'no'}`);

  if (options.dryRun) {
    run.state.status = 'dry_run';
    persistState(run);
    const summary = {
      runId: run.runId,
      finishedAt: nowIso(),
      status: 'dry_run',
      counters: run.state.counters,
      failedJobs: []
    };
    saveJson(run.summaryPath, summary);
    console.log('Dry run enabled. No analysis jobs were executed.');
    return;
  }

  const targetJobs = options.retryFailedOnly
    ? jobs.filter(job => run.state.jobs[job.id]?.status === 'failed')
    : jobs;

  if (targetJobs.length === 0) {
    run.state.status = 'completed';
    persistState(run);
    const summary = buildSummary(run);
    saveJson(run.summaryPath, summary);
    console.log('No jobs matched current execution criteria.');
    return;
  }

  await runWithConcurrency(
    targetJobs,
    async job => {
      console.log(`\n[${job.competitor}/${job.page}] ${job.currentDate} vs ${job.previousDate}`);
      await runJobWithRetry(job, run, options);
      const counters = run.state.counters;
      console.log(
        `Progress: completed=${counters.completed} skipped=${counters.skipped} failed=${counters.failed} queued=${counters.queued}`
      );
    },
    options.concurrency
  );

  run.state.status = 'completed';
  persistState(run);

  const summary = buildSummary(run);
  saveJson(run.summaryPath, summary);

  console.log('\n' + '═'.repeat(60));
  console.log('ANALYZE ALL COMPLETE');
  console.log('═'.repeat(60));
  console.log(`Run ID: ${run.runId}`);
  console.log(`Summary: ${run.summaryPath}`);
  console.log(
    `Completed=${summary.counters.completed}, Skipped=${summary.counters.skipped}, Failed=${summary.counters.failed}`
  );
}

main().catch(error => {
  console.error('Analyze-all failed:', error?.message || error);
  process.exit(1);
});
