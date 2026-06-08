// 免管理员常驻调度：随登录自启，每天 09:00 跑 checkin.js；
// 启动时若当天尚未签到则立即补签。无需管理员权限。
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const RUN_HOUR = 9, RUN_MIN = 0;
const NODE = process.execPath;
const SCRIPT = path.join(__dirname, 'checkin.js');
const STAMP = path.join(__dirname, 'last-run.txt');
const LOG = path.join(__dirname, 'checkin-log.txt');

const z = (n) => String(n).padStart(2, '0');
const tstamp = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
const dayStr = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
const logline = (s) => { try { fs.appendFileSync(LOG, `[${tstamp(new Date())}] ${s}\n`); } catch (e) {} };

function runCheckin(reason) {
  try { fs.writeFileSync(STAMP, dayStr(new Date())); } catch (e) {}
  logline(`daemon 触发签到（${reason}）`);
  const child = spawn(NODE, [SCRIPT], { cwd: __dirname, detached: true, stdio: 'ignore' });
  child.unref();
}
function msToNext() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(RUN_HOUR, RUN_MIN, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}
function loop() { setTimeout(() => { runCheckin('每日定时'); loop(); }, msToNext()); }

try { fs.writeFileSync(path.join(__dirname, 'daemon.pid'), String(process.pid)); } catch (e) {}
logline(`daemon 启动（pid=${process.pid}），每天 ${z(RUN_HOUR)}:${z(RUN_MIN)} 自动签到`);

// 启动补签
try {
  const now = new Date();
  const past = now.getHours() > RUN_HOUR || (now.getHours() === RUN_HOUR && now.getMinutes() >= RUN_MIN);
  const last = fs.existsSync(STAMP) ? fs.readFileSync(STAMP, 'utf8').trim() : '';
  if (past && last !== dayStr(now)) runCheckin('启动补签');
} catch (e) {}

loop();
