import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const modules=['core.mjs','store.mjs','app.mjs'];
const code=(await Promise.all(modules.map(async name=>(await readFile(resolve(root,'src',name),'utf8')).replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'')))).join('\n\n');
const css=await readFile(resolve(root,'src/style.css'),'utf8');
const hash=createHash('sha256').update(code+css).digest('hex').slice(0,12);
const html=`<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Feit Planner — меньше шума, больше дел</title>
<meta name="description" content="Реалистичный план дня, сохранение задач на устройстве и один понятный следующий шаг.">
<meta name="theme-color" content="#4f63ed"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Feit Planner">
<link rel="manifest" href="./manifest.webmanifest"><link rel="icon" href="./icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="./apple-touch-icon.png">
<style>${css}</style>
</head><body>
<a class="skip" href="#main">К содержимому</a>
<div class="app-shell"><aside class="sidebar" id="sidebar" aria-label="Навигация"></aside><main class="main" id="main">
<div class="boot"><div class="brand-logo">F</div><h1>Feit Planner</h1><p>Открываем ваши дела…</p><p class="fallback">На iPhone открывайте <strong>ссылку опубликованного сайта в Safari</strong>, а не HTML в просмотрщике файлов. Предпросмотр файла не запускает приложение.</p><noscript><p>Для работы нужен JavaScript. Откройте сайт в обычном браузере.</p></noscript></div>
</main></div>
<nav id="mobile-nav" class="mobile-nav" aria-label="Основные разделы"></nav>
<button id="fab" class="fab" type="button" aria-label="Добавить задачу"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
<button id="session-strip" class="session-strip" type="button" aria-label="Открыть текущую сессию" hidden></button>
<dialog id="modal" class="dialog" aria-labelledby="dialog-title"></dialog><dialog id="confirm-dialog" class="dialog" aria-label="Подтверждение"></dialog>
<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
<script>/* Feit Planner 2.0.0 | build ${hash} */\n(()=>{\n'use strict';\n${code.replace(/<\/script/gi,'<\\/script')}\n})();</script>
</body></html>`;
await mkdir(resolve(root,'site'),{recursive:true});
for(const name of await readdir(resolve(root,'public')))await copyFile(resolve(root,'public',name),resolve(root,'site',name));
await writeFile(resolve(root,'site/index.html'),html);
const sw=`/* Feit Planner 2.0.0 | ${hash} */
const PREFIX='feit-planner:'+self.registration.scope+':';
const CACHE=PREFIX+'${hash}';
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
});`;
await writeFile(resolve(root,'site/sw.js'),sw);
await writeFile(resolve(root,'site/.nojekyll'),'');
await writeFile(resolve(root,'site/manifest.webmanifest'),JSON.stringify({id:'./',name:'Feit Planner',short_name:'Feit',description:'Один понятный следующий шаг',lang:'ru',start_url:'./',scope:'./',display:'standalone',background_color:'#f6f7fb',theme_color:'#4f63ed',icons:[{src:'./icon-192.png',sizes:'192x192',type:'image/png'},{src:'./icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]},null,2));
console.log(`Build ${hash}: index.html (${Buffer.byteLength(html)} bytes); no runtime dependencies.`);
