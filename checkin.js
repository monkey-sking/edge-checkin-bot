// 每日自动签到（令牌模式，不依赖易过期的 session）。
//  - muyuan   ：用长期访问令牌 POST /api/user/checkin（点击签到）
//  - anyrouter：访问首页触发自动发放 + 用令牌查余额记录（你说的“首页自动发”）
//  - lyclaude ：用长期访问令牌 POST /api/user/checkin
// 令牌存于 tokens.json，由 relogin-gettoken.js 生成；state.json 提供过 Cloudflare 的 cookie。
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const STATE = path.join(__dirname, 'state.json');
const TOKENS = path.join(__dirname, 'tokens.json');
const LOG = path.join(__dirname, 'checkin-log.txt');

function log(line) {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
  const s = `[${ts}] ${line}`;
  console.log(s);
  try { fs.appendFileSync(LOG, s + '\n'); } catch (e) {}
}

(async () => {
  if (!fs.existsSync(STATE) || !fs.existsSync(TOKENS)) { log('FATAL: 缺少 state.json 或 tokens.json，请先运行 relogin-gettoken.js'); process.exit(1); }
  const tokens = JSON.parse(fs.readFileSync(TOKENS, 'utf8'));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ storageState: STATE });
  let ok = 0, bad = 0;

  // muyuan：令牌调签到
  {
    const t = tokens.muyuan; const p = await ctx.newPage();
    try {
      await p.goto('https://muyuan.do/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForTimeout(1500);
      const res = await p.evaluate(async (a) => {
        try { const r = await fetch('https://muyuan.do/api/user/checkin', { method: 'POST', headers: { 'Authorization': a.token, 'New-Api-User': String(a.uid), 'Content-Type': 'application/json' } }); let j = {}; try { j = JSON.parse(await r.text()); } catch (e) {} return { status: r.status, success: j.success, message: j.message }; } catch (e) { return { netErr: e.message }; }
      }, t);
      if (res.netErr) { log(`君の公益: ❌ 网络异常 ${res.netErr}`); bad++; }
      else if (res.success === true) { log(`君の公益: ✅ 签到成功 ${res.message || ''}`.trim()); ok++; }
      else if (res.success === false && /已签到|签到过|already/i.test(res.message || '')) { log(`君の公益: ✅ 今日已签到`); ok++; }
      else if (res.status === 401) { log(`君の公益: 🔑 令牌失效，请重新运行 relogin-gettoken.js`); bad++; }
      else { log(`君の公益: ⚠️ status=${res.status} success=${res.success} msg=${res.message || ''}`); bad++; }
    } catch (e) { log(`君の公益: ❌ 异常 ${e.message}`); bad++; }
    await p.close().catch(() => {});
  }

  // lyclaude：令牌调签到
  {
    const t = tokens.lyclaude; const p = await ctx.newPage();
    try {
      if (!t || !t.token) {
        log('LyClaude: token missing, run relogin-gettoken.js after logging in to https://free.lyclaude.site/');
        bad++;
      } else {
        await p.goto('https://free.lyclaude.site/console', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await p.waitForTimeout(1500);
        const res = await p.evaluate(async (a) => {
          try {
            const r = await fetch('https://free.lyclaude.site/api/user/checkin', {
              method: 'POST',
              headers: {
                'Authorization': a.token,
                'New-Api-User': String(a.uid),
                'Content-Type': 'application/json'
              }
            });
            let j = {};
            try { j = JSON.parse(await r.text()); } catch (e) {}
            return { status: r.status, success: j.success, message: j.message };
          } catch (e) {
            return { netErr: e.message };
          }
        }, t);
        if (res.netErr) { log(`LyClaude: network error ${res.netErr}`); bad++; }
        else if (res.success === true) { log(`LyClaude: check-in success ${res.message || ''}`.trim()); ok++; }
        else if (res.success === false && /already|今日|已签到|已簽到|signed/i.test(res.message || '')) { log('LyClaude: already checked in today'); ok++; }
        else if (res.status === 401) { log('LyClaude: token expired, run relogin-gettoken.js'); bad++; }
        else { log(`LyClaude: status=${res.status} success=${res.success} msg=${res.message || ''}`); bad++; }
      }
    } catch (e) { log(`LyClaude: error ${e.message}`); bad++; }
    await p.close().catch(() => {});
  }

  // anyrouter：访问首页（触发自动发放）+ 令牌查余额
  {
    const t = tokens.anyrouter; const p = await ctx.newPage();
    try {
      await p.goto('https://anyrouter.top/', { waitUntil: 'networkidle', timeout: 60000 });
      await p.waitForTimeout(4000);
      const res = await p.evaluate(async (a) => {
        try { const r = await fetch('https://anyrouter.top/api/user/self', { headers: { 'Authorization': a.token, 'New-Api-User': String(a.uid) } }); let j = {}; try { j = JSON.parse(await r.text()); } catch (e) {} return { status: r.status, quota: j.data && j.data.quota }; } catch (e) { return { netErr: e.message }; }
      }, t);
      if (res.netErr) { log(`AnyRouter: ❌ 网络异常 ${res.netErr}`); bad++; }
      else if (res.status === 200) { log(`AnyRouter: ✅ 已访问首页（自动发放），余额约 $${(res.quota / 500000).toFixed(2)}`); ok++; }
      else if (res.status === 401) { log(`AnyRouter: 🔑 令牌失效，请重新运行 relogin-gettoken.js`); bad++; }
      else { log(`AnyRouter: ⚠️ status=${res.status}`); bad++; }
    } catch (e) { log(`AnyRouter: ❌ 异常 ${e.message}`); bad++; }
    await p.close().catch(() => {});
  }

  // ai1692958：令牌调签到
  {
    const t = tokens.ai1692958; const p = await ctx.newPage();
    try {
      if (!t || !t.token) {
        log('AI1692958: token missing, run relogin-gettoken.js after logging in to https://ai.1692958.xyz/');
        bad++;
      } else {
        await p.goto('https://ai.1692958.xyz/console/personal', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await p.waitForTimeout(1500);
        const res = await p.evaluate(async (a) => {
          try {
            const r = await fetch('https://ai.1692958.xyz/api/user/checkin', {
              method: 'POST',
              headers: {
                'Authorization': a.token,
                'New-Api-User': String(a.uid),
                'Content-Type': 'application/json'
              }
            });
            let j = {};
            try { j = JSON.parse(await r.text()); } catch (e) {}
            return { status: r.status, success: j.success, message: j.message };
          } catch (e) {
            return { netErr: e.message };
          }
        }, t);
        if (res.netErr) { log(`AI1692958: ❌ 网络异常 ${res.netErr}`); bad++; }
        else if (res.success === true) { log(`AI1692958: ✅ 签到成功 ${res.message || ''}`.trim()); ok++; }
        else if (res.success === false && /already|今日|已签到|已簽到|signed/i.test(res.message || '')) { log('AI1692958: ✅ 今日已签到'); ok++; }
        else if (res.status === 401) { log('AI1692958: 🔑 令牌失效，请重新运行 relogin-gettoken.js'); bad++; }
        else { log(`AI1692958: ⚠️ status=${res.status} success=${res.success} msg=${res.message || ''}`); bad++; }
      }
    } catch (e) { log(`AI1692958: ❌ 异常 ${e.message}`); bad++; }
    await p.close().catch(() => {});
  }

  await browser.close();
  log(`本次完成：成功 ${ok}/4` + (bad ? `，${bad} 项需关注` : ''));
  process.exit(bad ? 1 : 0);
})().catch(e => { log('FATAL ' + e.message); process.exit(1); });
