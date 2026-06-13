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
const RELOGIN = path.join(__dirname, 'relogin-gettoken.js');

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
  const expiredSites = [];  // 记录令牌失效的站点

  // muyuan：令牌调签到
  {
    const t = tokens.muyuan; const p = await ctx.newPage();
    try {
      await p.goto('https://muyuan.do/login', { waitUntil: 'networkidle', timeout: 60000 });
      await p.waitForTimeout(2000);
      const res = await p.evaluate(async (a) => {
        try {
          // 签到前查询余额
          const before = await fetch('https://muyuan.do/api/user/self', { headers: { 'Authorization': a.token, 'New-Api-User': String(a.uid) } });
          let beforeData = {};
          try { beforeData = JSON.parse(await before.text()); } catch (e) {}
          const quotaBefore = beforeData.data && beforeData.data.quota;

          // 执行签到
          const r = await fetch('https://muyuan.do/api/user/checkin', { method: 'POST', headers: { 'Authorization': a.token, 'New-Api-User': String(a.uid), 'Content-Type': 'application/json' } });
          let j = {};
          try { j = JSON.parse(await r.text()); } catch (e) {}

          // 签到后查询余额
          await new Promise(resolve => setTimeout(resolve, 1000));
          const after = await fetch('https://muyuan.do/api/user/self', { headers: { 'Authorization': a.token, 'New-Api-User': String(a.uid) } });
          let afterData = {};
          try { afterData = JSON.parse(await after.text()); } catch (e) {}
          const quotaAfter = afterData.data && afterData.data.quota;

          return { status: r.status, success: j.success, message: j.message, quotaBefore, quotaAfter };
        } catch (e) { return { netErr: e.message }; }
      }, t);
      if (res.netErr) { log(`君の公益: ❌ 网络异常 ${res.netErr}`); bad++; }
      else if (res.success === true) {
        let msg = `君の公益: ✅ 签到成功`;
        if (res.quotaBefore !== undefined && res.quotaAfter !== undefined) {
          const change = res.quotaAfter - res.quotaBefore;
          msg += ` | 余额: $${(res.quotaBefore / 500000).toFixed(2)} → $${(res.quotaAfter / 500000).toFixed(2)}`;
          if (change > 0) msg += ` (+$${(change / 500000).toFixed(2)})`;
        }
        if (res.message) msg += ` | ${res.message}`;
        log(msg);
        ok++;
      }
      else if (res.success === false && /已签到|签到过|already/i.test(res.message || '')) {
        let msg = `君の公益: ✅ 今日已签到`;
        if (res.quotaBefore !== undefined) msg += ` | 当前余额: $${(res.quotaBefore / 500000).toFixed(2)}`;
        log(msg);
        ok++;
      }
      else if (res.status === 401) { log(`君の公益: 🔑 令牌失效，请重新运行 relogin-gettoken.js`); bad++; expiredSites.push('muyuan'); }
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
            // 签到前查询余额
            const before = await fetch('https://free.lyclaude.site/api/user/self', { headers: { 'Authorization': a.token, 'New-Api-User': String(a.uid) } });
            let beforeData = {};
            try { beforeData = JSON.parse(await before.text()); } catch (e) {}
            const quotaBefore = beforeData.data && beforeData.data.quota;

            // 执行签到
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

            // 签到后查询余额
            await new Promise(resolve => setTimeout(resolve, 1000));
            const after = await fetch('https://free.lyclaude.site/api/user/self', { headers: { 'Authorization': a.token, 'New-Api-User': String(a.uid) } });
            let afterData = {};
            try { afterData = JSON.parse(await after.text()); } catch (e) {}
            const quotaAfter = afterData.data && afterData.data.quota;

            return { status: r.status, success: j.success, message: j.message, quotaBefore, quotaAfter };
          } catch (e) {
            return { netErr: e.message };
          }
        }, t);
        if (res.netErr) { log(`LyClaude: ❌ 网络异常 ${res.netErr}`); bad++; }
        else if (res.success === true) {
          let msg = `LyClaude: ✅ 签到成功`;
          if (res.quotaBefore !== undefined && res.quotaAfter !== undefined) {
            const change = res.quotaAfter - res.quotaBefore;
            msg += ` | 余额: $${(res.quotaBefore / 500000).toFixed(2)} → $${(res.quotaAfter / 500000).toFixed(2)}`;
            if (change > 0) msg += ` (+$${(change / 500000).toFixed(2)})`;
          }
          if (res.message) msg += ` | ${res.message}`;
          log(msg);
          ok++;
        }
        else if (res.success === false && /already|今日|已签到|已簽到|signed/i.test(res.message || '')) {
          let msg = `LyClaude: ✅ 今日已签到`;
          if (res.quotaBefore !== undefined) msg += ` | 当前余额: $${(res.quotaBefore / 500000).toFixed(2)}`;
          log(msg);
          ok++;
        }
        else if (res.status === 401) { log('LyClaude: 🔑 令牌失效，请重新运行 relogin-gettoken.js'); bad++; expiredSites.push('lyclaude'); }
        else { log(`LyClaude: ⚠️ status=${res.status} success=${res.success} msg=${res.message || ''}`); bad++; }
      }
    } catch (e) { log(`LyClaude: ❌ 异常 ${e.message}`); bad++; }
    await p.close().catch(() => {});
  }

  // anyrouter：访问首页（触发自动发放）+ 令牌查余额
  {
    const t = tokens.anyrouter; const p = await ctx.newPage();
    try {
      // 签到前查询余额
      const resBefore = await p.evaluate(async (a) => {
        try { const r = await fetch('https://anyrouter.top/api/user/self', { headers: { 'Authorization': a.token, 'New-Api-User': String(a.uid) } }); let j = {}; try { j = JSON.parse(await r.text()); } catch (e) {} return { status: r.status, quota: j.data && j.data.quota }; } catch (e) { return { netErr: e.message }; }
      }, t);

      // 访问首页触发自动发放
      await p.goto('https://anyrouter.top/', { waitUntil: 'networkidle', timeout: 60000 });
      await p.waitForTimeout(4000);

      // 签到后查询余额
      const res = await p.evaluate(async (a) => {
        try { const r = await fetch('https://anyrouter.top/api/user/self', { headers: { 'Authorization': a.token, 'New-Api-User': String(a.uid) } }); let j = {}; try { j = JSON.parse(await r.text()); } catch (e) {} return { status: r.status, quota: j.data && j.data.quota }; } catch (e) { return { netErr: e.message }; }
      }, t);

      if (res.netErr) { log(`AnyRouter: ❌ 网络异常 ${res.netErr}`); bad++; }
      else if (res.status === 200) {
        let msg = `AnyRouter: ✅ 已访问首页（自动发放）`;
        if (resBefore.quota !== undefined && res.quota !== undefined) {
          const change = res.quota - resBefore.quota;
          msg += ` | 余额: $${(resBefore.quota / 500000).toFixed(2)} → $${(res.quota / 500000).toFixed(2)}`;
          if (change > 0) msg += ` (+$${(change / 500000).toFixed(2)})`;
          else if (change === 0) msg += ` (无变化)`;
        } else if (res.quota !== undefined) {
          msg += ` | 当前余额: $${(res.quota / 500000).toFixed(2)}`;
        }
        log(msg);
        ok++;
      }
      else if (res.status === 401) { log(`AnyRouter: 🔑 令牌失效，请重新运行 relogin-gettoken.js`); bad++; expiredSites.push('anyrouter'); }
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
            // 签到前查询余额
            const before = await fetch('https://ai.1692958.xyz/api/user/self', { headers: { 'Authorization': a.token, 'New-Api-User': String(a.uid) } });
            let beforeData = {};
            try { beforeData = JSON.parse(await before.text()); } catch (e) {}
            const quotaBefore = beforeData.data && beforeData.data.quota;

            // 执行签到
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

            // 签到后查询余额
            await new Promise(resolve => setTimeout(resolve, 1000));
            const after = await fetch('https://ai.1692958.xyz/api/user/self', { headers: { 'Authorization': a.token, 'New-Api-User': String(a.uid) } });
            let afterData = {};
            try { afterData = JSON.parse(await after.text()); } catch (e) {}
            const quotaAfter = afterData.data && afterData.data.quota;

            return { status: r.status, success: j.success, message: j.message, quotaBefore, quotaAfter };
          } catch (e) {
            return { netErr: e.message };
          }
        }, t);
        if (res.netErr) { log(`AI1692958: ❌ 网络异常 ${res.netErr}`); bad++; }
        else if (res.success === true) {
          let msg = `AI1692958: ✅ 签到成功`;
          if (res.quotaBefore !== undefined && res.quotaAfter !== undefined) {
            const change = res.quotaAfter - res.quotaBefore;
            msg += ` | 余额: $${(res.quotaBefore / 500000).toFixed(2)} → $${(res.quotaAfter / 500000).toFixed(2)}`;
            if (change > 0) msg += ` (+$${(change / 500000).toFixed(2)})`;
          }
          if (res.message) msg += ` | ${res.message}`;
          log(msg);
          ok++;
        }
        else if (res.success === false && /already|今日|已签到|已簽到|signed/i.test(res.message || '')) {
          let msg = `AI1692958: ✅ 今日已签到`;
          if (res.quotaBefore !== undefined) msg += ` | 当前余额: $${(res.quotaBefore / 500000).toFixed(2)}`;
          log(msg);
          ok++;
        }
        else if (res.status === 401) { log('AI1692958: 🔑 令牌失效，请重新运行 relogin-gettoken.js'); bad++; expiredSites.push('ai1692958'); }
        else { log(`AI1692958: ⚠️ status=${res.status} success=${res.success} msg=${res.message || ''}`); bad++; }
      }
    } catch (e) { log(`AI1692958: ❌ 异常 ${e.message}`); bad++; }
    await p.close().catch(() => {});
  }

  // gyapi：令牌调签到
  {
    const t = tokens.gyapi; const p = await ctx.newPage();
    try {
      if (!t || !t.token) {
        log('GyAPI: token missing, run relogin-gettoken.js after logging in to https://gyapi.zxiaoruan.cn/');
        bad++;
      } else {
        await p.goto('https://gyapi.zxiaoruan.cn/profile', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await p.waitForTimeout(1500);
        const res = await p.evaluate(async (a) => {
          try {
            // 签到前查询余额
            const before = await fetch('https://gyapi.zxiaoruan.cn/api/user/self', { headers: { 'Authorization': a.token, 'New-Api-User': String(a.uid) } });
            let beforeData = {};
            try { beforeData = JSON.parse(await before.text()); } catch (e) {}
            const quotaBefore = beforeData.data && beforeData.data.quota;

            // 执行签到
            const r = await fetch('https://gyapi.zxiaoruan.cn/api/user/checkin', {
              method: 'POST',
              headers: {
                'Authorization': a.token,
                'New-Api-User': String(a.uid),
                'Content-Type': 'application/json'
              }
            });
            let j = {};
            try { j = JSON.parse(await r.text()); } catch (e) {}

            // 签到后查询余额
            await new Promise(resolve => setTimeout(resolve, 1000));
            const after = await fetch('https://gyapi.zxiaoruan.cn/api/user/self', { headers: { 'Authorization': a.token, 'New-Api-User': String(a.uid) } });
            let afterData = {};
            try { afterData = JSON.parse(await after.text()); } catch (e) {}
            const quotaAfter = afterData.data && afterData.data.quota;

            return { status: r.status, success: j.success, message: j.message, quotaBefore, quotaAfter };
          } catch (e) {
            return { netErr: e.message };
          }
        }, t);
        if (res.netErr) { log(`GyAPI: ❌ 网络异常 ${res.netErr}`); bad++; }
        else if (res.success === true) {
          let msg = `GyAPI: ✅ 签到成功`;
          if (res.quotaBefore !== undefined && res.quotaAfter !== undefined) {
            const change = res.quotaAfter - res.quotaBefore;
            msg += ` | 余额: $${(res.quotaBefore / 500000).toFixed(2)} → $${(res.quotaAfter / 500000).toFixed(2)}`;
            if (change > 0) msg += ` (+$${(change / 500000).toFixed(2)})`;
          }
          if (res.message) msg += ` | ${res.message}`;
          log(msg);
          ok++;
        }
        else if (res.success === false && /already|今日|已签到|已簽到|signed/i.test(res.message || '')) {
          let msg = `GyAPI: ✅ 今日已签到`;
          if (res.quotaBefore !== undefined) msg += ` | 当前余额: $${(res.quotaBefore / 500000).toFixed(2)}`;
          log(msg);
          ok++;
        }
        else if (res.status === 401) { log('GyAPI: 🔑 令牌失效，请重新运行 relogin-gettoken.js'); bad++; expiredSites.push('gyapi'); }
        else { log(`GyAPI: ⚠️ status=${res.status} success=${res.success} msg=${res.message || ''}`); bad++; }
      }
    } catch (e) { log(`GyAPI: ❌ 异常 ${e.message}`); bad++; }
    await p.close().catch(() => {});
  }

  // chybenzun：令牌调签到
  {
    const t = tokens.chybenzun; const p = await ctx.newPage();
    try {
      if (!t || !t.token) {
        log('CHY本尊: token missing, run relogin-gettoken.js after logging in to https://chybenzun.top/sign-in');
        bad++;
      } else {
        await p.goto('https://chybenzun.top/profile', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await p.waitForTimeout(1500);
        const res = await p.evaluate(async (a) => {
          try {
            const before = await fetch('https://chybenzun.top/api/user/self', { headers: { 'Authorization': a.token, 'New-Api-User': String(a.uid) } });
            let beforeData = {};
            try { beforeData = JSON.parse(await before.text()); } catch (e) {}
            const quotaBefore = beforeData.data && beforeData.data.quota;
            const r = await fetch('https://chybenzun.top/api/user/checkin', {
              method: 'POST',
              headers: { 'Authorization': a.token, 'New-Api-User': String(a.uid), 'Content-Type': 'application/json' }
            });
            let j = {};
            try { j = JSON.parse(await r.text()); } catch (e) {}
            await new Promise(resolve => setTimeout(resolve, 1000));
            const after = await fetch('https://chybenzun.top/api/user/self', { headers: { 'Authorization': a.token, 'New-Api-User': String(a.uid) } });
            let afterData = {};
            try { afterData = JSON.parse(await after.text()); } catch (e) {}
            const quotaAfter = afterData.data && afterData.data.quota;
            return { status: r.status, success: j.success, message: j.message, quotaBefore, quotaAfter };
          } catch (e) { return { netErr: e.message }; }
        }, t);
        if (res.netErr) { log(`CHY本尊: ❌ 网络异常 ${res.netErr}`); bad++; }
        else if (res.success === true) {
          let msg = `CHY本尊: ✅ 签到成功`;
          if (res.quotaBefore !== undefined && res.quotaAfter !== undefined) {
            const change = res.quotaAfter - res.quotaBefore;
            msg += ` | 余额: $${(res.quotaBefore / 500000).toFixed(2)} → $${(res.quotaAfter / 500000).toFixed(2)}`;
            if (change > 0) msg += ` (+$${(change / 500000).toFixed(2)})`;
          }
          if (res.message) msg += ` | ${res.message}`;
          log(msg); ok++;
        }
        else if (res.success === false && /already|今日|已签到|已簽到|signed/i.test(res.message || '')) {
          let msg = `CHY本尊: ✅ 今日已签到`;
          if (res.quotaBefore !== undefined) msg += ` | 当前余额: $${(res.quotaBefore / 500000).toFixed(2)}`;
          log(msg); ok++;
        }
        else if (res.status === 401) { log('CHY本尊: 🔑 令牌失效，请重新运行 relogin-gettoken.js'); bad++; expiredSites.push('chybenzun'); }
        else { log(`CHY本尊: ⚠️ status=${res.status} success=${res.success} msg=${res.message || ''}`); bad++; }
      }
    } catch (e) { log(`CHY本尊: ❌ 异常 ${e.message}`); bad++; }
    await p.close().catch(() => {});
  }

  await browser.close();
  log(`本次完成：成功 ${ok}/6` + (bad ? `，${bad} 项需关注` : ''));

  // 如果有令牌失效，自动触发重新登录
  if (expiredSites.length > 0) {
    log(`检测到 ${expiredSites.length} 个站点令牌失效 [${expiredSites.join(', ')}]，自动启动重新登录...`);
    const { spawn } = require('child_process');
    const child = spawn(process.execPath, [RELOGIN], { cwd: __dirname, detached: false, stdio: 'inherit' });
    child.on('exit', (code) => {
      log(`relogin-gettoken.js 退出，exit code=${code}`);
      process.exit(code || (bad ? 1 : 0));
    });
  } else {
    process.exit(bad ? 1 : 0);
  }
})().catch(e => { log('FATAL ' + e.message); process.exit(1); });
