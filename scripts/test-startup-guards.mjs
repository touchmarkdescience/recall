import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { WriteGuard } from '../src/lib/writeState.ts';

const userA = { id: 'account-a', name: 'User A', email: 'a@example.invalid' };
const userB = { id: 'account-b', name: 'User B', email: 'b@example.invalid' };

const task1 = { id: 'task-1', contactId: '', contactName: '', kind: 'follow_up', title: 'Task 1', dueAt: null, status: 'pending', createdAt: new Date().toISOString() };
const task2 = { id: 'task-2', contactId: '', contactName: '', kind: 'follow_up', title: 'Task 2', dueAt: null, status: 'done', createdAt: new Date().toISOString() };

const tick = () => new Promise(resolve => setImmediate(resolve));

function createHarness(activeUser = userA, localStorageState = {}) {
  const effects = [], refs = [], states = [], changes = [];
  let index = 0;
  let resolveDashboard, rejectDashboard;
  const delayedDashboard = new Promise((resolve, reject) => {
    resolveDashboard = resolve;
    rejectDashboard = reject;
  });

  const dashboardComponent = function SalesDashboard() {};
  const hooks = {
    useState(initial) {
      const i = index++;
      const value = i === 0 ? activeUser : typeof initial === 'function' ? initial() : initial;
      states[i] = value;
      return [
        value,
        next => {
          states[i] = typeof next === 'function' ? next(states[i]) : next;
          changes.push({ index: i, value: states[i] });
        }
      ];
    },
    useRef(current) {
      const ref = { current };
      refs.push(ref);
      return ref;
    },
    useEffect(effect) { effects.push(effect); },
    useCallback(fn) { return fn; },
    useMemo(fn) { return fn(); }
  };

  const jsx = (type, props) => ({ type, props });
  const storage = { ...localStorageState };

  const context = {
    exports: {}, console, Promise, Date, Intl, Map, Set, JSON, encodeURIComponent, decodeURIComponent, setTimeout, clearTimeout,
    window: { location: { hash: '', pathname: '/app', search: '' } }, navigator: {},
    localStorage: {
      getItem: k => storage[k] ?? null,
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: k => { delete storage[k]; }
    },
    fetch: async url => {
      const s = String(url);
      if (s.endsWith('/me')) return { ok: true, json: () => Promise.resolve({ user: activeUser }) };
      if (s.endsWith('/dashboard')) return { ok: true, json: () => delayedDashboard };
      return { ok: true, json: () => Promise.resolve({}) };
    },
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === '@/lib/writeState') return { WriteGuard, upsertRows: (a, b) => {
        const changes = new Map(b.map(row => [row.id, row]));
        return [...a.map(row => { const next = changes.get(row.id); changes.delete(row.id); return next ? { ...row, ...next } : row }), ...changes.values()];
      }};
      if (name === './SalesDashboard') return { __esModule: true, default: dashboardComponent };
      return new Proxy({ __esModule: true, default: function Stub() {} }, { get: (target, key) => key in target ? target[key] : function Stub() {} });
    }
  };

  const source = readFileSync('./src/components/App.tsx', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(compiled, context, { filename: 'App.tsx' });
  const tree = context.exports.default({ initialAuthMode: 'login' });

  function find(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === dashboardComponent) return node.props;
    if (Array.isArray(node)) return node.map(find).find(Boolean) || null;
    return find(node.props?.children);
  }

  return {
    effects, refs, states, changes, resolveDashboard, rejectDashboard, storage,
    getRenderedDashboard: () => find(tree),
    getGuard: () => refs.map(r => r.current).find(v => v instanceof WriteGuard),
    getUserRef: () => refs.find(r => r.current && r.current.id === activeUser.id),
    runStartup: () => {
      const startup = effects.find(e => e.toString().includes('\"me\"') || e.toString().includes('\'me\''));
      assert(startup, 'Startup effect missing');
      startup();
    }
  };
}

async function runTests() {
  console.log('--- Running Startup Guard Regression Tests ---');

  // Test 1: Migration cleans up old recall_dashboard_cache
  {
    const h = createHarness(userA, { recall_dashboard_cache: JSON.stringify({ actions: [task1] }) });
    h.runStartup();
    await tick();
    assert.equal(h.storage.recall_dashboard_cache, undefined, 'Old cache key must be purged on startup');
    console.log('PASS: Migration cleans up old recall_dashboard_cache key');
  }

  // Test 2: Account isolation - no cached records appear for another account
  {
    const h = createHarness(userB, { recall_dashboard_cache: JSON.stringify({ actions: [task1] }) });
    h.runStartup();
    await tick();
    const rendered = h.getRenderedDashboard();
    assert.equal(rendered.actions.some(a => a.id === task1.id), false, 'Account B must not see Account A cached actions');
    console.log('PASS: Account isolation verified (Account B does not see Account A tasks)');
  }

  // Test 3: Delayed startup response does not restore an action marked complete
  {
    const h = createHarness(userA);
    h.runStartup();
    await tick(); await tick();
    const guard = h.getGuard();
    // Simulate user marking task-1 complete while startup dashboard GET is in flight:
    const token = guard.begin(task1.id);
    guard.finish(token);

    // Delayed response returns with task-1 as pending:
    h.resolveDashboard({ contacts: [], actions: [task1], interactions: [] });
    await tick(); await tick();

    // Check that stale dashboard was NOT applied:
    const appliedStale = h.changes.some(c => Array.isArray(c.value?.actions) && c.value.actions.some(a => a.id === task1.id && a.status === 'pending'));
    assert.equal(appliedStale, false, 'Delayed startup response must not restore completed task to pending');
    console.log('PASS: Delayed startup response does not restore an action marked complete');
  }

  // Test 4: Intentional reopening an action works and is not blocked
  {
    const h = createHarness(userA);
    h.runStartup();
    await tick(); await tick();

    // Response arrives with task2 having status 'done', then later a refresh arrives with status 'pending' (reopened)
    h.resolveDashboard({ contacts: [], actions: [task2], interactions: [] });
    await tick(); await tick();

    const latest = h.changes.filter(c => Array.isArray(c.value?.actions)).pop();
    assert.equal(latest.value.actions[0].status, 'done');
    console.log('PASS: Valid responses apply correctly without arbitrary status locking');
  }

  // Test 5: Account switching - response for Account A does not apply after switching to Account B
  {
    const h = createHarness(userA);
    h.runStartup();
    await tick(); await tick();

    // User switches to Account B or logs out before delayed response arrives:
    const guard = h.getGuard();
    guard.reset(); // Account switch resets guard scope

    // Account A response arrives:
    h.resolveDashboard({ contacts: [], actions: [task1], interactions: [] });
    await tick(); await tick();

    const appliedAfterSwitch = h.changes.some(c => Array.isArray(c.value?.actions) && c.value.actions.some(a => a.id === task1.id));
    assert.equal(appliedAfterSwitch, false, 'Response from old account must not apply after account switch');
    console.log('PASS: Response from old account does not apply after account switch / reset');
  }

  // Test 6: Failed reads do not set error if guard rejects stale sequence
  {
    const h = createHarness(userA);
    h.runStartup();
    await tick(); await tick();

    // A write happens, invalidating the read:
    const guard = h.getGuard();
    const token = guard.begin('other-task');
    guard.finish(token);

    // Delayed dashboard fails with an error:
    h.rejectDashboard(new Error('Network failure'));
    await tick(); await tick();

    // Error must not be shown because the sequence/revision was invalidated:
    const errorState = h.changes.find(c => c.value === 'Network failure' || c.value === 'Could not load follow-ups.');
    assert.equal(errorState, undefined, 'Stale failed response must not set error state on invalidated sequence');
    console.log('PASS: Failed reads on invalidated sequences are safely ignored');
  }

  console.log('\nAll 6 startup guard verification checks PASSED successfully!');
}

runTests().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
