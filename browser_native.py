"""Optional smoke test for a NORMAL browser environment with URL navigation.
Not executed successfully in the build environment (navigation is blocked).
Runs in fresh, isolated browser profiles. Does not use your Safari/Chrome data.
Serve site/: python3 -m http.server 8080 --directory site
Run: python3 tests/browser_native.py --url http://127.0.0.1:8080/
"""
import argparse
from playwright.sync_api import sync_playwright, expect
parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8080/');args=parser.parse_args()
READ="""() => new Promise((resolve,reject)=>{const r=indexedDB.open('ritm',2);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('kv','readonly'),q=tx.objectStore('kv').get('state');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);tx.oncomplete=()=>db.close();};})"""
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':390,'height':844})
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(args.url);expect(page.locator('#main h1')).to_have_text('Сегодня')
    def create(tab,title):
        tab.locator('#fab').click();tab.locator('#task-title-input').fill(title)
        tab.locator('#modal').get_by_role('button',name='Сохранить',exact=True).click()
        tab.wait_for_function('!document.getElementById("modal").open')
    create(page,'Проверка реального IndexedDB')
    assert len(page.evaluate(READ)['tasks'])==1
    page.reload();expect(page.locator('#main h1')).to_have_text('Сегодня');assert len(page.evaluate(READ)['tasks'])==1
    second=context.new_page();second.goto(args.url);expect(second.locator('#main h1')).to_have_text('Сегодня')
    create(page,'Первая вкладка');create(second,'Вторая вкладка')
    assert len(page.evaluate(READ)['tasks'])==3
    page.locator('#mobile-nav').get_by_role('button',name='Задачи',exact=True).click()
    page.get_by_role('button',name='Действия: Проверка реального IndexedDB',exact=True).click()
    page.get_by_role('button',name='Начать сессию',exact=True).click();expect(page.locator('#focus-clock')).to_be_visible()
    page.reload();expect(page.locator('#main h1')).to_have_text('Сегодня');assert page.evaluate(READ)['activeSession'] is not None
    second.close()
    page.evaluate('navigator.serviceWorker.ready.then(()=>true)');page.reload();expect(page.locator('#main h1')).to_have_text('Сегодня')
    context.set_offline(True);page.reload();expect(page.locator('#main h1')).to_have_text('Сегодня');assert len(page.evaluate(READ)['tasks'])==3
    assert not errors,errors
    print('PASS: native IndexedDB persistence, multi-tab writes, timer reload, service-worker offline reload')
    browser.close()
