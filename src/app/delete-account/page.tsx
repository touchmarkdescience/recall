'use client';
import Link from 'next/link';
import { useState } from 'react';
export default function DeleteAccount() {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[done,setDone]=useState(false);
  async function submit(event:React.FormEvent) {
    event.preventDefault(); if(!confirmed||busy)return;
    setBusy(true);setMessage('');
    try {
      // Explicit credentials prevent deleting a different signed-in account on a shared browser.
      const login=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
      if(!login.ok)throw new Error('Check your email and password.');
      const result=await fetch('/api/account',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({password,confirmation:'DELETE'})});
      if(!result.ok)throw new Error('Deletion could not be completed. Please contact mohan@touchmarkdes.com.');
      setPassword('');setDone(true);setMessage('Your Recall account and associated active database records have been deleted.');
    } catch(error) {setMessage(error instanceof Error?error.message:'Please contact support.');}
    finally {setBusy(false);}
  }
  return <main className="site-document">
    <Link href="/">← Recall</Link><h1>Delete your Recall account</h1>
    <p>Recall is operated by Touchmark Descience Pvt Ltd. You can delete your account here without installing the app, or use Settings → Delete account in the native app.</p>
    <p>This permanently removes your active Recall account, sessions, people, conversations, actions, settings, push subscriptions and pending Sheet exports. It cannot be undone. Already exported Google Sheets must be deleted separately by their owner. Sign out of Recall on other devices to clear scheduled reminders there. Provider backups and operational logs may follow different retention arrangements; see the <Link href="/privacy">privacy policy</Link>.</p>
    {!done && <form onSubmit={submit} style={{display:'grid',gap:16}}>
      <label>Account email<input type="email" autoComplete="username" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={busy} style={{display:'block',width:'100%',fontSize:16,padding:12}}/></label>
      <label>Current password<input type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={e=>setPassword(e.target.value)} disabled={busy} style={{display:'block',width:'100%',fontSize:16,padding:12}}/></label>
      <label style={{display:'flex',gap:12,alignItems:'center'}}><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={busy}/>I understand this permanently deletes my account and its Recall records.</label>
      <button type="submit" disabled={busy||!confirmed} style={{padding:14,fontSize:16,background:'#8b3028',color:'white',border:0,borderRadius:12}}>{busy?'Deleting…':'Delete account permanently'}</button>
    </form>}
    <p role="status">{message}</p>
    <p>Cannot sign in? Email <a href="mailto:mohan@touchmarkdes.com?subject=Recall%20account%20deletion%20request">mohan@touchmarkdes.com</a> with the subject “Recall account deletion request” and your registered email. We will verify account ownership before processing your request. Do not send your password.</p>
  <footer><Link href="/">Home</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/support">Support</Link></footer></main>;
}
