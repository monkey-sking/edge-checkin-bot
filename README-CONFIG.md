# 自动签到系统配置说明

## 配置文件：sites-config.json

只需编辑 `sites-config.json`，添加新网站即可自动支持签到。

### 配置字段说明：

```json
{
  "key": "站点标识（唯一）",
  "name": "显示名称",
  "origin": "网站根域名",
  "uid": "用户ID（可选，自动获取）",
  "loginUrl": "登录页URL",
  "checkUrl": "检查登录状态的URL",
  "checkinType": "签到类型：api 或 visit",
  "apiPath": "签到API路径（checkinType=api时必填）",
  "visitUrl": "访问URL（checkinType=visit时，默认使用origin）"
}
```

### 签到类型说明：

1. **api** - 调用签到API（最常见）
   - 需要 `apiPath` 字段
   - 自动调用 `POST {origin}{apiPath}` 进行签到
   - 自动查询前后余额

2. **visit** - 访问页面触发自动签到
   - 需要 `visitUrl` 字段（可选，默认访问 origin）
   - 适用于访问首页即自动发放的网站

## 使用方法

### 1. 添加新网站
编辑 `sites-config.json`，添加新配置：
```json
{
  "key": "newsite",
  "name": "新站点",
  "origin": "https://example.com",
  "uid": "",
  "loginUrl": "https://example.com/login",
  "checkUrl": "https://example.com/dashboard",
  "checkinType": "api",
  "apiPath": "/api/user/checkin"
}
```

### 2. 获取token
```bash
node relogin-gettoken-v2.js
```
脚本会自动：
- 打开所有网站的登录页
- 等待你手动登录
- 自动提取token并保存

### 3. 执行签到
```bash
node checkin-v2.js
```

### 4. Token失效自动提示
当检测到401错误时，会提示：
```
站点名: 🔑 令牌失效，请重新运行 relogin-gettoken-v2.js
```

## 现有支持的网站

- 君の公益 (muyuan.do)
- LyClaude (free.lyclaude.site)
- AnyRouter (anyrouter.top)
- AI1692958 (ai.1692958.xyz)
- GyAPI (gyapi.zxiaoruan.cn)

## 迁移到新版本

新版本是向后兼容的，可以直接使用：
1. 使用 `checkin-v2.js` 替代 `checkin.js`
2. 使用 `relogin-gettoken-v2.js` 替代 `relogin-gettoken.js`
3. 原有的 `tokens.json` 和 `state.json` 可继续使用

今后添加新网站只需编辑 `sites-config.json` 即可！
