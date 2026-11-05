import { randomBytes } from 'node:crypto';
import { DateTime } from 'luxon';
import { NextResponse } from 'next/server';

export function safeFailure(cause:unknown,endpoint:string,status=500,save=false,requestedReference?:string|null){
  const reference=requestedReference&&/^REF-[A-F0-9]{10}$/.test(requestedReference)?requestedReference:`REF-${randomBytes(5).toString('hex').toUpperCase()}`;
  // Never log provider text: SQL details can include row contents, names or tokens.
  const raw=cause instanceof Error?cause.message:String(cause);
  const message=/not.null|null value/i.test(raw)?'Database constraint rejected a required field':/empty|content|required/i.test(raw)?'Required content rejected':/Unauthorized/.test(raw)?'Unauthorized':status<500?'Request validation failed':'Request failed; provider details redacted';
  console.error(JSON.stringify({reference,timeIST:DateTime.now().setZone('Asia/Kolkata').toISO(),endpoint,errorType:status<500?'ValidationError':cause instanceof TypeError?'TypeError':cause instanceof Error?'Error':'ServerError',message}));
  return NextResponse.json({error:save?"Couldn't save. Your text is kept, please retry.":'Request failed. Please retry.',reference},{status});
}
