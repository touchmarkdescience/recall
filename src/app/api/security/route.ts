import { NextResponse } from 'next/server';
import { signupCaptchaEnabled, securityResponse } from '@/lib/abuse';
export const dynamic='force-dynamic';
export function GET(){
  try{return NextResponse.json({captchaRequired:signupCaptchaEnabled(),siteKey:signupCaptchaEnabled()?process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY||null:null},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return securityResponse(error)||NextResponse.json({error:'Security checks unavailable.'},{status:503});}
}
