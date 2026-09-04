# 站点积分台

一个自托管的站点账户看板：统一查看余额/积分、手动或定时签到、按间隔轮询，并保留最近运行记录。

## 本地运行

需要 Node.js 20 或更高版本。

PowerShell：

```powershell
$env:ADMIN_PASSWORD="换成你的管理密码"
$env:APP_SECRET="换成至少32位随机字符串"
npm install
npm start
```

打开 `http://localhost:8080`。至少设置 `ADMIN_PASSWORD` 与随机的 `APP_SECRET`；修改 `APP_SECRET` 后，已保存凭据将无法解密。

## 接入站点

默认提供 New API / One API 多站点模板。每个站点只需填写名称、根地址、登录 Cookie 和数字用户 ID，程序会自动发送 `Cookie` 与 `New-Api-User` 请求头，读取 `/api/user/self` 的额度，并调用 `/api/user/checkin` 签到。可以重复添加任意数量的站点。

特殊站点可选择“自定义 JSON API”：填写余额接口与 JSON 字段路径、签到接口，以及 Bearer Token、Cookie 或自定义请求头凭据。例如余额响应为 `{ "data": { "points": 120 } }`，余额字段填 `data.points`。

仅接入你拥有或明确获授权的账户。应用只允许生产环境访问 HTTPS 公网地址，并阻止内网地址，避免被用作内网代理。

## Zeabur 部署

1. 把项目推到 GitHub，在 Zeabur 新建项目并选择该仓库。根目录的 `Dockerfile` 会被自动识别。
2. 在服务变量中设置：
   - `ADMIN_PASSWORD`：控制台登录密码
   - `APP_SECRET`：至少 32 位随机字符串
   - `POLL_INTERVAL_MINUTES=30`
   - `AUTO_CHECKIN_HOUR=8`
   - `TZ=Asia/Shanghai`
3. 给服务添加持久卷，挂载路径填写 `/data`。否则重新部署后账户与历史会丢失。
4. 在 Networking / Domain 中为 Web 端口绑定 Zeabur 域名。

轮询由应用进程内的定时器完成，不依赖 Zeabur Cron。为避免重复签到，建议只运行一个副本。应用启动后的首次轮询会在一个间隔后发生，也可在界面立即手动刷新。

## 已知边界

- 各站 API 格式不同；需要提供真实站点的接口样例，才能制作免填字段的专用适配器。
- 某些站点 Cookie 会过期，需要重新更新。
- 当前是单管理员、单实例设计，适合个人使用。
