'use client';
import Script from 'next/script';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

type Recaptcha={ready:(callback:()=>void)=>void;execute:(siteKey:string,options:{action:string})=>Promise<string>};
declare global{interface Window{grecaptcha?:Recaptcha}}
export type SignupChallengeHandle={execute:()=>Promise<string>};
const SignupChallenge=forwardRef<SignupChallengeHandle,{siteKey:string;onReady:(ready:boolean)=>void}>(function SignupChallenge({siteKey,onReady},ref){
  const [ready,setReady]=useState(false),[failed,setFailed]=useState(false);
  const source=`https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
  useEffect(()=>{onReady(ready&&!failed);return()=>onReady(false);},[ready,failed,onReady]);
  useImperativeHandle(ref,()=>({execute:()=>new Promise<string>((resolve,reject)=>{
    const api=window.grecaptcha;
    if(!ready||!api){reject(new Error('Security check is still loading. Your details are kept; retry shortly.'));return;}
    const timeout=setTimeout(()=>reject(new Error('The security check timed out. Your details are kept; please retry.')),10000);
    try{api.ready(()=>{try{api.execute(siteKey,{action:'signup'}).then(token=>{clearTimeout(timeout);if(token)resolve(token);else reject(new Error('Security check failed. Please retry.'));},()=>{clearTimeout(timeout);reject(new Error('Security check failed. Your details are kept; please retry.'));});}catch{clearTimeout(timeout);reject(new Error('Security check unavailable. Please retry.'));}});}
    catch{clearTimeout(timeout);reject(new Error('Security check unavailable. Please retry.'));}
  })}),[ready,siteKey]);
  function retry(){
    setFailed(false);
    if(window.grecaptcha){setReady(true);return;}
    const script=document.createElement('script');script.src=source;script.async=true;
    script.onload=()=>setReady(true);script.onerror=()=>setFailed(true);document.head.appendChild(script);
  }
  return <div style={{margin:'14px 0',fontSize:12,lineHeight:1.5,color:'#728b80'}}>
    <Script src={source} strategy="afterInteractive" onReady={()=>setReady(true)} onError={()=>setFailed(true)}/>
    <p>This site is protected by reCAPTCHA and the Google <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Privacy Policy</a> and <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">Terms of Service</a> apply.</p>
    {!ready&&!failed&&<p role="status">Loading security check…</p>}
    {failed&&<p role="alert">Security check unavailable. <button type="button" onClick={retry}>Retry</button></p>}
  </div>;
});
export default SignupChallenge;
