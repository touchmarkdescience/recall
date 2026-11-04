import { NextRequest, NextResponse } from 'next/server';
import { cloudConfigured } from '@/lib/cloud';
import { cloudDispatch } from '@/lib/cloudRoutes';

export const runtime='nodejs';
export const maxDuration=60;

export async function GET(request:NextRequest){
  if(!cloudConfigured())return NextResponse.json({error:'Production database is not configured.'},{status:503});
  return cloudDispatch(request);
}
