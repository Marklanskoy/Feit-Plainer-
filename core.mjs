/** Feit Planner 2.0 — pure domain model. No DOM, network or database access. */
export const VERSION = '2.0.0';
export const DAY_MS = 86400000;
export const clone = value => structuredClone(value);
export const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export const pad = n => String(n).padStart(2, '0');
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
export const timeOf = (d = new Date()) => d.getHours()*60+d.getMinutes();
export const shiftDay = (day, count) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate()+count); return dateKey(d); };
export const fmtTime = min => `${pad(Math.floor(min/60))}:${pad(min%60)}`;
export const parseTime = value => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || '')) throw Error('Укажите корректное время'); return +value.slice(0,2)*60 + +value.slice(3,5); };
export const duration = m => m >= 60 ? `${Math.floor(m/60)} ч${m%60 ? ` ${Math.round(m%60)} мин` : ''}` : `${Math.round(m)} мин`;
export const isDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(+new Date(value+'T12:00:00')) && dateKey(new Date(value+'T12:00:00')) === value;
export const active = t => !t.del && t.st === 'active';
export const estimate = t => t.left != null ? t.left : t.min != null && t.min > 0 ? t.min : 30;
export const isOverdue = (t, day=dateKey(), now=timeOf()) => !!(active(t) && t.due && t.due < `${day}T${fmtTime(now)}`);
export const isCarry = (t, day=dateKey()) => active(t) && ((t.day && t.day<day) || ((!t.day || t.day<=day) && t.due && t.due.slice(0,10)<day));
export const isToday = (t, day=dateKey()) => active(t) && (t.day === day || ((!t.day || t.day<=day) && t.due?.slice(0,10)===day));
export const dayLabel = (day, base=dateKey()) => !day ? 'Без даты' : day===base ? 'Сегодня' : day===shiftDay(base,1) ? 'Завтра' : new Date(day+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short', ...(day.slice(0,4)!==base.slice(0,4)?{year:'numeric'}:{})});
const integer = (v, lo, hi) => Number.isInteger(v) && v>=lo && v<=hi;
const assert = (test, message) => { if(!test) throw Error(message); };
const weekdays = () => Object.fromEntries(Array.from({length:7}, (_,i)=>[i, i===0||i===6?[]:[[540,1080]]]));
export const initialState = () => ({v:2,revision:0,tasks:[],events:[],projects:[],goals:[],sessions:[],series:[],buffers:[],activeSession:null,history:[],set:{days:weekdays(),lunch:null,gap:10,theme:'system'},migrationNotice:null});

/** Legacy field names are retained; old repeat settings require explicit activation. */
export function migrate(raw) {
  if (raw == null) return initialState();
  assert(raw && (raw.v === 1 || raw.v === 2), 'Эта версия резервной копии не поддерживается');
  const s = clone(raw), legacy = s.v === 1;
  for(const name of ['tasks','events']) assert(Array.isArray(s[name]), `В копии нет массива ${name}`);
  for(const name of ['projects','goals','sessions','series','buffers','history']) { if(s[name] == null) s[name]=[]; assert(Array.isArray(s[name]),`Некорректное поле ${name}`); }
  s.set ||= {};
  if (legacy) {
    const a = s.set.s ?? 540, b = s.set.e ?? 1080;
    assert(integer(a,0,1439)&&integer(b,1,1440)&&b>a,'Некорректное рабочее время в старой копии');
    s.set = {days:Object.fromEntries(Array.from({length:7},(_,i)=>[i,[[a,b]]])),lunch:null,gap:s.set.gap ?? 10,theme:'system'};
    s.revision=0; s.activeSession=null; s.history=[];
    const projectMap = new Map(s.projects.map(p=>[p.title,p.id]));
    let pendingRepeats = 0;
    s.tasks = s.tasks.map(t=>{
      if(t.project && !projectMap.has(t.project)) { const p={id:`legacy-project-${projectMap.size}`,title:t.project}; s.projects.push(p); projectMap.set(p.title,p.id); }
      if(t.repeat && t.repeat!=='none') pendingRepeats++;
      return {...t,rev:0,left:t.left>0?t.left:null,min:t.min>0?t.min:null,day:t.day||null,due:t.due||'',projectId:projectMap.get(t.project)||null,goalId:null,countsForGoal:false,subtasks:[],repeat:'none',legacyRepeat:t.repeat&&t.repeat!=='none'?t.repeat:null,seriesId:null,block:t.block?{...t.block,day:t.day}:null,completedAt:t.completedAt||null};
    });
    s.sessions = s.sessions.map(x=>({...x,taskId:x.taskId||x.task,seconds:x.seconds??Math.round((x.minutes||0)*60),legacy:true}));
    s.migrationNotice = {legacy:true,repeatCount:pendingRepeats};
  }
  s.v=2; s.revision ??=0; s.activeSession ??=null; s.migrationNotice ??=null;
  for(const t of s.tasks) { t.rev ??=0; t.subtasks ??=[]; t.day ||=null; t.due ||= ''; t.projectId ||= null; t.goalId ||=null; t.left ??=null; t.min ??=null; }
  validateState(s); return s;
}
function unique(list,label) { const seen=new Set(); for(const x of list){assert(x&&typeof x.id==='string'&&x.id.length>0,`Нет идентификатора: ${label}`);assert(!seen.has(x.id),`Повторяющийся идентификатор: ${label}`);seen.add(x.id);} }
function validDue(v){ return !v || (typeof v==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) && isDay(v.slice(0,10)) && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.slice(11))); }
function checkSlot(slot){ return Array.isArray(slot)&&slot.length===2&&integer(slot[0],0,1439)&&integer(slot[1],1,1440)&&slot[1]>slot[0]; }
export function validateState(s) {
  assert(s.v===2&&integer(s.revision,0,Number.MAX_SAFE_INTEGER),'Некорректная версия данных');
  for(const name of ['tasks','events','projects','goals','sessions','series','buffers','history']) assert(Array.isArray(s[name])&&s[name].length<=50000,`Некорректное поле ${name}`);
  for(const name of ['tasks','events','projects','goals','sessions','series']) unique(s[name],name);
  for(const t of s.tasks) {
    assert(typeof t.title==='string'&&t.title.trim().length>0&&t.title.length<=2000,'Пустое или слишком длинное название задачи');
    assert(['active','wait','done','cancel'].includes(t.st),'Некорректный статус задачи');
    assert(t.description==null||typeof t.description==='string','Некорректное описание');
    assert(t.priority==null||integer(t.priority,0,3),'Некорректный приоритет');
    assert(!t.day||isDay(t.day),'Некорректная дата задачи'); assert(validDue(t.due),'Некорректный дедлайн');
    assert(t.min==null||integer(t.min,1,1440),'Некорректная длительность задачи'); assert(t.left==null||integer(t.left,0,1440),'Некорректное оставшееся время');
    assert(Number.isFinite(t.ts),'Некорректная дата создания');
    assert(!t.block||(isDay(t.block.day)&&checkSlot([t.block.s,t.block.e])),'Некорректный временной блок');
    assert(Array.isArray(t.subtasks)&&t.subtasks.every(x=>x&&typeof x.id==='string'&&typeof x.title==='string'&&typeof x.done==='boolean'),'Некорректные подзадачи');
    assert(t.projectId==null||s.projects.some(p=>p.id===t.projectId),'Проект задачи не найден');
    assert(t.goalId==null||s.goals.some(g=>g.id===t.goalId),'Цель задачи не найдена');
  }
  for(const e of s.events) assert(typeof e.title==='string'&&e.title.trim()&&isDay(e.day)&&checkSlot([e.s,e.e]),'Некорректное событие');
  for(const p of s.projects) assert(typeof p.title==='string'&&p.title.trim(),'Некорректный проект');
  for(const g of s.goals) assert(typeof g.title==='string'&&g.title.trim()&&Number.isFinite(g.target)&&g.target>0&&Number.isFinite(g.value)&&g.value>=0,'Некорректная цель');
  for(const x of s.sessions) assert(Number.isFinite(x.seconds)&&x.seconds>=0&&isDay(x.day),'Некорректная сессия');
  for(const r of s.series) {
    assert(['daily','weekly','monthly'].includes(r.kind)&&isDay(r.nextDay)&&integer(r.anchorDay,1,31)&&r.template&&typeof r.template.title==='string'&&typeof r.enabled==='boolean','Некорректное повторение');
    assert(!r.until||isDay(r.until),'Некорректная дата окончания повторения');
  }
  assert(s.set&&s.set.days&&integer(s.set.gap,0,120),'Некорректные настройки');
  for(let d=0;d<7;d++) assert(Array.isArray(s.set.days[d])&&s.set.days[d].every(checkSlot),'Некорректное рабочее расписание');
  assert(s.set.lunch==null||checkSlot(s.set.lunch),'Некорректный перерыв');
  if(s.set.dayEnds)for(const [d,e] of Object.entries(s.set.dayEnds))assert(isDay(d)&&integer(e,0,1440),'Некорректное время окончания дня');
  for(const b of s.buffers) assert(isDay(b.day)&&checkSlot([b.s,b.e])&&typeof b.taskId==='string','Некорректный перерыв задачи');
  if(s.activeSession) assert(typeof s.activeSession.id==='string'&&s.tasks.some(t=>t.id===s.activeSession.taskId)&&Number.isFinite(s.activeSession.accumulatedMs)&&s.activeSession.accumulatedMs>=0&&(s.activeSession.startedAt===null||Number.isFinite(s.activeSession.startedAt)),'Некорректная активная сессия');
  return s;
}
export function parseBackup(text) {
  assert(typeof text==='string'&&text.length<=15_000_000,'Файл слишком большой (максимум 15 МБ)');
  let raw; try {raw=JSON.parse(text);} catch {throw Error('Не удалось прочитать JSON. Данные не изменены.');}
  const inspect=(value,depth=0)=>{if(depth>60)throw Error('Слишком глубокая структура копии');if(value&&typeof value==='object')for(const [key,item]of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))throw Error('Недопустимое служебное поле в копии');inspect(item,depth+1);}};inspect(raw);
  const s=migrate(raw);s.history=[];s.activeSession=null;return s;
}
export const exportState = s => JSON.stringify({...clone(s),history:[]},null,2);
export function touch(t, now=Date.now()){ t.rev=(t.rev||0)+1; t.updatedAt=now; }
export function mergeIntervals(intervals){const out=[];for(const [a,b] of intervals.filter(([a,b])=>b>a).map(x=>x.slice()).sort((x,y)=>x[0]-y[0]||x[1]-y[1])) {const p=out.at(-1);if(p&&a<=p[1])p[1]=Math.max(p[1],b);else out.push([a,b]);}return out;}
export function subtractIntervals(windows,occupied){const result=[];const busy=mergeIntervals(occupied);for(const [a,b] of mergeIntervals(windows)){let cursor=a;for(const [s,e] of busy){if(e<=cursor)continue;if(s>=b)break;if(s>cursor)result.push([cursor,Math.min(s,b)]);cursor=Math.max(cursor,e);if(cursor>=b)break;}if(cursor<b)result.push([cursor,b]);}return result;}
export const sumIntervals = xs => xs.reduce((n,[a,b])=>n+b-a,0);
export function workWindows(s,day,from=0,end=1440){const n=new Date(day+'T12:00:00').getDay();if(end===1440)end=s.set.dayEnds?.[day]??1440;return mergeIntervals((s.set.days[n]||[]).map(([a,b])=>[Math.max(a,from),Math.min(b,end)]).filter(([a,b])=>b>a));}
export function freeTime(s,day,from=0,{flex=false,end=1440}={}) {
  const blocks=s.tasks.filter(t=>active(t)&&t.block?.day===day&&(flex||t.locked)).map(t=>[t.block.s,t.block.e]);
  const occupied=[...s.events.filter(e=>e.day===day).map(e=>[e.s,e.e]),...blocks,...(s.set.lunch?[s.set.lunch]:[])];
  if(flex) occupied.push(...s.buffers.filter(b=>b.day===day&&s.tasks.some(t=>t.id===b.taskId&&active(t)&&t.block?.day===day)).map(b=>[b.s,b.e]));
  return subtractIntervals(workWindows(s,day,from,end),occupied);
}
function fixedConflicts(s,day,from){const xs=[...s.events.filter(e=>e.day===day&&e.e>from).map(e=>({id:e.id,title:e.title,s:e.s,e:e.e})),...s.tasks.filter(t=>active(t)&&t.locked&&t.block?.day===day&&t.block.e>from).map(t=>({id:t.id,title:t.title,s:t.block.s,e:t.block.e}))];const out=[];for(let i=0;i<xs.length;i++)for(let j=i+1;j<xs.length;j++)if(xs[i].s<xs[j].e&&xs[j].s<xs[i].e)out.push(`${xs[i].title} ↔ ${xs[j].title}`);return out;}
/** Deterministic earliest-deadline heuristic. Does not claim a global optimum. */
export function planDay(s,{day=dateKey(),from=timeOf(),end=1440,includeCarry=false,remaining={}}={}) {
  const tasks=s.tasks.map(t=>Object.hasOwn(remaining,t.id)?{...t,left:remaining[t.id]}:t);
  const candidates=tasks.filter(t=>isToday(t,day)||(includeCarry&&isCarry(t,day)));
  const fixed=candidates.filter(t=>t.locked&&t.block?.day===day&&t.block.e>from);
  const free=freeTime(s,day,from,{end}),gaps=free.map(x=>x.slice());
  const bound=t=>t.due?.slice(0,10)===day&&parseTime(t.due.slice(11))>=from?parseTime(t.due.slice(11)):Infinity;
  const movable=candidates.filter(t=>!fixed.some(f=>f.id===t.id)).sort((a,b)=>(bound(a)-bound(b))||(Number(!!b.main)-Number(!!a.main))||((b.priority||0)-(a.priority||0))||(Number(isOverdue(b,day,from))-Number(isOverdue(a,day,from)))||a.ts-b.ts||a.id.localeCompare(b.id));
  const placed=fixed.map(t=>({id:t.id,title:t.title,s:t.block.s,e:t.block.e,locked:true,assumed:false,late:isOverdue(t,day,from)})),unplaced=[],buffers=[];
  for(const t of movable){
    const n=estimate(t), deadline=bound(t);
    if(t.locked&&t.block){unplaced.push({id:t.id,title:t.title,minutes:n,locked:true,reason:'Закреплённое время прошло или относится к другой дате. Измените его вручную.'});continue;}
    if(n===0){unplaced.push({id:t.id,title:t.title,minutes:0,reason:'Осталось 0 минут: завершите задачу или уточните оценку.'});continue;}
    const i=gaps.findIndex(([a,b])=>Math.min(b,deadline)-a>=n);
    if(i<0){const available=sumIntervals(gaps.map(([a,b])=>[a,Math.max(a,Math.min(b,deadline))]));const largest=Math.max(0,...gaps.map(([a,b])=>Math.max(0,Math.min(b,deadline)-a)));unplaced.push({id:t.id,title:t.title,minutes:n,late:isOverdue(t,day,from),reason:deadline<Infinity?`До срока свободно ${duration(available)}. Самое длинное окно — ${duration(largest)}, нужно ${duration(n)}.`:available<n?`Свободно ${duration(available)}, нужно ${duration(n)}.`:`Нет цельного окна на ${duration(n)}. Самое длинное — ${duration(largest)}.`});continue;}
    const [a,b]=gaps[i],endTask=a+n,endBreak=Math.min(b,endTask+s.set.gap);
    placed.push({id:t.id,title:t.title,s:a,e:endTask,locked:false,assumed:t.min==null&&t.left==null,late:isOverdue(t,day,from)});
    if(endBreak>endTask)buffers.push({id:`buffer-${t.id}`,taskId:t.id,day,s:endTask,e:endBreak});gaps[i][0]=endBreak;
  }
  return {day,from,end,revision:s.revision,placed:placed.sort((a,b)=>a.s-b.s),unplaced,buffers,free,capacity:sumIntervals(free),required:movable.reduce((n,t)=>n+estimate(t),0),remaining:clone(remaining),conflicts:fixedConflicts(s,day,from)};
}
export function applyPlan(s,plan,transferIds=[]){
  assert(s.revision===plan.revision,'Данные изменились. Пересчитайте и проверьте предложение ещё раз.');
  assert(!plan.conflicts.length,'Сначала устраните пересечение закреплённых событий.');
  const taskIds=new Set([...plan.placed,...plan.unplaced].map(x=>x.id));
  s.buffers=s.buffers.filter(b=>!(b.day===plan.day&&taskIds.has(b.taskId)));
  for(const x of plan.placed){const t=s.tasks.find(t=>t.id===x.id);assert(t&&active(t),'Задача изменилась');if(x.locked)continue;t.block={day:plan.day,s:x.s,e:x.e};if(t.day&&t.day!==plan.day)t.moves=(t.moves||0)+1;t.day=plan.day;if(Object.hasOwn(plan.remaining,t.id))t.left=plan.remaining[t.id];if(x.assumed){t.min=30;t.estimateSource='assumed';}touch(t);}
  for(const x of plan.unplaced){const t=s.tasks.find(t=>t.id===x.id);if(t.locked)continue;t.block=null;if(Object.hasOwn(plan.remaining,t.id))t.left=plan.remaining[t.id];if(transferIds.includes(t.id)){assert(!t.due||t.due.slice(0,10)>plan.day,'Задачу с наступившим сроком нельзя незаметно отложить');t.day=shiftDay(plan.day,1);t.moves=(t.moves||0)+1;}touch(t);}
  s.buffers.push(...plan.buffers);s.set.dayEnds??={};s.set.dayEnds[plan.day]=plan.end;
}
export function timeline(s,day){return [...s.events.filter(e=>e.day===day).map(e=>({kind:'event',id:e.id,title:e.title,s:e.s,e:e.e,locked:true})),...s.tasks.filter(t=>!t.del&&t.st!=='cancel'&&t.st!=='wait'&&t.block?.day===day).map(t=>({kind:'task',id:t.id,title:t.title,s:t.block.s,e:t.block.e,locked:!!t.locked,done:t.st==='done'})),...s.buffers.filter(b=>b.day===day&&s.tasks.some(t=>t.id===b.taskId&&active(t)&&t.block?.day===day)).map(b=>({...b,kind:'break',title:'Перерыв'})),...(s.set.lunch?[{kind:'break',id:'lunch',s:s.set.lunch[0],e:s.set.lunch[1],title:'Перерыв'}]:[])].sort((a,b)=>a.s-b.s||a.e-b.e);}
export function currentContext(s,day=dateKey(),now=timeOf()) {
  const line=timeline(s,day).filter(x=>!x.done&&x.e>now),current=line.filter(x=>x.s<=now&&now<x.e);
  const event=current.find(x=>x.kind==='event');if(event)return {kind:'event',item:event,next:line.find(x=>x.s>=event.e&&x.kind!=='break')||null};
  if(s.activeSession){const task=s.tasks.find(t=>t.id===s.activeSession.taskId);if(task&&active(task))return {kind:'focus',task,next:line.find(x=>x.s>now&&x.kind==='event')||null};}
  const task=current.find(x=>x.kind==='task');if(task)return {kind:'task',task:s.tasks.find(t=>t.id===task.id),next:line.find(x=>x.s>=task.e&&x.kind!=='break')||null};
  const rest=current.find(x=>x.kind==='break');if(rest)return {kind:'break',item:rest,next:line.find(x=>x.s>=rest.e&&x.kind!=='break')||null};
  const next=line.find(x=>x.s>now&&x.kind!=='break')||null;
  const gap=freeTime(s,day,now,{flex:true}).find(([a])=>a===now);
  const candidate=gap&&s.tasks.filter(t=>isToday(t,day)&&!t.locked&&(!t.block||t.block.day!==day||t.block.e<=now)&&estimate(t)>0&&estimate(t)<=gap[1]-now).sort((a,b)=>Number(!!b.main)-Number(!!a.main)||(b.priority||0)-(a.priority||0)||a.ts-b.ts)[0];
  return candidate?{kind:'suggestion',task:candidate,next}:{kind:'free',next,gap};
}
export function nextOccurrence(day,kind,anchorDay){if(kind==='daily')return shiftDay(day,1);if(kind==='weekly')return shiftDay(day,7);const d=new Date(day+'T12:00:00');const last=new Date(d.getFullYear(),d.getMonth()+2,0,12).getDate();return dateKey(new Date(d.getFullYear(),d.getMonth()+1,Math.min(anchorDay,last),12));}
export function ensureOccurrences(s,today=dateKey()) {
  const end=shiftDay(today,30);let count=0;
  for(const r of s.series){if(!r.enabled)continue;let guard=0;while(r.nextDay<=end&&(!r.until||r.nextDay<=r.until)){
    if(++guard>3000)throw Error('Слишком большой период повторений. Укажите более позднюю дату начала.');
    const day=r.nextDay,tid=`repeat:${r.id}:${day}`;
    if(!s.tasks.some(t=>t.id===tid)){s.tasks.push({...clone(r.template),id:tid,rev:0,ts:Date.now()+count,st:'active',day,due:'',block:null,left:null,moves:0,started:false,del:0,main:false,repeat:r.kind,seriesId:r.id,occurrenceDay:day,subtasks:(r.template.subtasks||[]).map(x=>({...x,done:false})),completedAt:null});count++;}
    r.nextDay=nextOccurrence(day,r.kind,r.anchorDay);
  }}return count;
}
export function saveTask(s,draft,{taskId=null,expectedRev=null,now=Date.now()}={}) {
  const existing=taskId?s.tasks.find(t=>t.id===taskId):null;
  if(taskId){assert(existing,'Задача больше не существует');assert(existing.rev===expectedRev,'Задачу изменили в другой вкладке. Закройте форму и откройте её заново.');}
  assert(draft.title?.trim(),'Введите название задачи');assert(!draft.day||isDay(draft.day),'Выберите корректную дату');assert(validDue(draft.due),'Укажите корректный дедлайн');
  assert(!draft.main||!!draft.day,'Сначала выберите день для главной задачи');
  if(draft.main)assert(s.tasks.filter(t=>active(t)&&t.day===draft.day&&t.main&&t.id!==taskId).length<3,'На день можно выбрать до трёх главных дел');
  if(draft.block){assert(draft.day,'Для времени выполнения нужен день');assert(checkSlot([draft.block.s,draft.block.e]),'Некорректное время выполнения');const clashes=[...s.events.filter(e=>e.day===draft.day),...s.tasks.filter(t=>active(t)&&t.id!==taskId&&t.block?.day===draft.day).map(t=>({...t.block,title:t.title}))].filter(x=>x.s<draft.block.e&&draft.block.s<x.e);assert(!clashes.length,`Пересечение с «${clashes[0]?.title}». Измените время.`);}
  const changedDay=existing&&existing.day!==draft.day;
  const t={...(existing||{id:id(),ts:now,rev:0,st:'active',moves:0,del:0,completedAt:null}),...clone(draft),title:draft.title.trim(),day:draft.day||null,due:draft.due||'',left:existing&&existing.min===draft.min?existing.left:null};
  if(changedDay)t.moves=(t.moves||0)+1;
  if(t.block)t.block.day=t.day;
  if(existing&&s.activeSession?.taskId===existing.id&&changedDay)throw Error('Сначала завершите или остановите активную сессию этой задачи');
  if(t.repeat&&t.repeat!=='none'&&!existing?.seriesId){assert(t.day,'Для повторения выберите первый день');const sid=id();const series={id:sid,kind:t.repeat,anchorDay:+t.day.slice(-2),nextDay:nextOccurrence(t.day,t.repeat,+t.day.slice(-2)),enabled:true,until:null,template:{title:t.title,min:t.min,description:t.description||'',projectId:t.projectId||null,goalId:t.goalId||null,countsForGoal:!!t.countsForGoal,priority:t.priority||0,subtasks:clone(t.subtasks||[]),locked:false}};t.seriesId=sid;t.occurrenceDay=t.day;s.series.push(series);}
  if(existing?.seriesId){t.seriesId=existing.seriesId;t.repeat=existing.repeat;}
  touch(t,now);if(existing)s.tasks[s.tasks.indexOf(existing)]=t;else s.tasks.push(t);
  s.buffers=s.buffers.filter(b=>b.taskId!==t.id);
  ensureOccurrences(s);return t.id;
}
export function setTaskStatus(s,taskId,st,now=Date.now()) {const t=s.tasks.find(t=>t.id===taskId);assert(t,'Задача не найдена');assert(['active','wait','done','cancel'].includes(st),'Некорректный статус');if(s.activeSession?.taskId===taskId)endFocus(s,s.activeSession.id,st==='done',now);t.st=st;t.completedAt=st==='done'?new Date(now).toISOString():null;if(st==='wait'||st==='cancel')t.block=null;touch(t,now);s.buffers=s.buffers.filter(b=>b.taskId!==taskId);}
export function sessionMilliseconds(session,now=Date.now()){return session?session.accumulatedMs+(session.startedAt!=null?Math.max(0,now-session.startedAt):0):0;}
export function startFocus(s,taskId,now=Date.now()) {assert(!s.activeSession,'Уже идёт другая сессия. Завершите её перед началом новой.');const t=s.tasks.find(t=>t.id===taskId);assert(t&&active(t),'Эту задачу нельзя начать');t.started=true;touch(t,now);s.activeSession={id:id(),taskId,startedAt:now,accumulatedMs:0,day:dateKey(new Date(now)),createdAt:now};}
export function pauseFocus(s,sessionId,now=Date.now()){const x=s.activeSession;assert(x&&x.id===sessionId,'Сессия изменилась в другой вкладке');if(x.startedAt!=null){x.accumulatedMs=sessionMilliseconds(x,now);x.startedAt=null;}else x.startedAt=now;}
export function endFocus(s,sessionId,done=false,now=Date.now()) {const x=s.activeSession;assert(x&&x.id===sessionId,'Сессия уже завершена');const seconds=Math.floor(sessionMilliseconds(x,now)/1000);s.sessions.push({id:x.id,taskId:x.taskId,day:x.day,startedAt:x.createdAt,endedAt:now,seconds});if(done){const t=s.tasks.find(t=>t.id===x.taskId);if(t){t.st='done';t.completedAt=new Date(now).toISOString();touch(t,now);s.buffers=s.buffers.filter(b=>b.taskId!==t.id);}}s.activeSession=null;}
export function goalProgress(s,g){const linked=s.tasks.filter(t=>!t.del&&t.st==='done'&&t.goalId===g.id&&t.countsForGoal).length;return {value:g.value+linked,target:g.target,manual:g.value,linked};}

/** Field-level undo rejects conflicts; unrelated newer edits are preserved. */
const ENTITY_KEYS=['tasks','events','projects','goals','series','buffers'];
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function recordHistory(before,after,label){
  const changes=[];
  for(const collection of ENTITY_KEYS){const ids=new Set([...before[collection],...after[collection]].map(x=>x.id));for(const entityId of ids){const a=before[collection].find(x=>x.id===entityId),b=after[collection].find(x=>x.id===entityId);if(!a||!b){if(!eq(a,b))changes.push({collection,id:entityId,whole:true,before:a||null,after:b||null});continue;}for(const k of new Set([...Object.keys(a),...Object.keys(b)])){if(['rev','updatedAt'].includes(k))continue;if(!eq(a[k],b[k]))changes.push({collection,id:entityId,key:k,before:a[k]??null,after:b[k]??null});}}}
  if(!eq(before.set,after.set))changes.push({collection:'set',whole:true,before:clone(before.set),after:clone(after.set)});
  if(changes.length)after.history=[...(after.history||[]),{id:id(),label,ts:Date.now(),changes}].slice(-15);
}
export function undoHistory(s,operationId){const op=s.history.find(x=>x.id===operationId);assert(op,'Отмена уже недоступна');
  for(const c of op.changes){const current=c.collection==='set'?s.set:s[c.collection].find(x=>x.id===c.id)||null;const actual=c.whole?current:current?.[c.key]??null;const expected=c.after;if(c.whole&&actual&&expected&&c.collection!=='set'){const a=clone(actual),b=clone(expected);delete a.rev;delete a.updatedAt;delete b.rev;delete b.updatedAt;assert(eq(a,b),'После этой операции данные изменились. Отмена не затронет новые изменения.');}else assert(eq(actual,expected),'После этой операции данные изменились. Отмена не затронет новые изменения.');}
  for(const c of [...op.changes].reverse()){if(c.collection==='set'){s.set=clone(c.before);continue;}const list=s[c.collection],at=list.findIndex(x=>x.id===c.id);if(c.whole){if(c.before==null){if(at>=0)list.splice(at,1);}else if(at>=0)list[at]=clone(c.before);else list.push(clone(c.before));}else{list[at][c.key]=clone(c.before);if(c.collection==='tasks')touch(list[at]);}}
  s.history=s.history.filter(x=>x.id!==operationId);validateState(s);
}
