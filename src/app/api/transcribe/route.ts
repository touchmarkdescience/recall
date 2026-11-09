import { protectRequest, protectUserBudget, readJsonLimited, securityResponse } from '@/lib/abuse';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { cloudConfigured } from '@/lib/cloud';
import { getCloudSettings } from '@/lib/cloudSettings';
import { getSettings } from '@/lib/settings';
import { sttConfigured, sttLabel, transcribeAudio } from '@/lib/stt';

export const runtime='nodejs';
export const maxDuration=60;
const payload=z.object({
  audio:z.string().min(4).max(2_800_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  mime:z.enum(['audio/webm','audio/mp4','audio/ogg','audio/wav']),
});
export async function POST(req:NextRequest){
  const origin=req.headers.get('origin');
  if(origin){try{if(new URL(origin).host!==req.headers.get('host'))return NextResponse.json({error:'Invalid origin'},{status:403})}catch{return NextResponse.json({error:'Invalid origin'},{status:403})}}
  try{await protectRequest(req);}catch(error){return securityResponse(error)||NextResponse.json({error:'Security checks unavailable.'},{status:503});}
  const user=await currentUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  try{
    const provider=(cloudConfigured()?await getCloudSettings(user.id):getSettings(user.id)).transcriptionProvider;
    if(!sttConfigured(provider))return NextResponse.json({error:`${sttLabel(provider)} is not configured. Your recording is saved on this device; you can type your note instead.`},{status:503});
    const raw=await readJsonLimited(req,2_900_000);
    const parsed=payload.safeParse(raw);
    if(!parsed.success)return NextResponse.json({error:'Record a shorter audio clip in a supported format.'},{status:400});
    await protectUserBudget(user.id,'transcribe');
    const transcript=await transcribeAudio({bytes:Buffer.from(parsed.data.audio,'base64'),mime:parsed.data.mime},provider);
    return NextResponse.json({transcript});
  }catch(error){
    const blocked=securityResponse(error);if(blocked)return blocked;
    const status=(error as {status?:number}).status;
    return NextResponse.json({error:status===429?'Transcription is busy. Please retry shortly. Your recording is saved on this device.':`Transcription failed${status?` (${status})`:''}. Your recording is still saved on this device.`},{status:status===429?429:502});
  }
}
