export default function createKafkaBridge(opts = {}) {
  const callbacks = {
    onAlert: typeof opts.onAlert === 'function' ? opts.onAlert : () => {},
    onSensor: typeof opts.onSensor === 'function' ? opts.onSensor : () => {},
    onStatusChange:
      typeof opts.onStatusChange === 'function' ? opts.onStatusChange : () => {},
  };

  let alertsES = null;
  let sensorsES = null;

  // ------- url 解析：优先显式覆盖，其次用 .env -------
  function buildUrls() {
    // 允许通过 VITE_ALERTS_STREAM_URL / VITE_SENSORS_STREAM_URL 覆盖
    const alertsUrlEnv = import.meta.env.VITE_ALERTS_STREAM_URL;
    const sensorsUrlEnv = import.meta.env.VITE_SENSORS_STREAM_URL;

    // 否则走 base
    const baseRaw = import.meta.env.VITE_KAFKA_BRIDGE_BASE_URL || '';
    const base = String(baseRaw).replace(/\/$/, '');

    const alertsUrl = alertsUrlEnv || (base ? `${base}/stream/alerts` : '/stream/alerts');
    const sensorsUrl = sensorsUrlEnv || (base ? `${base}/stream/input`  : '/stream/input');

    return { alertsUrl, sensorsUrl, hasBase: Boolean(base || alertsUrlEnv || sensorsUrlEnv) };
  }

  // ------- 连接/关闭 -------
  function close(es) {
    try { es?.close(); } catch {}
  }

  function start() {
    const { alertsUrl, sensorsUrl, hasBase } = buildUrls();

    // 如果完全没有配置（既没 base 也没覆盖），返回 false 让 useDashboard 走模拟
    if (!hasBase) return false;

    // 避免重复连接
    stop();

    // 对外可见：方便你在控制台检查 urls
    api.urls = { alerts: alertsUrl, sensors: sensorsUrl };
    // 也挂到全局便于排查
    window.__bridge = api;

    // alerts
    alertsES = new EventSource(alertsUrl);
    alertsES.onopen = () => callbacks.onStatusChange('alerts', true);
    alertsES.onerror = () => callbacks.onStatusChange('alerts', false);
    alertsES.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        // 直接把 Siddhi/bridge 的 alerts 透传给 UI
        callbacks.onAlert(msg);
      } catch {
        // 忽略非 JSON
      }
    };

    // sensors
    sensorsES = new EventSource(sensorsUrl);
    sensorsES.onopen = () => callbacks.onStatusChange('sensors', true);
    sensorsES.onerror = () => callbacks.onStatusChange('sensors', false);
    sensorsES.onmessage = (e) => {
      try {
        const raw = JSON.parse(e.data);
        // 映射为 UI 期望的字段名（temperature / timestamp 等）
        // 允许同时兼容不同后端字段（temp/temperature, ts/timestamp）
        const mapped = {
          ...raw,
          temperature:
            typeof raw.temperature === 'number'
              ? raw.temperature
              : typeof raw.temp === 'number'
              ? raw.temp
              : undefined,
          timestamp: raw.timestamp || raw.ts || undefined,
        };
        callbacks.onSensor(mapped);
      } catch {
        // 忽略非 JSON
      }
    };

    return true;
  }

  function stop() {
    close(alertsES);
    close(sensorsES);
    alertsES = sensorsES = null;
    callbacks.onStatusChange('alerts', false);
    callbacks.onStatusChange('sensors', false);
  }

  const api = { start, stop, urls: { alerts: '', sensors: '' } };
  return api;
}
