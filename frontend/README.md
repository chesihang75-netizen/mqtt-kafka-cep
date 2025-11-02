# IoT Facilities Command Center (Vue 3)

This module provides a Vite-powered Vue 3 dashboard for observing classroom automation rules, Kafka alert
messages, and raw sensor telemetry. It was designed to mirror the `iot.alerts` and `iot.input` topics produced by
the Siddhi pipeline in this repository.

## Features

- Action feed that renders messages produced on the `iot.alerts` topic. Each message shows the room, rule, and
the resulting changes applied to the classroom actuators.
- Sensor telemetry grid that surfaces CO₂, temperature, motion, and lux readings for classrooms **CR-101** through
  **CR-105** based on `iot.input` messages.
- Room status overview that keeps lights, door state, HVAC mode, and setpoint in sync with the most recent
  automation action.
- Built-in simulator that produces realistic alerts and sensor readings when a live bridge to Kafka is not
  available. The simulator evaluates the same 15 automation rules end-to-end so the `iot.input` telemetry that
  triggers an alert is always mirrored in the resulting `iot.alerts` message. After-hours rules honour the real
  clock (no 18:00 triggers at 16:00), while **R05** still ramps the lights down and temperature rules adjust
  setpoints as specified.
- Optional Kafka bridge server that streams `iot.alerts` and `iot.input` topics to the browser over Server-Sent
  Events (SSE). The UI automatically falls back to the simulator when the bridge is offline.

## Getting started

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5174
```

> ℹ️ Port **8080** is intentionally avoided because it is already used by Kafka UI. The Vite dev server defaults to
> port **5174** but you can override it with the `VITE_DEV_SERVER_PORT` environment variable if needed.

### Production build

```bash
npm run build
npm run preview -- --host 0.0.0.0 --port 5174
```

## Streaming live Kafka topics into the UI

Run the lightweight Node bridge to translate Kafka topics into browser-friendly SSE streams:

```bash
# From the frontend/ directory
npm run kafka-bridge
```

Configuration is controlled by environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `KAFKA_BROKERS` | `localhost:9092` | Comma-separated list of Kafka bootstrap servers. |
| `KAFKA_ALERT_TOPIC` | `iot.alerts` | Topic consumed for automation actions. |
| `KAFKA_SENSOR_TOPIC` | `iot.input` | Topic consumed for raw telemetry. |
| `KAFKA_BRIDGE_PORT` | `5175` | HTTP port exposed by the bridge. |
| `CORS_ORIGIN` | `*` | Optional comma-separated list of allowed origins for the SSE endpoints. |

When the bridge is running, point the Vue app to it via `.env` or inline environment variables before starting Vite:

```bash
# Example .env.local
VITE_KAFKA_BRIDGE_BASE_URL=http://localhost:5175
# Optional: disable the simulator entirely instead of auto-fallback
VITE_ENABLE_SIMULATION=never
```

Two additional overrides are available if the alerts and sensor streams live on different hosts:

- `VITE_ALERTS_STREAM_URL`
- `VITE_SENSORS_STREAM_URL`

If no URLs are configured, or the bridge becomes unavailable, the dashboard falls back to the built-in simulator.
Set `VITE_ENABLE_SIMULATION=always` to force the simulator on, or `never` to ensure only real Kafka data is used.
Use `VITE_SIM_TIME_SCALE` (default `1`) to speed up the simulator clock when you want to test long-duration rules
such as the 10-minute no-motion checks—e.g. `VITE_SIM_TIME_SCALE=6` makes one real minute behave like six simulated
minutes while still respecting the 18:00 cut-off for after-hours automation.

## File structure

```
frontend/
├── index.html
├── package.json
├── src/
│   ├── App.vue
│   ├── main.js
│   ├── style.css
│   ├── components/
│   │   ├── ActionList.vue
│   │   ├── RoomStatusPanel.vue
│   │   ├── RuleCatalogue.vue
│   │   └── SensorGrid.vue
│   ├── composables/
│   │   └── useDashboard.js
│   └── services/
│       ├── ruleEngine.js
│       ├── rules.js
│       ├── kafkaBridge.js
│       └── simulation.js
├── server/
│   └── kafkaBridgeServer.js
└── vite.config.js
```

The UI is fully written in English per the requirements.
