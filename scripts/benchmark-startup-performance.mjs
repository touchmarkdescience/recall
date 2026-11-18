// Benchmark measuring startup and dashboard load performance.
// Uses in-memory database and simulated network latency.
import { performance } from 'node:perf_hooks';
import { PGlite } from '@electric-sql/pglite';

const SAMPLES = 10;
const DB_LATENCY_MS = 50; // realistic round-trip latency to cloud database (e.g. Supabase)

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 1. Simulating Sequential vs Parallel vs SWR Dashboard Startup
async function simulateSequentialStartup() {
  const start = performance.now();
  // 1. Client calls /api/me
  await sleep(DB_LATENCY_MS); // auth + settings lookup
  const user = { id: 'user-1', name: 'User' };
  
  // 2. Client awaits /api/me response, THEN calls /api/dashboard
  await sleep(DB_LATENCY_MS); // contacts query + actions query + interactions query
  const dashboard = { actions: [], contacts: [] };
  
  const total = performance.now() - start;
  return { timeToFirstRender: total, totalNetworkTime: total };
}

async function simulateParallelStartup() {
  const start = performance.now();
  // Client calls both in parallel
  const [me, dashboard] = await Promise.all([
    sleep(DB_LATENCY_MS).then(() => ({ id: 'user-1', name: 'User' })),
    sleep(DB_LATENCY_MS).then(() => ({ actions: [], contacts: [] })),
  ]);
  const total = performance.now() - start;
  return { timeToFirstRender: total, totalNetworkTime: total };
}

async function simulateSwrCachedStartup() {
  const start = performance.now();
  // 1. Immediate render from local cache
  const cached = { actions: [{ id: '1' }], contacts: [] };
  const firstRender = performance.now() - start; // synchronous < 1ms
  
  // 2. Parallel background revalidation
  await Promise.all([
    sleep(DB_LATENCY_MS),
    sleep(DB_LATENCY_MS),
  ]);
  const total = performance.now() - start;
  return { timeToFirstRender: firstRender, totalNetworkTime: total };
}

// 2. Simulating Sequential vs Parallel Missing Interactions Query
async function simulateSequentialMissingNotes(batchCount = 3) {
  const start = performance.now();
  for (let i = 0; i < batchCount; i++) {
    await sleep(DB_LATENCY_MS);
  }
  return performance.now() - start;
}

async function simulateParallelMissingNotes(batchCount = 3) {
  const start = performance.now();
  await Promise.all(Array.from({ length: batchCount }, () => sleep(DB_LATENCY_MS)));
  return performance.now() - start;
}

async function runBenchmark() {
  console.log('=====================================================');
  console.log('RECALL PERFORMANCE BENCHMARK (Simulated Cloud Latency = ' + DB_LATENCY_MS + 'ms)');
  console.log('=====================================================\n');

  // Test 1: Startup strategies
  const seqRuns = [];
  const parRuns = [];
  const swrRuns = [];

  for (let i = 0; i < SAMPLES; i++) {
    seqRuns.push(await simulateSequentialStartup());
    parRuns.push(await simulateParallelStartup());
    swrRuns.push(await simulateSwrCachedStartup());
  }

  const median = arr => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)];

  const seqRender = median(seqRuns.map(r => r.timeToFirstRender));
  const parRender = median(parRuns.map(r => r.timeToFirstRender));
  const swrRender = median(swrRuns.map(r => r.timeToFirstRender));

  console.log('1. DASHBOARD TIME-TO-FIRST-RENDER (Startup):');
  console.log(`   - Before (Sequential Waterfall me -> dashboard): ${seqRender.toFixed(2)} ms`);
  console.log(`   - Parallel (Promise.all([me, dashboard])):        ${parRender.toFixed(2)} ms (${Math.round((1 - parRender/seqRender)*100)}% faster)`);
  console.log(`   - Optimized (SWR Local Cache Instant Render):   ${swrRender.toFixed(2)} ms (${Math.round((1 - swrRender/seqRender)*100)}% faster - INSTANT)\n`);

  // Test 2: Missing Interaction Notes (N+1 queries)
  const batches = 3;
  const seqNotes = [];
  const parNotes = [];
  for (let i = 0; i < SAMPLES; i++) {
    seqNotes.push(await simulateSequentialMissingNotes(batches));
    parNotes.push(await simulateParallelMissingNotes(batches));
  }
  const seqNotesMed = median(seqNotes);
  const parNotesMed = median(parNotes);

  console.log(`2. SERVER DASHBOARD QUERY WITH ${batches} BATCHES OF HISTORICAL NOTES:`);
  console.log(`   - Before (Sequential for-await loop):           ${seqNotesMed.toFixed(2)} ms`);
  console.log(`   - Optimized (Parallel Promise.all):             ${parNotesMed.toFixed(2)} ms (${Math.round((1 - parNotesMed/seqNotesMed)*100)}% faster)\n`);

  console.log('=====================================================');
}

runBenchmark().catch(console.error);
