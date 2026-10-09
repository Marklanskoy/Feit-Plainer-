import { clone, migrate, initialState, validateState, recordHistory, ensureOccurrences, dateKey } from './core.mjs';

/** All mutations read AND write inside ONE readwrite transaction.
 * IndexedDB serializes these transactions across same-origin tabs as well.
 * UI state changes only on transaction.oncomplete, never on request.onsuccess.
 */
export class PlannerStore {
  constructor({name='ritm',version=2}={}) {
    this.name=name; this.version=version; this.db=null; this.state=null;
    this.queue=Promise.resolve(); this.pending=0; this.listeners=new Set(); this.lastError=null;
    this.channel=null;try{if(typeof BroadcastChannel!=='undefined')this.channel=new BroadcastChannel(`feit:${name}:v2`);}catch{/* Visibility refresh is the fallback when channels are blocked. */}
    if(this.channel)this.channel.onmessage=()=>{this.refresh().catch(()=>{});};
  }
  subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  emit(){for(const listener of this.listeners)listener(this.state,{pending:this.pending,error:this.lastError});}
  async open(){
    if(this.db)return this.db;
    return new Promise((resolve,reject)=>{
      let settled=false;
      const req=indexedDB.open(this.name,this.version);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('kv'))req.result.createObjectStore('kv');};
      req.onblocked=()=>{settled=true;reject(Error('Закройте старые вкладки Feit Planner и повторите загрузку. Это нужно для безопасного обновления базы.'));};
      req.onerror=()=>reject(req.error||Error('Хранилище недоступно'));
      req.onsuccess=()=>{if(settled){req.result.close();return;}this.db=req.result;this.db.onversionchange=()=>{this.db.close();this.db=null;this.lastError='Версия приложения изменилась. Закройте формы и обновите страницу.';this.emit();};resolve(this.db);};
    });
  }
  async init(){await this.open();return this.update(s=>{ensureOccurrences(s);},{label:null});}
  update(mutator,{label=null,expectedRevision=null,backup=false}={}){
    this.pending++;this.emit();
    const task=this.queue.catch(()=>{}).then(()=>this.transaction(mutator,{label,expectedRevision,backup}));
    this.queue=task;
    return task.then(state=>{this.lastError=null;return state;}).catch(err=>{this.lastError=err?.message||'Не удалось сохранить';throw err;}).finally(()=>{this.pending--;this.emit();});
  }
  async transaction(mutator,{label,expectedRevision,backup}){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      let next=null, failure=null,changed=false;
      let tx;try{tx=db.transaction('kv','readwrite');}catch(err){reject(err);return;}
      const kv=tx.objectStore('kv'),req=kv.get('state');
      req.onsuccess=()=>{
        try{
          const raw=req.result,before=migrate(raw);
          if(expectedRevision!=null&&before.revision!==expectedRevision)throw Error('Данные изменились. Пересчитайте и проверьте предложение ещё раз.');
          next=clone(before);mutator(next,before);
          if(label)recordHistory(before,next,label);
          changed=!raw||raw.v!==2||JSON.stringify(before)!==JSON.stringify(next);
          if(!changed)return;
          next.revision=before.revision+1;validateState(next);
          if(raw?.v===1)kv.put(raw,'legacy-v1-backup');
          if(backup&&raw)kv.put(raw,'before-import-backup');
          kv.put(next,'state');
        }catch(err){failure=err;try{tx.abort();}catch{} }
      };
      tx.oncomplete=()=>{if(next&&(!this.state||next.revision>=this.state.revision))this.state=next;this.lastError=null;this.emit();if(changed)this.channel?.postMessage({revision:next.revision});resolve(clone(this.state));};
      tx.onabort=tx.onerror=()=>reject(failure||tx.error||Error('Не удалось сохранить данные. Изменение не применено.'));
    });
  }
  async refresh(){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('kv','readonly'),req=tx.objectStore('kv').get('state');
      req.onsuccess=()=>{try{const next=migrate(req.result);if(!this.state||next.revision>this.state.revision){this.state=next;this.emit();}resolve(clone(this.state));}catch(err){this.lastError=err.message;this.emit();reject(err);}};
      req.onerror=()=>reject(req.error);
    });
  }
  async rawBackup(key='state'){
    const db=await this.open();return new Promise((resolve,reject)=>{const req=db.transaction('kv','readonly').objectStore('kv').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  }
  async replace(imported,expectedRevision){return this.update(s=>{const revision=s.revision;for(const k of Object.keys(s))delete s[k];Object.assign(s,clone(imported),{revision,history:[],activeSession:null});ensureOccurrences(s);},{expectedRevision,backup:true});}
  async tick(){if(this.state&&this.state.series.some(r=>r.enabled&&r.nextDay<=dateKey()))await this.update(s=>ensureOccurrences(s));else await this.refresh();}
  close(){this.db?.close();this.db=null;this.channel?.close();}
}
