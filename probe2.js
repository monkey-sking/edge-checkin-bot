// 带 New-Api-User 头，对候选签到端点发 POST，定位真实签到接口（顺便完成今日签到）。
const path = require('path');
const { chromium } = require('playwright-core');

const SITES = [
  { key: 'anyrouter', origin: 'https://anyrouter.top' },
  { key: 'muyuan',    origin: 'https://muyuan.do' },
  { key: 'lyclaude',  origin: 'https://free.lyclaude.site' },
];
// 只放“签到”语义端点，POST 触发即签到，幂等安全（重复=今日已签到）
const EPS = ['/api/user/check_in', '/api/user/checkin', '/api/user/clock_in', '/api/user/clockin', '/api/user/sign_in', '/api/user/sign', '/api/user/daily_check_in'];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ storageState: path.join(__dirname, 'state.json') });
  const out = [];
  for (const s of SITES) {
    const p = await ctx.newPage();
    const r = { key: s.key };
    try {
      await p.goto(s.origin + '/console', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForTimeout(1200);
      r.result = await p.evaluate(async (args) => {
        const { origin, eps } = args;
        let uid = '';
        try { uid = (JSON.parse(localStorage.getItem('user') || '{}').id) || ''; } catch (e) {}
        const H = { 'New-Api-User': String(uid), 'Content-Type': 'application/json' };
        const self = await (async () => { try { const res = await fetch(origin + '/api/user/self', { credentials: 'include', headers: H }); const j = await res.json(); return { status: res.status, success: j.success, name: j.data && (j.data.display_name || j.data.username) }; } catch (e) { return { err: e.message }; } })();
        const probes = [];
        for (const ep of eps) {
          try {
            const res = await fetch(origin + ep, { method: 'POST', credentials: 'include', headers: H });
            let b = ''; try { b = (await res.text()).slice(0, 200); } catch (e) {}
            probes.push({ ep, status: res.status, body: b });
          } catch (e) { probes.push({ ep, err: e.message }); }
        }
        return { uid, self, probes };
      }, { origin: s.origin, eps: EPS });
    } catch (e) { r.error = e.message; }
    await p.close().catch(() => {});
    out.push(r);
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
