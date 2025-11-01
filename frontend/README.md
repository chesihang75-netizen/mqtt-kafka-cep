# IoT Action Command Center

使用 Vue 3 + Vite 构建的实时 IoT Action 看板，可以直接对接您通过 Kafka → Siddhi → Kafka 输出的 `iot.alert` 流。

## 功能特性

- 📡 REST + WebSocket 双通道：初始加载历史 Action，同时监听实时推送
- 🎛️ 快速筛选：按关键字、优先级、是否完成过滤
- 📊 概览卡片：实时统计当前任务量、高优先级和 24 小时内触发次数
- 🕒 时间轴视图：快速掌握最新 10 条 Action 的上下文
- 🌙 夜间作战主题：深色界面更适合运维值守场景

## 快速开始

```bash
cd frontend
npm install
npm run dev
```

默认会在 `http://localhost:5173` 启动开发服务器。

> **注意**：如果运行环境限制访问 npm 官方源，可以将 `.npmrc` 配置为内网镜像或者使用离线包。

## 与后端对接

- REST 接口（初始加载）：`GET {BASE_URL}/api/actions`
- WebSocket 接口（实时推送）：`WS {BASE_URL}/ws/actions`

可以在根目录添加 `.env.local` 覆盖默认后端地址：

```bash
VITE_ACTION_API_BASE_URL=http://your-host:8080
```

如果尚未准备好实时接口，也可以在 `actionStore.ts` 中将 `stream.fetchInitial()` 替换为本地 mock 数据，界面仍会正常显示。
