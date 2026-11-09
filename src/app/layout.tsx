import type { Metadata, Viewport } from 'next';
import './globals.css';
import './sales.css';
import './unified.css';
import './board.css';
import './site.css';
import InstallPrompt from '@/components/InstallPrompt';
export const metadata:Metadata={title:'Recall — Remember every promise',description:'Free voice follow-ups, meetings and reminders. Speak naturally, review your next steps and remember what matters.',manifest:'/manifest.webmanifest',icons:{icon:[{url:'/recall-favicon-v2-16.png',sizes:'16x16',type:'image/png'},{url:'/recall-favicon-v2-32.png',sizes:'32x32',type:'image/png'},{url:'/recall-favicon-v2-48.png',sizes:'48x48',type:'image/png'},{url:'/recall-icon-v2-192.png',sizes:'192x192',type:'image/png'}],apple:'/recall-apple-v2-180.png'},appleWebApp:{capable:true,statusBarStyle:'default',title:'Recall'}};
export const viewport:Viewport={themeColor:'#f8faf7',width:'device-width',initialScale:1,viewportFit:'cover'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><head><meta name="apple-mobile-web-app-capable" content="yes"/></head><body>{children}<InstallPrompt/></body></html>}
