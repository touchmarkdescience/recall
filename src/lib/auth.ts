import { cookies, headers } from 'next/headers';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { row, run } from './db';
import { cloud, cloudConfigured, dataOrThrow } from './cloud';

export type User = { id: string; email: string; name: string };
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export function passwordHash(password: string) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password,salt,64).toString('hex')}`; }
export function passwordValid(password: string, stored: string) { const [salt,hash] = stored.split(':'); if (!salt || !hash) return false; const a=Buffer.from(hash,'hex'); const b=scryptSync(password,salt,a.length); return timingSafeEqual(a,b); }
export async function currentUser(): Promise<User | null> {
  const authorization=(await headers()).get('authorization');
  const bearer=authorization?.startsWith('Bearer ')?authorization.slice(7).trim():'';
  const token = bearer || (await cookies()).get('recall_session')?.value;
  if (!token) return null;
  if (cloudConfigured()) {
    const sessionResult=await cloud().from('recall_sessions').select('user_id').eq('token_hash',hashToken(token)).gt('expires_at',new Date().toISOString()).maybeSingle();
    if(sessionResult.error)throw new Error(sessionResult.error.message);
    const session=sessionResult.data;
    if (!session) return null;
    const userResult=await cloud().from('recall_users').select('id,email,name').eq('id',session.user_id).maybeSingle();
    if(userResult.error)throw new Error(userResult.error.message);
    const user=userResult.data;
    return user as User | null;
  }
  return row<User>(`SELECT users.id,users.email,users.name FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?`,hashToken(token),new Date().toISOString()) || null;
}
export async function setSession(userId: string) {
  const token=randomBytes(32).toString('hex');
  const expires=new Date(Date.now()+30*86400000);
  if (cloudConfigured()) dataOrThrow(await cloud().from('recall_sessions').insert({token_hash:hashToken(token),user_id:userId,expires_at:expires.toISOString()}).select('token_hash').single());
  else run('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',hashToken(token),userId,expires.toISOString());
  (await cookies()).set('recall_session',token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',expires});
  return token;
}
export async function clearSession() {
  const authorization=(await headers()).get('authorization');
  const bearer=authorization?.startsWith('Bearer ')?authorization.slice(7).trim():'';
  const token=bearer || (await cookies()).get('recall_session')?.value;
  if(token) {
    if(cloudConfigured()) dataOrThrow(await cloud().from('recall_sessions').delete().eq('token_hash',hashToken(token)).select('token_hash'));
    else run('DELETE FROM sessions WHERE token_hash=?',hashToken(token));
  }
  (await cookies()).delete('recall_session');
}
