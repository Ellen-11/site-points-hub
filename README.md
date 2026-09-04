# 站点积分台

一个自托管的站点账户看板：统一查看余额/积分、手动或定时签到、按间隔轮询，并保留最近运行记录。

同时提供一个 OpenAI 兼容网关。客户端只需配置本服务的 `/v1` 地址和 `GATEWAY_API_KEY`；客户端模型名只是统一别名，网关会按已启用轮询标签和卡片顺序选择站点，并自动替换成该站点选中的真实模型。当前站点请求失败后会继续尝试下一个，且不记录请求正文。

## 本地运行

需要 Node.js 20 或更高版本。

PowerShell：

```powershell
$env:ADMIN_PASSWORD="换成你的管理密码"
$env:APP_SECRET="换成至少32位随机字符串"
$env:GATEWAY_API_KEY="换成客户端访问网关时使用的总Key"
npm install
npm start
```

打开 `http://localhost:8080`。至少设置 `ADMIN_PASSWORD` 与随机的 `APP_SECRET`；修改 `APP_SECRET` 后，已保存凭据将无法解密。

## 接入站点

默认提供 New API / One API 多站点模板。每个站点只需填写名称、根地址、登录 Cookie 和数字用户 ID，程序会自动发送 `Cookie` 与 `New-Api-User` 请求头，读取 `/api/user/self` 的额度，并调用 `/api/user/checkin` 签到。可以重复添加任意数量的站点。

特殊站点可选择“自定义 JSON API”：填写余额接口与 JSON 字段路径、签到接口，以及 Bearer Token、Cookie 或自定义请求头凭据。例如余额响应为 `{ "data": { "points": 120 } }`，余额字段填 `data.points`。短期 Bearer 还可填写刷新接口和 `new_api_refresh` Cookie；请求遇到 401 时会自动刷新、保存轮换凭据并重试一次。

每个站点可以独立保存 API Key。点击“选择模型”后，应用从 `/v1/models` 和 `/api/pricing`（或自定义面板的 `/api/models/pricing`）拉取该 Key 可用的模型，可在按次和按量计费间切换，再按 GPT、Gemini、Claude、DeepSeek、Qwen、图像、视频和其他分类浏览价格。只有最终手动选中的一个模型会绑定到该站并进入统一网关。

仅接入你拥有或明确获授权的账户。应用只允许生产环境访问 HTTPS 公网地址，并阻止内网地址，避免被用作内网代理。

## Zeabur 部署

1. 把项目推到 GitHub，在 Zeabur 新建项目并选择该仓库。根目录的 `Dockerfile` 会被自动识别。
2. 在服务变量中设置：
   - `ADMIN_PASSWORD`：控制台登录密码
   - `APP_SECRET`：至少 32 位随机字符串
   - `GATEWAY_API_KEY`：客户端连接统一网关时使用的总 Key
   - `POLL_INTERVAL_MINUTES=30`
   - `AUTO_CHECKIN_HOUR=8`
   - `TZ=Asia/Shanghai`
3. 给服务添加持久卷，挂载路径填写 `/data`。否则重新部署后账户与历史会丢失。
4. 在 Networking / Domain 中为 Web 端口绑定 Zeabur 域名。

轮询由应用进程内的定时器完成，不依赖 Zeabur Cron。为避免重复签到，建议只运行一个副本。应用启动后的首次轮询会在一个间隔后发生，也可在界面立即手动刷新。

## 统一网关

在每个站点中填写上游 API Key，并从分类价格列表中选择一个模型后，客户端配置：

```text
Base URL: https://你的域名.zeabur.app/v1
API Key: 你设置的 GATEWAY_API_KEY
Model: xiaoju-auto（也可填写任意非空名称）
```

支持 `/v1/models`、`/v1/chat/completions`、`/v1/responses` 和 `/v1/embeddings`。只有属于已启用轮询标签、已填写上游 API Key 且已选定真实模型的站点会参与；任一上游返回非成功状态或发生网络错误时都会继续尝试下一个站点。

每次上游尝试都会写入“最近运行”，类型显示为“网关”，并记录实际模型和 HTTP 结果；不会保存请求正文或对话内容。

登录后可通过左侧“调用统计”查看真实网关数据，包括今日、本月及累计请求、成功与失败、首站命中率、自动切换次数、平均与 P95 耗时、近 7/30 天趋势，以及站点、模型、失败原因和接口排行。统计不读取或保存对话内容，也不把站点积分换算为金额。
统计页可按具体站点和真实模型筛选；站点与模型排行同时显示成功率、成功/失败次数及平均耗时。
网关会从普通 JSON 或流式响应的 `usage` 中记录输入、输出、缓存和总 Token；没有返回 `usage` 的请求仍统计次数和耗时，但不会虚构 Token 数。

左侧“运行日志”独立展示最多 500 条匹配记录，可按网关/轮询/签到、执行结果和站点筛选。

## 已知边界

- 各站 API 格式不同；需要提供真实站点的接口样例，才能制作免填字段的专用适配器。
- 某些站点 Cookie 会过期，需要重新更新。
- 当前是单管理员、单实例设计，适合个人使用。
