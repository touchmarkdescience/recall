'use client';
import { useEffect } from 'react';
// Preserve existing bookmarks/notification deep links when the public landing is shown.
export default function LegacyAppLink(){useEffect(()=>{
 const hash=window.location.hash;
 if(/^#(?:home|capture|manual(?:\/.*)?|contacts|contact\/.*|ask|calendar|settings|sheet-guide)$/.test(hash)) window.location.replace(`/app${hash}`);
},[]);return null;}
