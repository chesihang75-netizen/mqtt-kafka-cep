# IoT Action Command Center

使用 Vue 3 + Vite 构建的实时 IoT Action 看板，可以直接对接您通过 Kafka → Siddhi → Kafka 输出的 `iot.alerts` 流。

## 功能特性

- 📡 REST + WebSocket 双通道：初始加载历史 Action，同时监听实时推送
- 🎛️ 快速筛选：按关键字、优先级、是否完成过滤
- 📊 概览卡片：实时统计当前任务量、高优先级和 24 小时内触发次数
- 🕒 时间轴视图：快速掌握最新 10 条 Action 的上下文
- 🛰️ iot.alerts 去重列表：自动汇总 Kafka `iot.alerts` 主题的唯一告警
- 🌙 夜间作战主题：深色界面更适合运维值守场景

## 快速开始

```bash
cd frontend
npm install
npm run dev
```

默认会在 `http://localhost:8090` 启动开发服务器，若端口被占用可通过环境变量 `VITE_DEV_SERVER_PORT` 覆盖。

> **注意**：如果运行环境限制访问 npm 官方源，可以将 `.npmrc` 配置为内网镜像或者使用离线包。

## 与后端对接

- REST 接口（初始加载）：`GET {BASE_URL}/api/actions`
- WebSocket 接口（实时推送）：`WS {BASE_URL}/ws/actions`

可以在根目录添加 `.env.local` 覆盖默认后端地址：

```bash
VITE_ACTION_API_BASE_URL=http://your-host:8090
```

如果尚未准备好实时接口，也可以在 `actionStore.ts` 中将 `stream.fetchInitial()` 替换为本地 mock 数据，界面仍会正常显示。

## iot.alerts 唯一告警面板

右侧新增的「iot.alerts 去重列表」会通过 Kafka UI 或自建 API 拉取 `iot.alerts` 主题，解析消息内容后按 Action 指纹去重，只保留最新的一条相同告警。

默认会尝试连接 `http://localhost:8080/api/clusters/local/topics/iot.alerts/messages`（Kafka UI 内置接口，需同源或已处理 CORS）。如需自定义可在 `.env.local` 中配置：

```bash
VITE_ALERT_API_URL=http://your-host:8080/api/clusters/local/topics/iot.alerts/messages
VITE_ALERT_FETCH_METHOD=POST               # GET/POST/PUT，默认 POST
VITE_ALERT_FETCH_LIMIT=200                 # 单次拉取的最大消息数
# 如果目标接口需要特定 JSON 请求体，可直接写入
# VITE_ALERT_FETCH_BODY='{"seekType":"BEGINNING","limit":50}'
```

> 提示：Kafka UI 的接口需要携带 Cookie 才能访问，可通过 Nginx 反向代理将前端与 Kafka UI 同域部署，或自建轻量转发服务（例如 Node/Express）以解决 CORS 与鉴权问题。
