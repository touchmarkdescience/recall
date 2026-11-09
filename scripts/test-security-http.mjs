import assert from 'node:assert/strict';
const base=process.env.SECURITY_TEST_ORIGIN||'http://127.0.0.1:3303';
const url=new URL(base);
assert(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname),'Run only against an isolated localhost server, never production.');
async function post(path,body,extra={}){const response=await fetch(`${base}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(body)});return {status:response.status,body:await response.json(),retry:response.headers.get('retry-after')}}
const config=await fetch(`${base}/api/security`).then(r=>r.json());assert.equal(config.captchaRequired,true);
const input={name:'Security probe',email:`probe-${Date.now()}@example.invalid`,password:'local-test-not-a-real-password'};
const signup=await post('register',input,{'X-Recall-Client':'native'});assert.equal(signup.status,400);assert.match(signup.body.error,/securely/);
const spoofed=await post('register',input,{'X-Recall-Client':'native',Origin:'https://attacker.example'});assert.equal(spoofed.status,403);
const tooLarge=await post('login',{email:'x'.repeat(70000),password:'x'});assert.equal(tooLarge.status,413);
for(let i=0;i<10;i++){const result=await post('login',{email:input.email,password:input.password});assert.equal(result.status,401);}
const blocked=await post('login',{email:input.email,password:input.password});assert.equal(blocked.status,429);assert(Number(blocked.retry)>0);
console.log('Local API checks passed: native-header bypass rejected, foreign origin rejected, oversized JSON rejected, login throttled with Retry-After. No account created.');
