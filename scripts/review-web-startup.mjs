// Replay the actual transpiled App startup using synthetic React hook state and
// deferred HTTP responses. No browser, real accounts, provider calls or writes.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { WriteGuard } from '../src/lib/writeState.ts';

const option=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const userB={id:'account-b',name:'Synthetic B',email:'b@example.invalid'};
const record={id:'synthetic-action',contactId:'',contactName:'',kind:'follow_up',title:'Private synthetic task A',dueAt:null,status:'pending',createdAt:new Date().toISOString()};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(root,cache=null){
  const effects=[],refs=[],states=[],changes=[];let index=0,resolveDashboard;
  const delayed=new Promise(resolve=>resolveDashboard=resolve);
  const dashboardComponent=function SalesDashboard(){};
  const hooks={
    useState(initial){const i=index++;const value=i===0?userB:typeof initial==='function'?initial():initial;states[i]=value;return [value,next=>{states[i]=typeof next==='function'?next(states[i]):next;changes.push({index:i,value:states[i]})}]},
    useRef(current){const ref={current};refs.push(ref);return ref},
    useEffect(effect){effects.push(effect)},useCallback(fn){return fn},useMemo(fn){return fn()},
  };
  const jsx=(type,props)=>({type,props});
  const context={exports:{},console,Promise,Date,Intl,Map,Set,JSON,encodeURIComponent,decodeURIComponent,setTimeout,clearTimeout,
    window:{location:{hash:'',pathname:'/app',search:''}},navigator:{},
    localStorage:{getItem:()=>cache,setItem(){},removeItem(){}},
    fetch:async url=>({ok:true,json:()=>String(url).endsWith('/me')?Promise.resolve({user:userB}):delayed}),
    require(name){
      if(name==='react')return hooks;
      if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
      if(name==='@/lib/writeState')return {WriteGuard,upsertRows:(a,b)=>[...a,...b]};
      if(name==='./SalesDashboard')return {__esModule:true,default:dashboardComponent};
      return new Proxy({__esModule:true,default:function Stub(){}},{get:(target,key)=>key in target?target[key]:function Stub(){}});
    },
  };
  const source=readFileSync(`${root}/src/components/App.tsx`,'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(compiled,context,{filename:'App.tsx'});
  const tree=context.exports.default({initialAuthMode:'login'});
  function find(node){if(!node||typeof node!=='object')return null;if(node.type===dashboardComponent)return node.props;if(Array.isArray(node))return node.map(find).find(Boolean)||null;return find(node.props?.children)}
  return {effects,refs,changes,resolveDashboard,renderedDashboard:find(tree)};
}
async function review(root){
  const stale={contacts:[],actions:[record],interactions:[]};
  const cached=harness(root,JSON.stringify(stale));
  const cacheVisibleToB=cached.renderedDashboard.actions.some(action=>action.title===record.title);
  const start=harness(root);
  const startup=start.effects.find(effect=>effect.toString().includes("'me'")||effect.toString().includes('"me"'));
  assert(startup,'Startup effect missing');startup();await tick();await tick();
  const guard=start.refs.map(ref=>ref.current).find(value=>value instanceof WriteGuard);assert(guard);
  const token=guard.begin(record.id);guard.finish(token); // Confirmed completion while initial GET is delayed.
  start.resolveDashboard(stale);await tick();await tick();
  const staleDashboardApplied=start.changes.some(change=>Array.isArray(change.value?.actions)&&change.value.actions.some(action=>action.id===record.id&&action.status==='pending'));
  return {cachedAccountATaskRenderedForAuthenticatedB:cacheVisibleToB,staleInitialResponseAppliedAfterConfirmedCompletion:staleDashboardApplied};
}
const before=await review(option('before')),after=await review(option('after'));
assert.equal(before.cachedAccountATaskRenderedForAuthenticatedB,false);
assert.equal(before.staleInitialResponseAppliedAfterConfirmedCompletion,false);
assert.equal(after.cachedAccountATaskRenderedForAuthenticatedB,true);
assert.equal(after.staleInitialResponseAppliedAfterConfirmedCompletion,true);
const report={before,after,meaning:'Two regressions reproduced in actual transpiled component logic with synthetic hook state and deferred HTTP. This is not a live account exposure test or browser rendering measurement.'};
writeFileSync(option('output')||'docs/web-startup-review-2026-11-18.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
