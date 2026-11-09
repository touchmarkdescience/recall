import { createHmac } from 'node:crypto';

export class SecurityError extends Error {
  status: number; retryAfter: number;
  constructor(message:string,status=429,retryAfter=60){super(message);this.name='SecurityError';this.status=status;this.retryAfter=retryAfter;}
}
export type BudgetRule={key:string;limit:number;resetAt:string};
export type Reservation={allowed:boolean;retryAfter:number};
export function budgetRule(scope:string,subject:string,limit:number,seconds:number,secret:string,now=Date.now()):BudgetRule {
  const window=Math.floor(now/(seconds*1000));
  const digest=createHmac('sha256',secret).update(`recall-abuse-v1:${scope}:${subject}`).digest('hex');
  return {key:`${scope}:${digest}:${window}`,limit,resetAt:new Date((window+1)*seconds*1000).toISOString()};
}
// Fixed windows are shared in the database; UTC epoch boundaries are intentional.
export const defaultLimits={requestMinute:120,signupHour:5,signupDay:15,signupGlobalDay:500,loginQuarterHour:30,loginIdentityQuarterHour:10,extractMinute:20,extractDay:150,askMinute:10,askDay:100,transcribeMinute:6,transcribeDay:30,aiGlobalDay:1000};
export function configuredLimits(env:Record<string,string|undefined>=process.env){
  const limits={...defaultLimits};
  for(const key of Object.keys(limits) as (keyof typeof limits)[]){
    const raw=env[`ABUSE_${key.replace(/[A-Z]/g,s=>`_${s}`).toUpperCase()}`];
    if(raw!==undefined){const n=Number(raw);if(!Number.isSafeInteger(n)||n<1||n>100000)throw new SecurityError('Security limits are not configured correctly.',503);limits[key]=n;}
  }
  return limits;
}
export async function readJsonLimited(request:Request,maxBytes=65536):Promise<Record<string,unknown>> {
  const length=request.headers.get('content-length');
  if(length&&(!/^\d+$/.test(length)||Number(length)>maxBytes))throw new SecurityError('This request is too large. Shorten the note and retry.',413);
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new SecurityError('Send this request as JSON.',415);
  const reader=request.body?.getReader();if(!reader)throw new SecurityError('A request body is required.',400);
  const chunks:Uint8Array[]=[];let size=0;
  try {while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>maxBytes){await reader.cancel();throw new SecurityError('This request is too large. Shorten it and retry.',413);}chunks.push(item.value);}}
  finally{reader.releaseLock();}
  try{const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();return body;}
  catch{throw new SecurityError('The request could not be read. Your input is kept; please retry.',400);}
}
export async function validateChallenge(token:unknown,options:{secret:string;hostnames:string[];minScore?:number;fetcher?:typeof fetch}) {
  const minScore=options.minScore??0.5;
  if(!Number.isFinite(minScore)||minScore<0.1||minScore>1)throw new SecurityError('Security score configuration is unavailable.',503);
  if(typeof token!=='string'||token.length<1||token.length>16384)throw new SecurityError('Create your account securely at https://recall.touchmarkdes.com/app, then sign in to the Recall app. Website users: retry the security check.',400);
  let response:Response;
  try {response=await (options.fetcher??fetch)('https://www.google.com/recaptcha/api/siteverify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret:options.secret,response:token}),signal:AbortSignal.timeout(5000)});}
  catch{throw new SecurityError('The security check is temporarily unavailable. Your details are kept; retry shortly.',503);}
  let result:{success?:boolean;score?:number;action?:string;hostname?:string;'error-codes'?:unknown};
  try{if(!response.ok)throw new Error();result=await response.json();}catch{throw new SecurityError('The security check is temporarily unavailable. Please retry.',503);}
  if(result['error-codes']&&(!Array.isArray(result['error-codes'])||result['error-codes'].length>0))throw new SecurityError('The security check was not accepted. Please retry later.',400);
  if(result.success!==true||result.action!=='signup'||!options.hostnames.includes(result.hostname??'')||typeof result.score!=='number'||!Number.isFinite(result.score)||result.score<minScore||result.score>1)throw new SecurityError('We could not verify this signup. Your details are kept; please retry or contact support.',400);
  // Google validates two-minute expiry and single use. Always verify a fresh
  // execute-on-submit token; never cache a prior success or trust a client score.
}
