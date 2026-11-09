import Link from 'next/link';
import type { Metadata } from 'next';
export const metadata:Metadata={title:'Recall support'};
export default function Support(){return <main className="site-document">
 <Link className="site-brand" href="/"><img src="/recall-icon-v2-192.png" width="40" height="40" alt=""/>Recall</Link>
 <h1>A little help with Recall.</h1><p>Recall is free to use, operated by Touchmark Descience Pvt Ltd. For account, privacy or app support, email <a href="mailto:mohan@touchmarkdes.com">mohan@touchmarkdes.com</a>.</p>
 <h2>Getting started</h2><p><Link href="/app">Create an account or open the web app</Link>. Speak naturally about the action and timing, review the details and save. You can also add an action manually. Your person’s name is optional; tasks without a person appear as Guest.</p>
 <h2>Not receiving reminders?</h2><p>In the native app, open Settings and check notification permissions, the notification channel and precise timing access. Use “Test reminder in 1 minute,” then leave the app to test delivery. Every action needs a specific date and time. Old tasks without one need their reminder time corrected.</p><p>Native reminders already scheduled on the phone can work offline. New records need a connection to save and sync. Force stop, disabled notifications and manufacturer battery restrictions may prevent alerts. Browser Web Push requires connectivity; iPhone web notifications require the installed Home Screen app and permission.</p>
 <h2>Speech recognition</h2><p>The Android app uses your phone’s speech recognition service and currently focuses on English. Check microphone permission and your phone’s speech service. If recognition is unavailable, use manual entry. Always check names and times before saving.</p>
 <h2>Report a problem</h2><p>Include your device model, Android/iOS version, app version, what you expected and what happened. A screenshot can help, but remove private customer information. Never send passwords, session tokens or API keys.</p>
 <h2>Delete your account</h2><p>Use Settings → Delete account or the <Link href="/delete-account">account deletion page</Link>. If you cannot sign in, contact support from your registered email. We will verify account ownership.</p>
 <footer><Link href="/">Home</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/app">Open Recall</Link></footer>
 </main>}
