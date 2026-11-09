import App from '@/components/App';
import type { Metadata } from 'next';
export const metadata:Metadata={title:'Open Recall',robots:{index:false,follow:false}};
export default async function AppPage({searchParams}:{searchParams:Promise<{mode?:string}>}){
  const {mode}=await searchParams;
  return <App initialAuthMode={mode==='login'?'login':'register'}/>;
}
