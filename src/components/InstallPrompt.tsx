'use client';
import { useEffect, useState } from 'react';

type InstallEvent=Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
const dismissedKey='recall-ios-install-dismissed';

export default function InstallPrompt(){
  const [installEvent,setInstallEvent]=useState<InstallEvent|null>(null);
  const [iosHint,setIosHint]=useState(false);
  useEffect(()=>{
    const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator & {standalone?:boolean}).standalone===true;
    const agent=navigator.userAgent;
    const ios=/iPhone|iPad|iPod/.test(agent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    const safari=/Safari/.test(agent)&&!/CriOS|FxiOS|EdgiOS|OPiOS/.test(agent);
    const dismissed=()=>{try{return localStorage.getItem(dismissedKey)==='yes'}catch{return false}};
    setIosHint(ios&&safari&&!standalone()&&!dismissed());
    const beforeInstall=(event:Event)=>{event.preventDefault();if(!standalone())setInstallEvent(event as InstallEvent)};
    const installed=()=>{setInstallEvent(null);setIosHint(false)};
    window.addEventListener('beforeinstallprompt',beforeInstall);
    window.addEventListener('appinstalled',installed);
    return()=>{window.removeEventListener('beforeinstallprompt',beforeInstall);window.removeEventListener('appinstalled',installed)};
  },[]);
  async function install(){if(!installEvent)return;const event=installEvent;setInstallEvent(null);await event.prompt();await event.userChoice}
  function dismiss(){try{localStorage.setItem(dismissedKey,'yes')}catch{}setIosHint(false)}
  if(installEvent)return <aside className="install-banner" aria-label="Install Recall"><span>Keep Recall on your Home Screen.</span><button type="button" onClick={install}>Install app</button></aside>;
  if(iosHint)return <aside className="install-banner" aria-label="Add Recall to Home Screen"><span>Tap Share, then Add to Home Screen.</span><button type="button" onClick={dismiss} aria-label="Dismiss install hint">Dismiss</button></aside>;
  return null;
}
