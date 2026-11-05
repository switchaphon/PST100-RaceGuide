const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

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

test('reset after rehearsal returns to real time and persists an empty race', () => {
  const a = app();
  a.run('testStart();resetAll()');
  const state = JSON.parse(a.storage.get('pst100_v1'));
  assert.equal(state.sim, 0);
  assert.deepEqual(state.dep, {});
  assert.deepEqual(state.arr, {});
  assert.deepEqual(state.hist, []);
  assert.equal(a.run('model().mode'), 'pre');
});

test('start button unlocks as the live clock crosses one hour before start', () => {
  const a = app();
  a.run('now=()=>START-61*60000;render()');
  assert.doesNotMatch(a.node('main').innerHTML, /ออกตัวแล้ว/);
  a.run('now=()=>START-59*60000;applyLive()');
  assert.match(a.node('main').innerHTML, /ออกตัวแล้ว/);
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
  a.run('testStart();S.arr[1]=START+120*60000;S.chk["1:0"]=true;S.pid="B"');
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
