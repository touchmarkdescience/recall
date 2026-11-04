const STATIC_CACHE='recall-static-v1';
self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', e => e.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('recall-static-')&&key!==STATIC_CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin!==self.location.origin)return;
  if(!url.pathname.startsWith('/_next/static/')&&!/^\/(?:icon-(?:192|512)\.png|apple-touch-icon\.png|icon\.svg)$/.test(url.pathname))return;
  e.respondWith((async()=>{
    const cache=await caches.open(STATIC_CACHE);
    try {
      const response=await fetch(e.request);
      if(response.ok)await cache.put(e.request,response.clone());
      return response;
    } catch {
      const cached=await cache.match(e.request);
      if(cached)return cached;
      throw new Error('Static asset unavailable');
    }
  })());
});
self.addEventListener('push', e => { let data={}; try { data=e.data?.json() || {}; } catch {} e.waitUntil(self.registration.showNotification(data.title || 'Recall reminder', {body:data.body || 'You have a follow-up due.', icon:'/icon.svg', badge:'/icon.svg', tag:data.tag || 'recall-reminder', data:{url:data.url || '/'}})); });
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.openWindow(e.notification.data?.url || '/')); });
