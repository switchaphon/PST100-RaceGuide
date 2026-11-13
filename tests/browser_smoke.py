"""Real-browser regressions; run with Python Playwright and installed browsers.

python -m pip install playwright
python -m playwright install chromium webkit
python tests/browser_smoke.py
"""
import functools
import threading
import xml.etree.ElementTree as ET
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright, expect


class RaceServer(SimpleHTTPRequestHandler):
    fail_pages = False

    def do_GET(self):
        if self.fail_pages and self.path.split('?')[0] in ('/', '/index.html'):
            self.send_error(503)
        else:
            super().do_GET()

    def log_message(self, *_args):
        pass


def exercise(browser_type, url):
    browser = browser_type.launch(headless=True)
    context = browser.new_context(viewport={'width': 390, 'height': 844},
                                  is_mobile=True, has_touch=True, timezone_id='Asia/Bangkok', color_scheme='light')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(url, wait_until='networkidle')
    page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function('navigator.serviceWorker.controller !== null')

    # Upgrade from a saved rehearsal without discarding custom plans.
    page.evaluate("S.sim=3600000;S.dep[0]=START;S.arr[1]=START+120*60000;S.hist=[['dep',0],['arr',1]];S.chk['1:0']=true;S.back=5;S.plans.B=JSON.parse(JSON.stringify(planOf('B')));S.plans.B.p[10]=1610;save()")
    page.reload(wait_until='networkidle')
    assert page.evaluate("S.sim===0 && Object.keys(S.dep).length===0 && Object.keys(S.arr).length===0 && S.hist.length===0 && Object.keys(S.chk).length===0 && S.back===0 && S.plans.B.p[10]===1610")
    assert page.evaluate("JSON.parse(localStorage.getItem('pst100_v1')).sim===0")
    expect(page.get_by_role('button', name='Preview race', exact=True)).to_have_count(0)

    theme_toggle = page.get_by_role('button', name='Night mode', exact=True)
    expect(theme_toggle).to_be_visible(timeout=2000)
    expect(page.locator('html')).to_have_attribute('data-theme', 'day')
    theme_toggle.click()
    expect(page.locator('html')).to_have_attribute('data-theme', 'night')
    page.reload(wait_until='networkidle')
    expect(page.locator('html')).to_have_attribute('data-theme', 'night')
    page.get_by_role('button', name='Settings', exact=True).click()
    expect(page.get_by_role('columnheader', name='Arrival elapsed', exact=True)).to_be_visible()
    page.locator('#pa10').fill('23:57')
    theme_toggle.click()
    expect(page.locator('#pa10')).to_have_value('23:57')
    # Export uses current form values without saving or changing records.
    before_export = page.evaluate('JSON.stringify(S)')
    with page.expect_download() as download:
        page.get_by_role('button', name='Export GPX · A', exact=True).click()
    xml = Path(download.value.path()).read_text()
    gpx = ET.fromstring(xml)
    assert len(gpx.findall('.//{*}trkpt')) == 8999
    assert len(gpx.findall('{*}wpt')) == 11
    assert '23 hr 57 m' in gpx.findtext('{*}metadata/{*}name')
    assert 'Guide06:00+1' in xml and '04:00–04:45' in xml
    assert page.evaluate('JSON.stringify(S)') == before_export
    assert page.evaluate('planArr(10)') == 1439
    page.get_by_role('button', name='Now', exact=True).click()

    # UI unlocks on a timer tick without navigating away.
    page.evaluate('now=()=>START-61*60000;render()')
    expect(page.get_by_role('button', name='Preview race', exact=True)).to_have_count(0)
    expect(page.get_by_role('button', name='Start race', exact=True)).to_have_count(0)
    page.evaluate('now=()=>START-59*60000;applyLive()')
    expect(page.get_by_role('button', name='Start race', exact=True)).to_be_visible()

    # Exercise race actions on a controlled test clock; no production demo API.
    page.evaluate('now=()=>START')
    page.get_by_role('button', name='Start race', exact=True).click()
    page.get_by_role('button', name='Arrived A1', exact=True).click()
    page.get_by_role('button', name='Settings', exact=True).click()
    page.locator('#pa10').fill('23 hr 58 m')
    page.get_by_role('button', name='Save plan', exact=True).click()
    assert page.evaluate('plan()[10]') == 1438
    expect(page.locator('#pa10')).to_have_value('23 hr 58 m')
    assert page.locator('.plan-editor').get_by_role('button', name='Reset plan A', exact=True).count() == 0
    expect(page.get_by_role('button', name='Reset plan A', exact=True)).not_to_be_visible()
    page.locator('.reset-options summary').click()
    reset_button = page.get_by_role('button', name='Reset plan A', exact=True)
    expect(reset_button).to_be_visible()
    assert page.locator('.reset-options').bounding_box()['y'] > page.locator('#gpxExport').bounding_box()['y']
    page.locator('#pa10').fill('23 hr 55 m')
    reset_prompts = []

    def cancel_reset(dialog):
        reset_prompts.append(dialog.message)
        dialog.dismiss()

    page.once('dialog', cancel_reset)
    reset_button.click()
    assert len(reset_prompts) == 1 and 'Reset plan A' in reset_prompts[0]
    assert page.evaluate('plan()[10]') == 1438
    expect(page.locator('#pa10')).to_have_value('23 hr 55 m')
    page.locator('#pa2').fill('1:99')
    page.get_by_role('button', name='Save plan', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('00–59')
    assert page.evaluate('plan()[10]') == 1438
    page.on('dialog', lambda dialog: dialog.accept())
    page.get_by_role('button', name='Clear records', exact=True).click()
    page.reload(wait_until='networkidle')
    assert page.evaluate('S.sim===0 && S.dep[0]==null && S.arr[1]==null && plan()[10]===1438')

    page.get_by_role('button', name='Now', exact=True).click()
    page.evaluate('S.dep[0]=START;now=()=>START+200*60000;render()')
    eta = page.locator('[data-k="planA"]').inner_text()
    page.evaluate('now=()=>START+300*60000;applyLive()')
    assert page.locator('[data-k="planA"]').inner_text() != eta
    assert page.locator('[data-k="planA"]').inner_html() == page.evaluate("tC(finFor('A',model()),{noicon:1})")
    # Switching colors must not move the existing content or change race records.
    positions = page.locator('.hero, .pbar, .ns, #t-now').evaluate_all('(els)=>els.map(e=>{let r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})')
    records = page.evaluate('JSON.stringify([S.arr,S.dep,S.hist,S.chk,S.pid])')
    theme_toggle.click()
    assert page.locator('.hero, .pbar, .ns, #t-now').evaluate_all('(els)=>els.map(e=>{let r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})') == positions
    assert page.evaluate('JSON.stringify([S.arr,S.dep,S.hist,S.chk,S.pid])') == records

    # Highlight colors must recover when the race state changes after a tab render.
    page.evaluate('now=()=>START+(P[1].cut-10)*60000;render()')
    expect(page.locator('[data-k="hdCut"]')).to_have_class('sv bad')
    page.get_by_role('button', name='Stations', exact=True).click()
    page.evaluate('now=()=>START+10*60000')
    page.get_by_role('button', name='Now', exact=True).click()
    expect(page.locator('[data-k="hdCut"]')).to_have_class('sv good')

    # Remaining route metrics are available directly on Now, and live fixes do not
    # replace the checklist DOM or silently record an arrival.
    page.evaluate('S.arr[3]=START;S.dep[3]=START;now=()=>START+560*60000;render()')
    expect(page.locator('[data-k="gpsStatus"]')).to_contain_text('From A3')
    expect(page.locator('[data-k="toFinish"]')).to_contain_text('67.3')
    coords = page.evaluate('({latitude:RT.p[450].la,longitude:RT.p[450].lo,accuracy:10})')
    context.grant_permissions(['geolocation'])
    context.set_geolocation(coords)
    page.get_by_role('button', name='Start GPS', exact=True).click()
    expected_km = page.evaluate('RT.p[450].k.toFixed(1)')
    expect(page.locator('[data-k="courseKm"]')).to_have_text(expected_km)
    expect(page.locator('[data-k="gpsStatus"]')).to_contain_text('GPS')
    expect(page.locator('[data-k="toCP"]')).not_to_have_text('—')
    expect(page.locator('[data-k="climbLeft"]')).not_to_have_text('—')
    expect(page.get_by_text('ETA (plan)', exact=True)).to_be_visible()
    page.locator('.chk li').first.click()
    page.locator('.chk li').first.evaluate('el=>window.savedChecklistNode=el')
    records = page.evaluate('JSON.stringify([S.arr,S.dep,S.hist,S.chk])')
    coords = page.evaluate('({latitude:RT.p[451].la,longitude:RT.p[451].lo,accuracy:10})')
    context.set_geolocation(coords)
    expected_km = page.evaluate('RT.p[451].k.toFixed(1)')
    expect(page.locator('[data-k="courseKm"]')).to_have_text(expected_km)
    assert page.locator('.chk li').first.evaluate('el=>el===window.savedChecklistNode')
    assert page.evaluate('JSON.stringify([S.arr,S.dep,S.hist,S.chk])') == records
    page.get_by_role('button', name='Stop GPS', exact=True).click()
    page.evaluate('G.t=Date.now()-120000;applyLive()')
    expect(page.locator('[data-k="gpsStatus"]')).to_contain_text('Last fix')
    page.evaluate('G.km=60;G.off=0;applyLive()')
    expect(page.locator('[data-k="gpsStatus"]')).to_contain_text('Past A4')
    expect(page.locator('[data-k="toCP"]')).to_have_text('—')
    assert page.evaluate('S.arr[4]==null')

    page.evaluate('S.arr[10]=START+1439*60000;now=()=>START+1500*60000;render()')
    elapsed = page.locator('[data-k="elapsed"]').inner_text()
    page.evaluate('now=()=>START+1560*60000;applyLive()')
    assert page.locator('[data-k="elapsed"]').inner_text() == elapsed
    assert '23' in elapsed and '59' in elapsed

    # Advance through every outgoing leg via real buttons.
    page.evaluate('resetAll();now=()=>START;act("dep",0)')
    expected_notes = {5: '1,117', 6: 'A6 คืออาหารร้อนสุดท้าย', 7: 'W0 ไม่มีอาหารร้อน',
                      8: 'ที่ A7', 9: 'ช่วงสุดท้าย'}
    for i, station in enumerate(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'W0', 'A7', 'A8'], 1):
        page.get_by_role('button', name=f'Arrived {station}', exact=True).click()
        if i in expected_notes:
            expect(page.locator('.wtr')).to_contain_text(expected_notes[i])
        page.get_by_role('button', name=f'Depart {station}', exact=True).click()
    page.get_by_role('button', name='Finish race', exact=True).click()
    expect(page.get_by_text('Finished', exact=True)).to_be_visible()
    page.get_by_role('button', name='Profile', exact=True).click()
    expect(page.locator('#main svg').first).to_be_visible()
    expect(page.get_by_text('Secure context', exact=True)).to_have_count(0)
    expect(page.locator('input[type=range]')).to_have_count(0)
    coords = page.evaluate('({latitude:RT.p[CPI[6]].la,longitude:RT.p[CPI[6]].lo,accuracy:10})')
    context.grant_permissions(['geolocation'])
    context.set_geolocation(coords)
    page.get_by_role('button', name='Start GPS', exact=True).click()
    expect(page.get_by_text('72.0 / 105.8 km', exact=True)).to_be_visible()
    expect(page.get_by_text('33.8 km', exact=True)).to_be_visible()
    page.get_by_role('button', name='Stop GPS', exact=True).click()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')

    # Fail the actual server, not Playwright's request routing (which can bypass SW).
    RaceServer.fail_pages = True
    page.reload(wait_until='networkidle')
    expect(page).to_have_title('PST100 Race Day')
    assert page.evaluate("navigator.serviceWorker.controller.scriptURL && caches.keys().then(keys=>keys.filter(k=>k.startsWith('pst100-'))).then(keys=>caches.open(keys[0])).then(c=>c.match(location.href)).then(r=>r.status)") == 200
    RaceServer.fail_pages = False
    context.set_offline(True)
    page.reload(wait_until='networkidle')
    expect(page).to_have_title('PST100 Race Day')
    expect(page.locator('#main')).not_to_be_empty()
    # Full-resolution data is available on the first offline export after reload.
    page.get_by_role('button', name='Settings', exact=True).click()
    page.locator('#gpxPoints').select_option('all')
    with page.expect_download() as download:
        page.get_by_role('button', name='Export GPX · A', exact=True).click()
    gpx = ET.fromstring(Path(download.value.path()).read_text())
    assert len(gpx.findall('.//{*}trkpt')) == 8999
    assert len(gpx.findall('{*}wpt')) == 25
    assert not errors, errors
    context.close()
    browser.close()
    print(f'{browser_type.name}: PASS (preview migration, reset cancellation, mobile UI, all CPs, validation, live time, HTTP 503, offline reload)')


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(RaceServer, directory=str(root)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            for browser_type in (p.chromium, p.webkit):
                exercise(browser_type, f'http://localhost:{server.server_port}/')
    finally:
        server.shutdown()
        server.server_close()
