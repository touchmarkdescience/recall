import Link from 'next/link';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Recall privacy policy' };
export default function Privacy() {
  return <main className="site-document">
    <Link href="/">← Recall</Link>
    <h1>Recall privacy policy</h1>
    <p>Last updated: 9 November 2026. Recall is operated by Touchmark Descience Pvt Ltd for managing work conversations, commitments and reminders. Contact: <a href="mailto:mohan@touchmarkdes.com">mohan@touchmarkdes.com</a>.</p>
    <h2>Information you provide</h2>
    <p>We process your account name, email address and password for authentication. Passwords are stored as salted hashes. We store the people you enter, conversation text, task details, meeting and reminder times, completion status and settings so Recall can show your history and commitments. Avoid recording confidential information you are not authorized to share.</p>
    <h2>Speech and microphone</h2>
    <p>The native Android app asks for microphone access only for speech recognition. It uses your phone’s speech recognition service; availability and whether speech is processed on the device or by that service’s servers depend on your phone, installed service and settings. Recall’s native app sends the resulting text to the Recall server when you request review or save. It does not upload an audio recording to Recall.</p>
    <p>The separate web app can record audio locally and send a recording to the server-selected Google Gemini or Groq transcription provider. These web recording options are separate from the Android app’s phone speech recognition.</p>
    <h2>Processing and service providers</h2>
    <p>Recall uses Vercel to host the API and Supabase to store account and application records. Text review may use local rules or OpenAI when enabled on the server. These services process data to provide the requested functionality. Optional Google Sheets integration sends saved records to the Sheet webhook configured by the account owner; copies in that Sheet remain under its owner’s control.</p>
    <h2>Signup security and abuse prevention</h2>
    <p>When website signup protection is enabled, Google reCAPTCHA v3 processes browser and device information to assess automated activity. Google's <a href="https://policies.google.com/privacy">Privacy Policy</a> and <a href="https://policies.google.com/terms">Terms of Service</a> apply. Recall uses the verification result to allow or reject account creation; it does not treat this as verification of email ownership.</p>
    <p>When resource protection is enabled, Recall keeps limited security counters under keyed hashes of network or account identifiers to restrict repeated requests and AI usage. Counter keys do not contain raw email addresses or IP addresses. Expired counters are cleaned during subsequent requests after a one-day grace period; cleanup waits if traffic stops. These counters are used for service protection, not an advertising or activity dashboard.</p>
    <h2>Reminders and device storage</h2>
    <p>The native app keeps its session in secure device storage and schedules a limited queue of reminders with the phone’s notification system. Once scheduled, these alerts can work without an internet connection, subject to permissions, alarm access and phone restrictions. Web Push uses a browser push subscription and requires connectivity for delivery. Recall does not request access to your device contact book or location.</p>
    <h2>Use and disclosure</h2>
    <p>We use these records to authenticate your account, sync your data, interpret your notes and provide reminders. Recall contains no advertising or advertising SDK. We do not sell your information. Information may be disclosed to service providers as described above or when required by law.</p>
    <h2>Retention and your choices</h2>
    <p>Application records remain until removed or the account is deleted. Deleting an account removes its active Recall database records, sessions, saved people, conversations, actions, settings, subscriptions and pending Sheet exports. Already exported Sheets, previously displayed notifications and device copies outside Recall are not remotely erased. Hosting-provider backups and operational logs may persist under the provider’s retention arrangements; contact us for retention details and help with deletion requests.</p>
    <p>You can deny microphone and notification permissions in your phone settings, use manual entry, sign out, or <Link href="/delete-account">delete your account and associated Recall data</Link>. Contact support if you cannot sign in or need help accessing or correcting your information.</p>
    <h2>Changes and contact</h2>
    <p>We will update this page when Recall’s processing changes. For questions or privacy requests, email <a href="mailto:mohan@touchmarkdes.com">mohan@touchmarkdes.com</a>.</p>
  <footer><Link href="/">Home</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/support">Support</Link></footer></main>;
}
