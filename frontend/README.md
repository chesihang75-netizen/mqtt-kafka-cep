# IoT Action Command Center

使用 Vue 3 + Vite 构建的实时 IoT Action 看板，可以直接对接您通过 Kafka → Siddhi → Kafka 输出的 `iot.alerts` 流。

## 功能特性

- 📡 WebSocket 主通道：依赖 Kafka→WebSocket 桥接实时推送，REST 仅在需要时可选开启
- 🚨 连接状态提示：若桥接未启动会在页首标记离线并提供 Retry 按钮与错误详情
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

默认会在 `http://localhost:8091` 启动开发服务器，若端口被占用可通过环境变量 `VITE_DEV_SERVER_PORT` 覆盖。前端会默认尝试连接
`ws://localhost:8090/ws/actions`，请确保已启动 Kafka→WebSocket 桥（见下文）或在 `.env.local` 中指定 `VITE_ACTION_WS_BASE_URL`。若桥接暂未可用，页面顶部会显示 `Stream offline` 提示，并可点击 Retry 重新发起连接。
未显式配置 `VITE_ACTION_REST_URL` 或 `VITE_ACTION_API_BASE_URL` 时，初始化阶段不会触发额外的 HTTP 请求，可避免 `Failed to fetch` 等错误刷屏。

> **注意**：如果运行环境限制访问 npm 官方源，可以将 `.npmrc` 配置为内网镜像或者使用离线包。

## 与后端对接

- WebSocket 接口（实时推送，必需）：`WS {BASE_URL}/ws/actions`
- REST 接口（历史加载，可选）：`GET {BASE_URL}/api/actions?limit=200`

### Kafka → WebSocket 桥（kafka-websocket-bridge）

仓库根目录新增的 `ws-bridge` 服务会订阅 Kafka `iot.alerts` 主题，将解析后的 JSON 通过 WebSocket 推送给前端：

```bash
docker-compose up -d kafka-websocket-bridge
```

默认配置：

- 监听端口：`8090`
- WebSocket 地址：`ws://localhost:8090/ws/actions`
- Kafka Brokers：`kafka:9093`
- 订阅主题：`iot.alerts`

该桥接同时暴露 `GET http://localhost:8090/api/actions` 接口，会返回最近缓冲的去重 Action 记录，供前端初始化列表或手动排查使用。

如需在浏览器访问其他主机或端口，可在 `frontend/.env.local` 中设置：

```bash
VITE_ACTION_WS_BASE_URL=ws://your-host:8090
VITE_ACTION_MAX_RECONNECT=6                     # 重连次数（>0 为有限次，<=0 表示持续重试）
```

若您额外提供 REST 历史接口，可设置 `VITE_ACTION_REST_URL` 或 `VITE_ACTION_API_BASE_URL` 启用初始拉取；未配置时前端仅依赖 WebSocket。
这样即使 WebSocket 桥暂未就绪，控制台也只会提示连接失败，不会额外报出 `Failed to fetch` 等 HTTP 错误。

## iot.alerts 唯一告警面板

右侧的「iot.alerts 去重列表」默认直接复用 WebSocket 流推送的 Action 并按指纹去重，只保留每类告警的最新一条。当确实需要手动回溯时，
可以在 `.env.local` 中提供 Kafka UI 或自建 API 的地址，刷新按钮会自动恢复可用：

```bash
VITE_ALERT_API_HOST=http://your-host:8080              # Kafka UI 或转发服务地址（可选）
VITE_ALERT_CLUSTER=local                               # Kafka UI 中的 cluster 名称
VITE_ALERT_TOPIC=iot.alerts                            # Siddhi 输出的 Topic 名称
VITE_ALERT_API_URL=                                    # 若上方三项已满足可留空
VITE_ALERT_FETCH_METHOD=POST               # GET/POST/PUT，默认 POST
VITE_ALERT_FETCH_LIMIT=200                 # 单次拉取的最大消息数
# 如果目标接口需要特定 JSON 请求体，可直接写入
# VITE_ALERT_FETCH_BODY='{"seekType":"BEGINNING","limit":50}'
```

未配置上述变量时，去重面板会提示当前采用纯 WebSocket 实时模式，不会再访问 Kafka UI REST API。
