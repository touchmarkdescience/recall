import 'server-only';
import { isIP } from 'node:net';
import { NextResponse } from 'next/server';
import { cloud, cloudConfigured } from './cloud';
import { db } from './db';
import { reserveSqlite } from './securityStore';
import { validateSignupProof } from './nativeCaptcha';
import { budgetRule, configuredLimits, SecurityError, type BudgetRule, type Reservation } from './securityCore';
export { readJsonLimited } from './securityCore';

export function abuseEnabled(){
  const flag=process.env.ABUSE_PROTECTION_ENABLED;
  if(flag===undefined||flag==='false'||flag==='0')return false;
  if(flag==='true'||flag==='1')return true;
  throw new SecurityError('Security configuration is unavailable. Please retry later.',503);
}
export function signupCaptchaEnabled(){
  const flag=process.env.RECAPTCHA_SIGNUP_ENABLED;
  if(flag!==undefined&&!['true','false','1','0'].includes(flag))throw new SecurityError('Signup security configuration is unavailable.',503);
  return abuseEnabled()||flag==='true'||flag==='1';
}
function hashSecret(){
  const key=process.env.ABUSE_HASH_SECRET||process.env.SUPABASE_SECRET_KEY||process.env.RECAPTCHA_SECRET_KEY;
  if(key&&key.length>=16)return key;
  if(process.env.NODE_ENV!=='production')return 'recall-local-development-only';
  throw new SecurityError('Security configuration is unavailable. Please retry later.',503);
}
function clientAddress(req:Request){
  // Trust this header only behind Vercel's documented overwriting proxy.
  // On other hosts use a shared conservative bucket, never arbitrary client headers.
  const value=process.env.VERCEL==='1'?req.headers.get('x-forwarded-for')?.split(',')[0]?.trim():'';
  return value&&isIP(value)?value:'shared-untrusted-proxy';
}
function rule(scope:string,subject:string,limit:number,seconds:number){return budgetRule(scope,subject,limit,seconds,hashSecret());}
async function reserve(rules:BudgetRule[]){
  let result:Reservation;
  try {
    if(cloudConfigured()){
      const response=await cloud().rpc('recall_reserve_budget',{p_rules:rules}).abortSignal(AbortSignal.timeout(5000));
      if(response.error)throw new Error();
      result=response.data as Reservation;
      if(!result||typeof result.allowed!=='boolean'||!Number.isFinite(result.retryAfter))throw new Error();
    } else {
      if(process.env.NODE_ENV==='production')throw new Error();
      result=reserveSqlite(db(),rules);
    }
  }catch{throw new SecurityError('Security checks are temporarily unavailable. Your input is kept; retry shortly.',503);}
  if(!result.allowed)throw new SecurityError('Too many requests. Your input is kept; please try again later.',429,Math.max(1,Math.ceil(result.retryAfter)));
}
export async function protectRequest(req:Request){
  if(!abuseEnabled())return;
  const limits=configuredLimits();await reserve([rule('request',clientAddress(req),limits.requestMinute,60)]);
}
export async function protectAuth(req:Request,path:string,body:Record<string,unknown>){
  if(!['register','login'].includes(path))return;
  const limited=abuseEnabled(),ip=clientAddress(req),email=String(body.email??'').trim().toLowerCase();
  if(path==='login'){
    if(limited){const limits=configuredLimits();await reserve([rule('login-ip',ip,limits.loginQuarterHour,900),rule('login-id',`${ip}:${email}`,limits.loginIdentityQuarterHour,900)]);}
    return;
  }
  if(limited){const limits=configuredLimits();await reserve([rule('signup-hour',ip,limits.signupHour,3600),rule('signup-day',ip,limits.signupDay,86400)]);}
  if(!signupCaptchaEnabled())return;
  // The selected provider changes verification, never whether verification runs.
  await validateSignupProof(body);
  if(limited){const limits=configuredLimits();await reserve([rule('signup-global','site',limits.signupGlobalDay,86400)]);}
}
export async function protectUserBudget(userId:string,path:string){
  if(!abuseEnabled()||!['extract','ask','transcribe'].includes(path))return;
  const limits=configuredLimits();
  const minute=path==='extract'?limits.extractMinute:path==='ask'?limits.askMinute:limits.transcribeMinute;
  const day=path==='extract'?limits.extractDay:path==='ask'?limits.askDay:limits.transcribeDay;
  await reserve([rule(`${path}-minute`,userId,minute,60),rule(`${path}-day`,userId,day,86400),rule('ai-global','site',limits.aiGlobalDay,86400)]);
}
export function securityResponse(cause:unknown){
  if(!(cause instanceof SecurityError))return null;
  return NextResponse.json({error:cause.message,code:'SECURITY_CHECK'},{status:cause.status,headers:{'Cache-Control':'no-store',...(cause.status===429?{'Retry-After':String(cause.retryAfter)}:{})}});
}
