import Link from 'next/link';
import type { Metadata } from 'next';
export const metadata:Metadata={title:'Recall terms of use'};
export default function Terms(){return <main className="site-document">
 <Link className="site-brand" href="/"><img src="/recall-icon-v2-192.png" width="40" height="40" alt=""/>Recall</Link>
 <h1>Recall terms of use</h1><p>Last updated: 9 November 2026. Recall is provided by Touchmark Descience Pvt Ltd. By using Recall, you agree to these terms and acknowledge the <Link href="/privacy">privacy policy</Link>.</p>
 <h2>Free to use</h2><p>Recall is free to use. No subscription, purchase or payment is required. We intend to keep Recall free. Your own mobile data and connectivity charges may still apply.</p>
 <h2>Your account and information</h2><p>Keep your account credentials secure. Only submit information you are authorized to process. Obtain any consent required before recording or entering another person’s information. Do not use Recall for unlawful activity, harassment, unauthorized access or attempts to disrupt the service.</p>
 <h2>Review before relying on it</h2><p>Speech recognition and text extraction can make mistakes. Check names, actions, dates, times and reminder offsets before saving. Phone settings, permissions, battery restrictions, connectivity and software changes can affect notifications. Recall is a productivity aid and should not be the sole system for critical medical, safety, legal or financial deadlines.</p>
 <h2>Availability and changes</h2><p>We may maintain, improve or change the service. Availability, recognition accuracy and notification delivery are not guaranteed. These terms do not exclude rights that cannot legally be excluded. Contact us if you experience a problem or need help accessing your records.</p>
 <h2>Deletion and contact</h2><p>You may stop using Recall and <Link href="/delete-account">delete your account</Link>. Deletion does not erase copies you already exported to third-party services such as Google Sheets. For support or questions, email <a href="mailto:mohan@touchmarkdes.com">mohan@touchmarkdes.com</a>.</p>
 <footer><Link href="/">Home</Link><Link href="/privacy">Privacy</Link><Link href="/support">Support</Link><Link href="/app">Open Recall</Link></footer>
 </main>}
