import App from '@/components/App';
import Landing from '@/components/Landing';
import { currentUser } from '@/lib/auth';
export default async function Page(){
  // Existing signed-in users and installed PWAs retain their current entry point.
  const user=await currentUser();
  return user?<App/>:<Landing/>;
}
