import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { buildFingerprint } from '../utils/fingerprint';

const RAW_ALERT_URL = (import.meta.env.VITE_ALERT_API_URL || '').trim();
const DEFAULT_TOPIC = (import.meta.env.VITE_ALERT_TOPIC || 'iot.alerts').trim();
const DEFAULT_CLUSTER = (import.meta.env.VITE_ALERT_CLUSTER || 'local').trim();
const DEFAULT_HOST = (import.meta.env.VITE_ALERT_API_HOST || '').trim();

let DEFAULT_ENDPOINT = '';
if (RAW_ALERT_URL) {
  DEFAULT_ENDPOINT = RAW_ALERT_URL;
} else if (DEFAULT_HOST) {
  DEFAULT_ENDPOINT = `${DEFAULT_HOST.replace(/\/$/, '')}/api/clusters/${DEFAULT_CLUSTER}/topics/${DEFAULT_TOPIC}/messages`;
}
const DEFAULT_LIMIT = Number(import.meta.env.VITE_ALERT_FETCH_LIMIT || 200);
const DEFAULT_METHOD = (import.meta.env.VITE_ALERT_FETCH_METHOD || 'POST').toUpperCase();

const parseKafkaMessage = (message) => {
  if (!message) return null;
  const payload = message.value ?? message.content ?? message;

  if (payload == null) {
    return null;
  }

  const unwrap = (value) => {
    if (value == null) return null;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (err) {
        return { message: value };
      }
    }
    if (typeof value === 'object') {
      if (value.payload) {
        return unwrap(value.payload);
      }
      if (value.data) {
        return unwrap(value.data);
      }
      if (value.value) {
        return unwrap(value.value);
      }
      return value;
    }
    return { message: value };
  };

  const content = unwrap(payload);
  if (!content) return null;

  return {
    raw: content,
    timestamp:
      content.timestamp || content.eventTime || message.timestamp || new Date().toISOString(),
    source: content.source || content.ruleId || content.sensor || message.topic || 'iot.alerts',
  };
};

const normalizeAlert = (message) => {
  const parsed = parseKafkaMessage(message);
  if (!parsed) return null;

  const { raw, timestamp, source } = parsed;
  const fingerprint = buildFingerprint(raw);

  return {
    fingerprint,
    action: raw.action || raw.msg || raw.message || '未命名 Action',
    description: raw.description || raw.reason || raw.detail || '',
    severity: raw.severity || raw.priority || 'medium',
    timestamp,
    source,
    raw,
    offset: message.offset ?? message.sequence ?? Date.now(),
  };
};

const buildRequestInit = () => {
  const method = DEFAULT_METHOD;
  const headers = {};
  let body;

  if (method === 'POST' || method === 'PUT') {
    headers['Content-Type'] = 'application/json';
    if (import.meta.env.VITE_ALERT_FETCH_BODY) {
      try {
        body = JSON.stringify(JSON.parse(import.meta.env.VITE_ALERT_FETCH_BODY));
      } catch (err) {
        console.warn('VITE_ALERT_FETCH_BODY 不是有效的 JSON，改为原样发送字符串');
        body = import.meta.env.VITE_ALERT_FETCH_BODY;
      }
    } else {
      body = JSON.stringify({
        seekType: 'BEGINNING',
        limit: DEFAULT_LIMIT,
      });
    }
  }

  return {
    method,
    headers,
    body,
  };
};

export const useAlertStore = defineStore('alertStream', () => {
  const itemsMap = ref(new Map());
  const loading = ref(false);
  const error = ref(null);
  const lastFetched = ref(null);
  const endpoint = DEFAULT_ENDPOINT;

  const alerts = computed(() =>
    Array.from(itemsMap.value.values()).sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  );

  const ingest = (payload) => {
    const normalized = normalizeAlert(payload);
    if (!normalized || !normalized.fingerprint) return;
    itemsMap.value.set(normalized.fingerprint, normalized);
    lastFetched.value = new Date();
  };

  const fetchAlerts = async () => {
    if (!endpoint) {
      console.info('未配置 iot.alerts 拉取地址，将仅依赖实时 WebSocket 数据');
      error.value = null;
      loading.value = false;
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const response = await fetch(endpoint, buildRequestInit());
      if (!response.ok) {
        throw new Error(`获取 iot.alerts 消息失败：${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const payload = await response.json();
        if (Array.isArray(payload)) {
          payload.forEach(ingest);
        } else if (payload?.data && Array.isArray(payload.data)) {
          payload.data.forEach(ingest);
        } else {
          ingest(payload);
        }
      } else {
        const text = await response.text();
        text
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach((line) => {
            try {
              ingest(JSON.parse(line));
            } catch (err) {
              console.warn('无法解析的 iot.alerts 行数据', line);
            }
          });
      }
    } catch (err) {
      console.error('加载 iot.alerts 消息失败', err);
      if (err instanceof SyntaxError) {
        error.value = new Error('i/o 响应不是合法 JSON，请确认 Kafka UI API 是否可访问');
      } else {
        error.value = err;
      }
    } finally {
      loading.value = false;
    }
  };

  const reset = () => {
    itemsMap.value.clear();
    error.value = null;
    lastFetched.value = null;
  };

  return {
    alerts,
    loading,
    error,
    lastFetched,
    canRefresh: computed(() => Boolean(endpoint)),
    fetchAlerts,
    ingest,
    reset,
  };
});
