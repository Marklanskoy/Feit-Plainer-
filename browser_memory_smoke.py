"""Local DOM tests using Chromium.set_content and a transactional memory test double.
The environment blocks URL navigation. These tests do NOT validate real IndexedDB,
service-worker installation, Safari or published-site navigation. Production code
is not modified; the store substitution is limited to this generated test fixture.
"""
from pathlib import Path
import json, datetime, traceback, os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
(ROOT/'artifacts').mkdir(exist_ok=True)
FIXED=datetime.datetime(2026,10,9,10,20,tzinfo=datetime.timezone(datetime.timedelta(hours=5)))
D='2026-10-09'
MEMORY=r'''
class TestMemoryStore {
 constructor(){this.state=null;this.pending=0;this.lastError=null;this.listeners=new Set();this.queue=Promise.resolve();this.saved=window.__SEED__||null;this.original=this.saved;}
 subscribe(fn){this.listeners.add(fn);}
 emit(){this.listeners.forEach(fn=>fn(this.state,{pending:this.pending,error:this.lastError}));}
 async init(){this.state=migrate(this.saved);ensureOccurrences(this.state);this.saved=clone(this.state);this.emit();window.__testStore=this;return clone(this.state);}
 update(fn,{label=null,expectedRevision=null}={}){this.pending++;this.emit();const work=this.queue.catch(()=>{}).then(async()=>{const before=clone(this.saved),next=clone(before);if(expectedRevision!=null&&before.revision!==expectedRevision)throw Error('Данные изменились. Пересчитайте предложение.');fn(next,before);if(label)recordHistory(before,next,label);next.revision=before.revision+1;validateState(next);if(window.__failNextWrite){window.__failNextWrite=false;throw Error('Тестовая ошибка записи. Изменение не применено.');}this.saved=clone(next);this.state=next;this.lastError=null;this.emit();return clone(next);});this.queue=work;return work.catch(e=>{this.lastError=e.message;throw e;}).finally(()=>{this.pending--;this.emit();});}
 async refresh(){return clone(this.state);}
 async tick(){return this.refresh();}
 async rawBackup(key){return key==='state'?this.saved:this.original;}
 async replace(s,rev){return this.update(n=>{const revision=n.revision;Object.keys(n).forEach(k=>delete n[k]);Object.assign(n,clone(s),{revision,history:[],activeSession:null});},{expectedRevision:rev});}
}
const appStore=new TestMemoryStore();
'''
def task(id,title,**more):
    return dict(id=id,title=title,ts=1,rev=0,st='active',day=D,due='',min=45,left=None,block=None,main=False,priority=0,moves=0,subtasks=[],projectId=None,goalId=None,repeat='none',**more)
def seed():
    return dict(v=2,revision=1,tasks=[],events=[],projects=[],goals=[],sessions=[],series=[],buffers=[],activeSession=None,history=[],migrationNotice=None,set={'days':{str(i):[[540,1080]] for i in range(7)},'lunch':None,'gap':10,'theme':'light'})
def data_task(id,title,**extra):
    t=task(id,title);t.update(extra);return t

def showcase():
    s=seed();s['projects']=[dict(id='content',title='Контент'),dict(id='personal',title='Личное')];s['goals']=[dict(id='video',title='Опубликовать 4 ролика',target=4,value=1,unit='ролика')]
    s['tasks']=[
        data_task('structure','Собрать структуру сценария',main=True,min=45,block={'day':D,'s':615,'e':660},projectId='content',goalId='video',subtasks=[dict(id='step1',title='Записать основной конфликт',done=True),dict(id='step2',title='Наметить пять ключевых сцен',done=False)]),
        data_task('materials','Подготовить материалы к записи',main=True,min=30,block={'day':D,'s':670,'e':700},projectId='content'),
        data_task('reply','Ответить на письма',st='done',min=20,block={'day':D,'s':540,'e':560},completedAt='2026-10-09T04:20:00.000Z'),
        data_task('music','Выбрать музыку для вступления',day='2026-10-08',min=20,projectId='content'),
        data_task('cover','Получить обложку от дизайнера',st='wait',chk=D,projectId='content'),
        data_task('publish','Опубликовать ролик',day='2026-10-10',min=20,goalId='video',countsForGoal=True,projectId='content')]
    s['events']=[dict(id='call',title='Созвон по проекту',day=D,s=720,e=750),dict(id='gym',title='Тренировка',day=D,s=1020,e=1080)]
    s['buffers']=[dict(id='b1',taskId='structure',day=D,s=660,e=670),dict(id='b2',taskId='materials',day=D,s=700,e=710)]
    return s

html=(ROOT/'site/index.html').read_text()
def fixture(state):
    value=json.dumps(state,ensure_ascii=False).replace('</','<\\/')
    return html.replace('const appStore=new PlannerStore();',MEMORY).replace('<script>','<script>window.__SEED__='+value+';</script><script>',1)
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('FEIT_CHROMIUM') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None),headless=True,args=['--no-sandbox'])
    def page_for(s=None,width=390):
        page=browser.new_page(viewport={'width':width,'height':900 if width>700 else 844},timezone_id='Asia/Almaty',is_mobile=width<700,has_touch=width<700)
        page.set_default_timeout(4000)
        page.emulate_media(reduced_motion='reduce')
        page.clock.install(time=FIXED)
        page._errors=[];page.on('pageerror',lambda e:page._errors.append(str(e)))
        page.set_content(fixture(s or seed()));page.locator('#main h1').filter(has_text='Сегодня').wait_for();return page
    def saved(page):return page.evaluate('window.__testStore.saved')
    def run(name,fn):
        try:fn();results.append({'name':name,'status':'pass'});print('PASS',name)
        except Exception as e:results.append({'name':name,'status':'fail','error':str(e)});print('FAIL',name,str(e));traceback.print_exc(limit=1)
    def new_task(page,title,day=D):
        page.locator('#fab').click();page.locator('#task-title-input').fill(title);page.locator('#task-day-input').fill(day)
        page.locator('#modal').get_by_role('button',name='Сохранить',exact=True).click()
        page.wait_for_function('!document.getElementById("modal").open')
    def crud():
        page=page_for();new_task(page,'Проверить приложение');assert len(saved(page)['tasks'])==1
        page.locator('#mobile-nav').get_by_role('button',name='Задачи',exact=True).click()
        page.get_by_role('button',name='Проверить приложение',exact=True).click();page.locator('#task-title-input').fill('Задача после правки');page.locator('#modal').get_by_role('button',name='Сохранить',exact=True).click();page.wait_for_function('!document.getElementById("modal").open')
        assert saved(page)['tasks'][0]['title']=='Задача после правки'
        page.get_by_role('button',name='Завершить: Задача после правки',exact=True).click();page.wait_for_function('window.__testStore.saved.tasks[0].st==="done"');assert not page._errors
        page.close()
    run('UI: create, edit and complete a task',crud)
    def carry():
        s=seed();s['tasks']=[data_task('old','Незавершённое вчера',day='2026-10-08')];page=page_for(s)
        assert 'с прошлых дней' in page.locator('#main').inner_text();page.get_by_role('button',name='Разобрать',exact=True).click()
        assert page.get_by_role('button',name='Незавершённое вчера',exact=True).is_visible();page.close()
    run('UI: yesterday tasks remain visible in carryover filter',carry)
    def event_current():
        s=seed();s['tasks']=[data_task('future','Будущая задача',block={'day':D,'s':660,'e':720})];s['events']=[dict(id='e',title='Текущая встреча',day=D,s=600,e=660)];page=page_for(s)
        assert page.locator('.focus-title').inner_text()=='Текущая встреча';assert 'Начать' not in page.locator('.focus-card').inner_text();page.close()
    run('UI: current event, not future task, occupies the hero',event_current)
    def plan_cancel_apply():
        s=seed();s['tasks']=[data_task('t','Задача с дедлайном вчера',due='2026-10-08T12:00',min=45)];page=page_for(s);before=saved(page)
        page.get_by_role('button',name='Собрать план',exact=True).click();assert 'Просрочка сохранится' in page.locator('#modal').inner_text();page.locator('#modal').get_by_role('button',name='Отмена',exact=True).click();assert saved(page)==before
        page.get_by_role('button',name='Собрать план',exact=True).click();page.locator('#modal').get_by_role('button',name='Применить план',exact=True).click();page.wait_for_function('!document.getElementById("modal").open');after=saved(page);assert after['tasks'][0]['block']['s']>=620;assert after['tasks'][0]['due']=='2026-10-08T12:00'
        page.locator('.undo-bar').get_by_role('button',name='Отменить',exact=True).click();page.wait_for_function('window.__testStore.saved.tasks[0].block===null');page.close()
    run('UI: overdue planning, cancel, apply and undo',plan_cancel_apply)
    def failure():
        page=page_for();page.evaluate('window.__failNextWrite=true');page.locator('#fab').click();page.locator('#task-title-input').fill('Не терять форму');page.locator('#modal').get_by_role('button',name='Сохранить',exact=True).click();page.locator('#modal .form-error').wait_for(state='visible');assert len(saved(page)['tasks'])==0;assert page.locator('#task-title-input').input_value()=='Не терять форму'
        page.locator('#modal').get_by_role('button',name='Сохранить',exact=True).click();page.wait_for_function('!document.getElementById("modal").open');assert len(saved(page)['tasks'])==1;page.close()
    run('UI: simulated write failure preserves draft and offers retry',failure)
    def recurrence():
        page=page_for();page.locator('#fab').click();page.locator('#task-title-input').fill('Повторяющееся дело');page.locator('#task-day-input').fill(D);page.locator('#modal summary').click();page.get_by_label('Повторение',exact=True).select_option('daily');page.locator('#modal').get_by_role('button',name='Сохранить',exact=True).click();page.wait_for_function('!document.getElementById("modal").open');s=saved(page);assert len(s['series'])==1;assert len(s['tasks'])==31;page.close()
    run('UI: daily repeating tasks generate 30 future instances',recurrence)
    def timer():
        s=seed();s['tasks']=[data_task('t','Рабочая сессия',min=30)];page=page_for(s);page.get_by_role('button',name='Начать',exact=True).click();page.locator('#focus-clock').wait_for();page.clock.fast_forward(60000);page.wait_for_timeout(20);assert page.locator('#focus-clock').inner_text().startswith('01:')
        page.locator('#focus-pause').click();page.wait_for_function('window.__testStore.saved.activeSession.startedAt===null');page.clock.fast_forward(60000);assert page.locator('#focus-clock').inner_text().startswith('01:')
        page.locator('#modal').get_by_role('button',name='Закрыть',exact=True).last.click();assert page.locator('#session-strip').is_visible();assert saved(page)['activeSession'] is not None
        page.locator('#session-strip').click();page.get_by_role('button',name='Сохранить сессию',exact=True).click();page.wait_for_function('window.__testStore.saved.activeSession===null');s=saved(page);assert len(s['sessions'])==1;assert s['tasks'][0]['st']=='active';page.close()
    run('UI: persistent-model timer, pause, close window, reopen, save',timer)
    def projects():
        s=showcase();page=page_for(s);page.locator('#mobile-nav').get_by_role('button',name='Ещё',exact=True).click();page.get_by_role('button',name='Открыть проекты',exact=True).click();page.get_by_role('button',name='Открыть задачи',exact=True).first.click();assert page.get_by_label('Фильтр проекта').input_value()=='content';assert 'Собрать структуру сценария' in page.locator('#main').inner_text();page.close()
    run('UI: project button filters the correct project by ID',projects)
    def xss():
        page=page_for();new_task(page,'<img src=x onerror="window.hacked=true">');assert page.evaluate('window.hacked!==true');assert page.locator('#main img').count()==0;page.close()
    run('UI: user task names render as text, not HTML',xss)
    def invalid_import():
        page=page_for(showcase());before=saved(page);page.locator('#mobile-nav').get_by_role('button',name='Ещё',exact=True).click();page.get_by_role('button',name='Восстановить',exact=True).click();page.locator('#modal summary').click();page.get_by_label('Текст резервной копии').fill('{bad');page.get_by_role('button',name='Проверить копию',exact=True).click();assert 'Не удалось прочитать JSON' in page.locator('#modal').inner_text();assert saved(page)==before;page.close()
    run('UI: corrupted backup is rejected without replacement',invalid_import)
    def layouts():
        for width in [320,390,768,1440]:
            page=page_for(showcase(),width)
            assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),f'overflow today {width}'
            if width in [390,1440]:
                page.screenshot(path=str(ROOT/'artifacts'/f'preview-{width}.png'),full_page=False)
                if width==390:page.screenshot(path=str(ROOT/'artifacts'/'preview-mobile-full.png'),full_page=True)
            page.locator('#fab').click();assert page.evaluate('document.getElementById("modal").scrollWidth<=document.getElementById("modal").clientWidth+1'),f'overflow modal {width}'
            page.locator('#modal').get_by_role('button',name='Отмена',exact=True).click()
            nav='#mobile-nav' if width<=700 else '#sidebar'
            for name in ['Задачи','Календарь','Цели']:
                page.locator(nav).get_by_role('button',name=name,exact=True).click();assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),f'overflow {name} {width}'
            assert not page._errors, page._errors;page.close()
    run('Visual: 320, 390, 768 and 1440 px; pages and task dialog do not overflow',layouts)
    browser.close()
(ROOT/'artifacts/browser-tests.json').write_text(json.dumps({'scope':'Chromium DOM + memory-store test double; NOT real IndexedDB/PWA/Safari tests','results':results},ensure_ascii=False,indent=2))
print('RESULT',sum(x['status']=='pass' for x in results),'/',len(results))
raise SystemExit(any(x['status']!='pass' for x in results))
