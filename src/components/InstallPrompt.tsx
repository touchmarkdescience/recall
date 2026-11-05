'use client';
import { useEffect, useRef, useState } from 'react';

type InstallEvent=Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
const dismissedKey='recall-ios-install-dismissed';

export default function InstallPrompt(){
  const [installEvent,setInstallEvent]=useState<InstallEvent|null>(null);
  const pending=useRef<InstallEvent|null>(null);
  const [iosHint,setIosHint]=useState(false);
  useEffect(()=>{
    const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator & {standalone?:boolean}).standalone===true;
    const agent=navigator.userAgent;
    const ios=/iPhone|iPad|iPod/.test(agent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    const safari=/Safari/.test(agent)&&!/CriOS|FxiOS|EdgiOS|OPiOS/.test(agent);
    const dismissed=()=>{try{return localStorage.getItem(dismissedKey)==='yes'}catch{return false}};
    setIosHint(ios&&safari&&!standalone()&&!dismissed());
    const beforeInstall=(event:Event)=>{event.preventDefault();if(!standalone()){pending.current=event as InstallEvent;setInstallEvent(event as InstallEvent)}};
    const installed=()=>{pending.current=null;setInstallEvent(null);setIosHint(false)};
    const requested=()=>{if(pending.current){const event=pending.current;pending.current=null;setInstallEvent(null);void event.prompt().then(()=>event.userChoice).catch(()=>{})}};
    window.addEventListener('beforeinstallprompt',beforeInstall);
    window.addEventListener('appinstalled',installed);
    window.addEventListener('recall-install-request',requested);
    return()=>{window.removeEventListener('beforeinstallprompt',beforeInstall);window.removeEventListener('appinstalled',installed);window.removeEventListener('recall-install-request',requested)};
  },[]);
  async function install(){if(!pending.current)return;const event=pending.current;pending.current=null;setInstallEvent(null);await event.prompt();await event.userChoice}
  function dismiss(){try{localStorage.setItem(dismissedKey,'yes')}catch{}setIosHint(false)}
  if(installEvent)return <aside className="install-banner" aria-label="Install Recall"><span>Keep Recall on your Home Screen.</span><button type="button" onClick={install}>Install app</button></aside>;
  if(iosHint)return <aside className="install-banner" aria-label="Add Recall to Home Screen"><span>Tap Share, then Add to Home Screen.</span><button type="button" onClick={dismiss} aria-label="Dismiss install hint">Dismiss</button></aside>;
  return null;
}
