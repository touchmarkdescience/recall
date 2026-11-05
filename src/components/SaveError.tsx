"use client";
import { useState } from 'react';
export default function SaveError({message,onRetry,disabled=false}:{message:string;onRetry?:()=>void;disabled?:boolean}){
  const [copied,setCopied]=useState(false);
  const reference=message.match(/REF-[A-F0-9]{10}/)?.[0];
  return <div className="error" role="alert"><span>{message}</span>{reference&&<><button type={onRetry?'button':'submit'} disabled={disabled} onClick={onRetry}>Retry</button><button type="button" onClick={()=>{void navigator.clipboard.writeText(reference).then(()=>setCopied(true)).catch(()=>setCopied(false))}}>{copied?'Copied':'Copy reference'}</button></>}</div>;
}
