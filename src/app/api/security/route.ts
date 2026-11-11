import { NextResponse } from 'next/server';
import { signupCaptchaEnabled, securityResponse } from '@/lib/abuse';
import { mobileSignupConfiguration } from '@/lib/nativeCaptcha';
export const dynamic='force-dynamic';
export function GET(){
  try{const required=signupCaptchaEnabled();return NextResponse.json({captchaRequired:required,siteKey:required?process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY||null:null,mobile:required?mobileSignupConfiguration():{androidSiteKey:null,iosSiteKey:null}},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return securityResponse(error)||NextResponse.json({error:'Security checks unavailable.'},{status:503});}
}
