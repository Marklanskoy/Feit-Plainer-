/** Storage adapter contract tests use a serialized transaction test double.
 * These do not replace testing the native IndexedDB implementation in a browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {PlannerStore} from '../src/store.mjs';
import {initialState,clone} from '../src/core.mjs';
class TransactionDouble {
 constructor(initial){this.data=new Map([['state',clone(initial)]]);this.queue=Promise.resolve();this.abortNextCommit=false;this.rejectPut=false;}
 transaction(){const db=this,tx={writes:new Map(),aborted:false,error:null,request:null,key:null,abort(){this.aborted=true;},objectStore(){return {get(key){tx.key=key;return tx.request={result:undefined};},put(value,key){if(db.rejectPut){db.rejectPut=false;throw new Error('Put failed');}tx.writes.set(key,clone(value));return{};}};}};
 this.queue=this.queue.then(async()=>{await Promise.resolve();tx.request.result=clone(this.data.get(tx.key));tx.request.onsuccess();await Promise.resolve();if(db.abortNextCommit){db.abortNextCommit=false;tx.aborted=true;tx.error=Error('Commit aborted');}if(tx.aborted){tx.onabort?.();return;}for(const [k,v]of tx.writes)this.data.set(k,clone(v));tx.oncomplete?.();});return tx;}
 close(){}
}
function stores(initial=initialState(),n=1){const db=new TransactionDouble(initial);const list=Array.from({length:n},()=>{const s=new PlannerStore({name:'contract-'+Math.random()});s.db=db;return s;});return {db,list,close:()=>list.forEach(s=>s.close())};}
function add(s,k){s.tasks.push({id:k,title:k,rev:0,st:'active',ts:1,day:null,due:'',min:30,left:null,subtasks:[],projectId:null,goalId:null});}
test('storage contract: UI changes only after transaction completion',async()=>{const a=stores(),s=a.list[0];await s.init();const p=s.update(n=>add(n,'one'));assert.equal(s.state.tasks.length,0);await p;assert.equal(s.state.tasks.length,1);a.close();});
test('storage contract: 30 rapid queued updates all survive',async()=>{const a=stores(),s=a.list[0];await s.init();await Promise.all(Array.from({length:30},(_,i)=>s.update(n=>add(n,'t'+i))));assert.equal(s.state.tasks.length,30);assert.equal(a.db.data.get('state').tasks.length,30);a.close();});
test('storage contract: two independent adapters read latest state inside each transaction',async()=>{const a=stores(initialState(),2),[s,t]=a.list;await s.init();await t.init();await Promise.all([s.update(n=>add(n,'from-tab-a')),t.update(n=>add(n,'from-tab-b'))]);await s.refresh();assert.equal(s.state.tasks.length,2);a.close();});
test('storage contract: an abort after successful put leaves UI and persistent state unchanged',async()=>{const a=stores(),s=a.list[0];await s.init();const before=clone(s.state);a.db.abortNextCommit=true;await assert.rejects(s.update(n=>add(n,'must-not-appear')),/aborted/);assert.deepEqual(s.state,before);assert.deepEqual(a.db.data.get('state'),before);assert.equal(s.pending,0);assert(s.lastError);a.close();});
test('storage contract: synchronous write failure can be retried safely',async()=>{const a=stores(),s=a.list[0];await s.init();a.db.rejectPut=true;await assert.rejects(s.update(n=>add(n,'fail')),/Put failed/);await s.update(n=>add(n,'retry'));assert.deepEqual(s.state.tasks.map(x=>x.id),['retry']);a.close();});
test('storage contract: old state is backed up before migration',async()=>{const raw={v:1,tasks:[],events:[],set:{s:540,e:1080,gap:10},undo:null};const a=stores(raw),s=a.list[0];await s.init();assert.equal(s.state.v,2);assert.deepEqual(a.db.data.get('legacy-v1-backup'),raw);a.close();});
test('storage contract: replacement is version-checked and has a local pre-import backup',async()=>{const a=stores(),s=a.list[0];await s.init();await s.update(n=>add(n,'existing'));const old=clone(s.state),incoming=initialState();add(incoming,'imported');await s.replace(incoming,s.state.revision);assert.deepEqual(a.db.data.get('before-import-backup'),old);assert.equal(s.state.tasks[0].id,'imported');await assert.rejects(s.replace(incoming,old.revision),/изменились/);a.close();});
test('storage contract: validation failure does not replace existing data',async()=>{const a=stores(),s=a.list[0];await s.init();await s.update(n=>add(n,'good'));await assert.rejects(s.update(n=>n.tasks[0].day='not-a-date'),/дата/);assert.equal(s.state.tasks[0].day,null);a.close();});
