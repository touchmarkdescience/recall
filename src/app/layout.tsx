import type { Metadata, Viewport } from 'next';
import './globals.css';
import './sales.css';
import './unified.css';
import InstallPrompt from '@/components/InstallPrompt';
export const metadata:Metadata={title:'Recall — Voice Follow Up',description:'Your conversations, next steps and reminders in one calm place.',manifest:'/manifest.webmanifest',icons:{icon:'/icon-192.png',apple:'/apple-touch-icon.png'},appleWebApp:{capable:true,statusBarStyle:'default',title:'Recall'}};
export const viewport:Viewport={themeColor:'#f8faf7',width:'device-width',initialScale:1,viewportFit:'cover'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><head><meta name="apple-mobile-web-app-capable" content="yes"/></head><body>{children}<InstallPrompt/></body></html>}
