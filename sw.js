/* Feit Planner 2.0.0 | ceabf5630a65 */
const PREFIX='feit-planner:'+self.registration.scope+':';
const CACHE=PREFIX+'ceabf5630a65';
const HOME=new URL('./index.html',self.registration.scope).href;
const FILES=['./','./index.html','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);
 if(event.request.method!=='GET'||u.origin!==self.location.origin||!u.href.startsWith(self.registration.scope))return;
 if(u.pathname.endsWith('/sw.js'))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const key=event.request.mode==='navigate'?HOME:event.request;
  try{const response=await fetch(event.request);if(response.ok&&response.type==='basic')await cache.put(key,response.clone());if(response.ok)return response;const old=await cache.match(key);return old||response;}
  catch{const saved=await cache.match(key);return saved||new Response('Нет подключения. Откройте приложение один раз с интернетом.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}
 })());
});