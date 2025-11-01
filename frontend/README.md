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
  available. The simulator automatically applies the 15 rules requested in the specification, including the
  dimming behaviour for rule **R05** and temperature adjustments for rules **R11–R12**.

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

## Integrating with live Kafka data

The dashboard exposes two hook functions inside `src/composables/useDashboard.js`:

- `handleSensorMessage(message)` expects payloads shaped like the JSON sent to `iot.input`.
- `handleAlertMessage(message)` expects alert events that include `roomId`, `ruleId`, `ruleName`, `summary`, and a
  `changes` object describing the actuator updates.

To replace the built-in simulator with a real-time bridge, import your preferred Kafka consumer, call the handler
functions with parsed messages, and remove the simulator initialisation inside the composable.

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
│       └── simulation.js
└── vite.config.js
```

The UI is fully written in English per the requirements.
