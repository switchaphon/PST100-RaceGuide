const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const fullRoute = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/route-v2.json'), 'utf8'));

// Run the actual page script. Only browser APIs are substituted; race logic is real.
function app({ state, prefersDark = false } = {}) {
  const nodes = new Map();
  const storage = new Map();
  if (state) storage.set('pst100_v1', JSON.stringify(state));
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '', className: '', style: {}, dataset: {}, value: '', setAttribute(k,v) { this[k] = String(v); } });
    return nodes.get(id);
  };
  const context = vm.createContext({
    console, Date, Math, JSON, navigator: {}, window: { matchMedia: () => ({ matches: prefersDark }) },
    location: { protocol: 'file:', hostname: '' }, confirm: () => true,
    setInterval: () => 0,
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    document: { documentElement: node('html'), getElementById: node, querySelector: () => node('theme-meta'), querySelectorAll: () => [] }
  });
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  const run = code => vm.runInContext(code, context);
  function fillPlan() {
    const { p, s } = JSON.parse(run('JSON.stringify(planOf(S.pid))'));
    for (let i = 1; i <= 10; i++) {
      node('pa' + i).value = Math.floor(p[i] / 60) + ':' + String(p[i] % 60).padStart(2, '0');
      node('ps' + i).value = String(s[i]);
    }
  }
  return { run, node, storage, fillPlan };
}

test('clear records persists an empty race while keeping saved plans', () => {
  const a = app();
  a.run('S.dep[0]=START;S.arr[1]=START+120*60000;S.plans.B=genPlan("B");resetAll()');
  const state = JSON.parse(a.storage.get('pst100_v1'));
  assert.equal(state.sim, 0);
  assert.deepEqual(state.dep, {});
  assert.deepEqual(state.arr, {});
  assert.deepEqual(state.hist, []);
  assert.ok(state.plans.B);
  assert.equal(a.run('model().mode'), 'pre');
});

for (const offset of [-3600000, 3600000]) {
  test(`old preview offset ${offset} is cleared on load without losing plans or preferences`, () => {
    const a = app();
    a.run(`S.sim=${offset};S.dep[0]=START;S.arr[1]=START+120*60000;S.hist=[['dep',0],['arr',1]];S.chk['1:0']=true;S.back=5;S.pid='B';S.plans.B=genPlan('B');S.plans.B.p[10]=1610;S.theme='night';S.gz='all';save()`);
    const before = JSON.parse(a.storage.get('pst100_v1'));
    const b = app({ state: before });
    assert.equal(b.run('model().mode'), 'pre');
    const after = JSON.parse(b.storage.get('pst100_v1'));
    for (const key of ['arr', 'dep', 'chk']) assert.deepEqual(after[key], {});
    assert.deepEqual(after.hist, []);
    assert.equal(after.back, 0);
    assert.equal(after.sim, 0);
    for (const key of ['plans', 'pid', 'theme', 'gz']) assert.deepEqual(after[key], before[key]);
    assert.equal(app({ state: after }).run('model().mode'), 'pre');
  });
}

test('release preserves real race records when no preview offset is saved', () => {
  const a = app();
  a.run("S.dep[0]=START;S.arr[1]=START+120*60000;S.hist=[['dep',0],['arr',1]];S.chk['1:0']=true;save()");
  const state = JSON.parse(a.storage.get('pst100_v1'));
  const b = app({ state });
  for (const key of ['arr', 'dep', 'hist', 'chk']) {
    assert.deepEqual(JSON.parse(b.run(`JSON.stringify(S.${key})`)), state[key]);
  }
  assert.equal(b.run('model().mode'), 'atcp');
});

test('race clock always uses real time even if an obsolete offset is present', () => {
  const a = app();
  a.run('S.sim=3600000');
  assert.ok(Math.abs(a.run('now()-Date.now()')) < 100);
});

test('canceling plan reset keeps saved plans, records and current editor intact', () => {
  const a = app();
  a.run("S.pid='B';S.plans.B=genPlan('B');S.plans.B.p[10]=1610;S.dep[0]=START;save();setTab('set');var resetPrompt='';confirm=message=>{resetPrompt=message;return false}");
  a.node('pa10').value = '26 hr 45 m';
  const before = a.run('JSON.stringify(S)');
  const saved = a.storage.get('pst100_v1');
  a.run('resetPlan()');
  assert.match(a.run('resetPrompt'), /Reset plan B/);
  assert.equal(a.run('JSON.stringify(S)'), before);
  assert.equal(a.storage.get('pst100_v1'), saved);
  assert.equal(a.node('pa10').value, '26 hr 45 m');
});

test('confirmed plan reset only restores the selected plan', () => {
  const a = app();
  a.run("S.pid='B';S.plans.A=genPlan('A');S.plans.A.p[10]=1430;S.plans.B=genPlan('B');S.plans.B.p[10]=1610;S.dep[0]=START;S.chk['1:0']=true;var resetPrompt='';confirm=message=>{resetPrompt=message;return true}");
  const before = a.run('JSON.stringify([S.plans.A,S.arr,S.dep,S.hist,S.chk,S.pid])');
  a.run('resetPlan()');
  assert.match(a.run('resetPrompt'), /Reset plan B/);
  assert.equal(a.run('planArr(10)'), 1619);
  assert.equal(a.run('JSON.stringify([S.plans.A,S.arr,S.dep,S.hist,S.chk,S.pid])'), before);
  assert.equal(JSON.parse(a.storage.get('pst100_v1')).plans.B, undefined);
});

test('start button unlocks as the live clock crosses one hour before start', () => {
  const a = app();
  a.run('now=()=>START-61*60000;render()');
  assert.doesNotMatch(a.node('main').innerHTML, /Start race/);
  a.run('now=()=>START-59*60000;applyLive()');
  assert.match(a.node('main').innerHTML, /Start race/);
});

test('each plan ETA is exposed to live updates and tracks an overdue leg', () => {
  const a = app();
  a.run('S.dep[0]=START;now=()=>START+200*60000;render()');
  assert.match(a.node('main').innerHTML, /data-k="planA"/);
  for (const pid of ['A', 'B', 'C', 'D']) {
    a.run('now=()=>START+200*60000');
    const before = a.run(`live().plan${pid}[0]`);
    a.run('now=()=>START+300*60000');
    const after = a.run(`live().plan${pid}[0]`);
    assert.notEqual(after, before);
    assert.equal(after, a.run(`tC(finFor('${pid}',model()),{noicon:1})`));
  }
});

test('elapsed race time freezes at FIN while the wall clock keeps running', () => {
  const a = app();
  a.run('S.dep[0]=START;S.arr[10]=START+1439*60000;now=()=>START+1500*60000');
  const before = a.run('live()');
  a.run('now=()=>START+1560*60000');
  const after = a.run('live()');
  assert.equal(before.elapsed[0], a.run('tDur(1439*60,{sec:1,noicon:1,fh:1})'));
  assert.equal(after.elapsed[0], before.elapsed[0]);
  assert.notEqual(after.clock[0], before.clock[0]);
});

test('time parser rejects invalid minute fields', () => {
  const a = app();
  assert.equal(a.run("parseHM('1:99')"), null);
  assert.equal(a.run("parseHM('26:59')"), 1619);
});

test('GPX export preserves the full route and anchors all 11 CPs to original vertices', () => {
  const a = app();
  assert.equal(a.run('typeof buildGpx'), 'function');
  a.run('var exportRoute='+JSON.stringify(fullRoute));
  const xml = a.run("buildGpx(exportRoute,'A',planOf('A'),'cp')");
  const points = [...xml.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)"><ele>([^<]+)<\/ele><\/trkpt>/g)].map(m=>m.slice(1).map(Number));
  assert.deepEqual(points, fullRoute.p);
  const waypoints = [...xml.matchAll(/<wpt lat="([^"]+)" lon="([^"]+)"/g)].map(m=>m.slice(1).map(Number));
  assert.deepEqual(waypoints, fullRoute.cp.map(i=>fullRoute.p[i].slice(0,2)));
  assert.equal((xml.match(/<type>Aid_station<\/type>/g)||[]).length, 9);
  assert.doesNotMatch(xml, /<time>|HOT|DROPBAG|Dropped bag/);
});

test('GPX export uses the selected custom plan, clock days, and W0 advisory without changing records', () => {
  const a = app();
  assert.equal(a.run('typeof buildGpx'), 'function');
  a.run('var exportRoute='+JSON.stringify(fullRoute));
  a.run("var custom=JSON.parse(JSON.stringify(planOf('B')));custom.p[1]=165;custom.s[1]=9;S.plans.B=custom;S.pid='B'");
  const before=a.run('JSON.stringify(S)');
  const xml=a.run("buildGpx(exportRoute,S.pid,planOf(S.pid),'cp')");
  assert.match(xml, /A1 Plan07:45 COT08:50/);
  assert.match(xml, /Elapsed 2 hr 45 m/);
  assert.match(xml, /Rest 9 m; Depart 07:54/);
  assert.match(xml, /W0 Plan01:41\+1 Guide06:00\+1/);
  assert.doesNotMatch(xml, /W0[^<]*COT/);
  assert.match(xml, /Next A6: 10\.3 km; climb 1117 m; descent 207 m/);
  assert.match(xml, /CMECC.*02:30.*03:00/);
  assert.match(xml, /04:00–04:45/);
  assert.equal(a.run('JSON.stringify(S)'),before);
});

test('optional GPX POIs follow course order and escape station text correctly', () => {
  const a=app();
  assert.equal(a.run('typeof buildGpx'), 'function');
  a.run('var exportRoute='+JSON.stringify(fullRoute));
  a.run('P[1].n="A&B <test>"');
  const xml=a.run("buildGpx(exportRoute,'C',planOf('C'),'all')");
  const points=[...xml.matchAll(/<wpt lat="([^"]+)" lon="([^"]+)"/g)].map(m=>m.slice(1).map(Number));
  const index=points.map(p=>fullRoute.p.findIndex(r=>r[0]===p[0]&&r[1]===p[1]));
  assert.equal(points.length,25);
  assert.deepEqual(index,[...index].sort((a,b)=>a-b));
  assert.match(xml,/A&amp;B &lt;test&gt;/);
  assert.doesNotMatch(xml,/eta06:56|Plan A finish/);
});

test('elapsed input accepts hr/m units and rejects invalid durations', () => {
  const a = app();
  for (const [text, minutes] of [['0 m', 0], ['59 m', 59], ['2 hr 59 m', 179], ['26 hr 59 m', 1619], ['99 hr 59 m', 5999]]) {
    assert.equal(a.run(`parseHM(${JSON.stringify(text)})`), minutes, text);
  }
  for (const text of ['2 hr 60 m', '99 m', '-1 hr 20 m', '2.5 hr 00 m', '100 hr 00 m', '', '2 hr 59 m extra']) {
    assert.equal(a.run(`parseHM(${JSON.stringify(text)})`), null, text);
  }
});

test('plan editor distinguishes elapsed duration from time of day', () => {
  const a = app();
  a.run("S.pid='C';setTab('set')");
  const html = a.node('main').innerHTML;
  assert.match(html, />Arrival elapsed<\/th>/);
  assert.match(html, /id="pa1"[^>]*value="2 hr 59 m"/);
  assert.doesNotMatch(html, /value="\d+:\d{2}"|elapsed h:mm|Arrival \(h:mm\)/);
  assert.equal(a.run('planArr(1)'), 179);
  assert.equal(a.run('clock(START+planArr(1)*60000)'), '07:59');
});

test('saving an elapsed duration beyond midnight retains total hours on reload', () => {
  const a = app();
  a.fillPlan();
  a.node('pa10').value = '26 hr 59 m';
  a.run('savePlan()');
  assert.equal(a.run('plan()[10]'), 1619);
  const state = JSON.parse(a.storage.get('pst100_v1'));
  const b = app({ state });
  b.run("setTab('set')");
  assert.match(b.node('main').innerHTML, /id="pa10"[^>]*value="26 hr 59 m"/);
  assert.equal(b.run('clock(START+planArr(10)*60000)'), '07:59 (Sun)');
});

for (const [name, change] of [
  ['arrival before previous departure', a => { a.node('pa2').value = a.node('pa1').value; a.node('ps1').value = '100'; }],
  ['negative rest', a => { a.node('ps1').value = '-1'; }],
  ['non-finite rest', a => { a.node('ps1').value = 'Infinity'; }],
  ['missing rest', a => { a.node('ps1').value = ''; }]
]) {
  test(`saving rejects ${name} without replacing the existing plan`, () => {
    const a = app();
    a.fillPlan();
    a.run('savePlan()');
    const before = a.run('JSON.stringify(planOf(S.pid))');
    change(a);
    a.run('savePlan()');
    assert.equal(a.run('JSON.stringify(planOf(S.pid))'), before);
    assert.ok(a.node('planError').textContent, 'explain why saving was rejected');
  });
}

test('valid custom plan survives saving', () => {
  const a = app();
  a.fillPlan();
  a.node('pa10').value = '23:58';
  a.run('savePlan()');
  assert.equal(a.run('plan()[10]'), 1438);
  assert.equal(JSON.parse(a.storage.get('pst100_v1')).plans.A.p[10], 1438);
});

test('water and preparation notes match the outgoing leg', () => {
  const a = app();
  assert.match(a.run('wtr(5)'), /1,117/); // A5 -> A6
  assert.doesNotMatch(a.run('wtr(6)'), /1,117/); // A6 -> W0
  assert.match(a.run('wtr(6)'), /A6 คืออาหารร้อนสุดท้าย/);
  assert.match(a.run('wtr(7)'), /W0 ไม่มีอาหารร้อน/);
  assert.match(a.run('wtr(8)'), /ที่ A7/);
  assert.match(a.run('wtr(9)'), /ช่วงสุดท้าย/);
  assert.equal(a.run('wtr(10)'), '');
});

test('built-in plans retain positive legs, target finishes and COT buffers', () => {
  const a = app();
  for (const pid of ['A', 'B', 'C', 'D']) {
    assert.equal(a.run(`planOf('${pid}').p[10]`), a.run(`PINFO['${pid}'].tgt`));
    assert.equal(a.run(`planOf('${pid}').p.every((t,i)=>!i||t>planOf('${pid}').p[i-1]+planOf('${pid}').s[i-1])`), true);
    assert.equal(a.run(`planOf('${pid}').p.every((t,i)=>!i||i===7||t<P[i].cut)`), true);
  }
});

test('theme follows the device preference before a manual choice', () => {
  assert.equal(app().run('S.theme'), 'day');
  assert.equal(app({ prefersDark: true }).run('S.theme'), 'night');
});

test('saved Day/Night choice takes precedence over the device preference', () => {
  const a = app({ state: { theme: 'day' }, prefersDark: true });
  assert.equal(a.node('html').dataset.theme, 'day');
  a.run('toggleTheme()');
  const state = JSON.parse(a.storage.get('pst100_v1'));
  assert.equal(state.theme, 'night');
  assert.equal(a.node('theme-toggle')['aria-pressed'], 'true');
  const b = app({ state, prefersDark: false });
  assert.equal(b.run('S.theme'), 'night');
  assert.equal(b.node('html').dataset.theme, 'night');
});

test('theme switching preserves race data and unsaved form edits without rerendering', () => {
  const a = app();
  a.run('S.dep[0]=START;S.arr[1]=START+120*60000;S.chk["1:0"]=true;S.pid="B"');
  const before = a.run('JSON.stringify({arr:S.arr,dep:S.dep,hist:S.hist,chk:S.chk,pid:S.pid,sim:S.sim,plans:S.plans})');
  a.node('pa10').value = '26:40';
  a.run('render=()=>{throw new Error("theme must not replace the current view")};toggleTheme()');
  assert.equal(a.node('pa10').value, '26:40');
  assert.equal(a.run('JSON.stringify({arr:S.arr,dep:S.dep,hist:S.hist,chk:S.chk,pid:S.pid,sim:S.sim,plans:S.plans})'), before);
});

test('a corrupt saved theme falls back to the device preference', () => {
  const a = app({ state: { theme: 'unknown' }, prefersDark: true });
  assert.equal(a.run('S.theme'), 'night');
});

test('running screen uses compact English controls while retaining Thai course advice', () => {
  const a = app();
  a.run('S.dep[0]=START;now=()=>START+60*60000;render()');
  const html = a.node('main').innerHTML;
  assert.match(html, />Arrived A1<\/button>/);
  assert.match(html, />Remaining to A1<\/div>/);
  assert.match(html, />ETA \(plan\)<\/div>/);
  assert.ok(html.includes(a.run('P[0].leg')));
  assert.ok(html.includes(a.run('P[1].arrive[0]')));
  assert.doesNotMatch(html, /เวลาใต้แผน|แตะเพื่อติ๊ก/);
});

test('profile keeps live course position without GPS diagnostics and demo controls', () => {
  const a = app();
  a.run('gpsFix(RT.p[CPI[6]].la,RT.p[CPI[6]].lo,10);setTab("map")');
  const html = a.node('main').innerHTML;
  assert.match(html, /72\.0 \/ 105\.8 km/);
  assert.match(html, />Start GPS<\/button>/);
  assert.doesNotMatch(html, /Secure context|location\.protocol|type="range"|gpsOnce\(|gpsDemo\(/);
});

test('race-day interface has no preview entry or simulation editor', () => {
  const a = app();
  a.run('now=()=>START-24*3600000;render()');
  assert.doesNotMatch(a.node('main').innerHTML, /Preview race|testStart\(/);
  assert.equal(a.run('typeof testStart'), 'undefined');
  a.run('setTab("set")');
  const html = a.node('main').innerHTML;
  assert.match(html, />Save plan<\/button>/);
  assert.match(html, />Clear records<\/button>/);
  assert.doesNotMatch(html, /Exit preview|id="simv"|datetime-local|Secure context|ใช้เล่นลองกด/);
});

test('remaining ascent and descent agree with the official totals at every CP', () => {
  const a = app();
  for (let i = 0; i < 10; i++) {
    const actual = a.run(`sumGL(P[${i}].km,P[${i + 1}].km)`);
    assert.ok(Math.abs(actual[0] - a.run(`P[${i}].gain`)) < 1e-7, `climb from CP ${i}`);
    assert.ok(Math.abs(actual[1] - a.run(`P[${i}].loss`)) < 1e-7, `descent from CP ${i}`);
  }
});

test('remaining elevation includes the unfinished part of a GPS segment', () => {
  const a = app();
  const whole = a.run('sumGL(0,RT.p[1].k)[1]');
  const half = a.run('sumGL(RT.p[1].k/2,RT.p[1].k)[1]');
  assert.ok(whole > 0);
  assert.ok(Math.abs(half - whole / 2) < 1e-7);
  assert.deepEqual(Array.from(a.run('sumGL(105.8,105.8)')), [0, 0]);
  assert.deepEqual(Array.from(a.run('sumGL(80,70)')), [0, 0]);
});

test('Now shows remaining distances, elevation and plan ETA together', () => {
  const a = app();
  a.run('S.dep[0]=START;render()');
  const html = a.node('main').innerHTML;
  for (const key of ['courseKm', 'toFinish', 'toCP', 'climbLeft', 'descentLeft', 'gpsStatus', 'gpsToggle', 'nsEta']) {
    assert.ok(html.includes(`data-k="${key}"`), key);
  }
});

test('without GPS the remaining metrics are explicitly anchored to the last recorded CP', () => {
  const a = app();
  const r = a.run('routeProgress(3,4)');
  assert.equal(r.source, 'cp');
  assert.equal(r.km, 38.5);
  assert.ok(Math.abs(r.toCP - 13.3) < 1e-7);
  assert.ok(Math.abs(r.toFinish - 67.3) < 1e-7);
  assert.equal(r.gain, 508);
  assert.equal(r.loss, 429);
  assert.match(r.status, /From A3/);
  assert.match(r.status, /GPS off/);
});

test('a GPS fix updates remaining metrics on Now without replacing the screen or race records', () => {
  const a = app();
  a.run('S.dep[0]=START;S.arr[3]=START;S.dep[3]=START;G.on=true');
  const before = a.run('JSON.stringify([S.arr,S.dep,S.hist,S.chk,S.pid])');
  a.run('render=()=>{throw new Error("do not rebuild Now on every fix")};gpsOk({coords:{latitude:RT.p[450].la,longitude:RT.p[450].lo,accuracy:10}})');
  const r = a.run('routeProgress(3,4)');
  assert.equal(r.source, 'gps');
  assert.ok(r.km > 38.5 && r.km < 51.8);
  assert.ok(r.toCP > 0 && r.toCP < 13.3);
  assert.ok(r.gain >= 0 && r.gain <= 508);
  assert.ok(r.loss >= 0 && r.loss <= 429);
  const live = a.run('live()');
  assert.match(live.toFinish[0], new RegExp(r.toFinish.toFixed(1)));
  assert.equal(a.run('JSON.stringify([S.arr,S.dep,S.hist,S.chk,S.pid])'), before);
});

test('stopped or stale GPS fixes are labelled as last fixes', () => {
  const a = app();
  a.run('gpsFix(RT.p[450].la,RT.p[450].lo,10);G.on=true;G.t=Date.now()-120000');
  let r = a.run('routeProgress(3,4)');
  assert.equal(r.source, 'gps');
  assert.match(r.status, /Last fix/);
  assert.equal(r.tone, 'warn');
  a.run('G.t=Date.now();G.on=false');
  r = a.run('routeProgress(3,4)');
  assert.match(r.status, /Last fix/);
});

test('GPS far from the course falls back to recorded CP data', () => {
  const a = app();
  a.run('G.km=45;G.off=3000;G.acc=10;G.t=Date.now();G.on=true');
  const r = a.run('routeProgress(3,4)');
  assert.equal(r.source, 'cp');
  assert.equal(r.km, 38.5);
  assert.match(r.status, /Off route/);
});

test('GPS past an unrecorded CP never silently advances its ETA target', () => {
  const a = app();
  a.run('S.dep[0]=START;S.arr[3]=START;S.dep[3]=START;G.km=60;G.off=0;G.acc=10;G.t=Date.now();G.on=true');
  const r = a.run('routeProgress(3,4)');
  assert.equal(r.toCP, null);
  assert.equal(r.gain, null);
  assert.match(r.status, /Past A4/);
  assert.equal(a.run('model().last'), 3);
  assert.equal(a.run('S.arr[4]'), undefined);
});

test('GPS before a recorded CP uses that CP rather than jumping back to an old leg', () => {
  const a = app();
  a.run('G.km=45;G.off=0;G.acc=10;G.t=Date.now();G.on=true');
  const r = a.run('routeProgress(4,5)');
  assert.equal(r.source, 'cp');
  assert.equal(r.km, 51.8);
  assert.match(r.status, /From A4/);
});

test('finish distances and elevation stop at zero on the final route point', () => {
  const a = app();
  a.run('G.km=105.8;G.off=0;G.acc=10;G.t=Date.now();G.on=true');
  const r = a.run('routeProgress(9,10)');
  assert.equal(r.toCP, 0);
  assert.equal(r.toFinish, 0);
  assert.equal(r.gain, 0);
  assert.equal(r.loss, 0);
});
