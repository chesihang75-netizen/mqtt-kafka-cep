import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import dayjs from 'dayjs';
import { useActionStream } from '../composables/useActionStream';
import { useAlertStore } from './alertStore';
import { buildFingerprint } from '../utils/fingerprint';

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const useActionStore = defineStore('actions', () => {
  const actions = ref([]);
  const loading = ref(false);
  const lastUpdated = ref(null);
  const stream = useActionStream();
  let alertStore;
  let streamHandler;

  const normalizeAction = (item) => ({
    id: item.id || createId(),
    fingerprint: buildFingerprint(item),
    action: item.action || item.msg || '未命名 Action',
    description: item.description || item.reason || item.message || '',
    severity: item.severity || item.priority || 'medium',
    timestamp: item.timestamp || item.eventTime || new Date().toISOString(),
    owner: item.owner || item.assignee || '',
    acknowledged: Boolean(item.acknowledged ?? item.completed ?? false),
    source: item.source || item.ruleId || item.sensor || '未知来源',
    metadata: item.metadata || item,
  });

  const upsertAction = (payload) => {
    const next = normalizeAction(payload);
    const index = actions.value.findIndex(
      (item) => item.id === next.id || (next.fingerprint && item.fingerprint === next.fingerprint)
    );
    if (index >= 0) {
      actions.value.splice(index, 1, next);
    } else {
      actions.value.unshift(next);
    }
    lastUpdated.value = new Date();

    if (!alertStore) {
      try {
        alertStore = useAlertStore();
      } catch (err) {
        console.warn('初始化 alertStore 失败，将跳过同步 iot.alerts 去重面板', err);
      }
    }

    alertStore?.ingest?.(payload);
  };

  const toggleAcknowledged = (id) => {
    const index = actions.value.findIndex((item) => item.id === id);
    if (index === -1) return;
    const target = actions.value[index];
    actions.value.splice(index, 1, {
      ...target,
      acknowledged: !target.acknowledged,
    });
  };

  const init = async () => {
    if (loading.value || actions.value.length > 0) {
      return;
    }

    loading.value = true;
    const initial = await stream.fetchInitial();
    actions.value = Array.isArray(initial) ? initial.map(normalizeAction) : [];
    loading.value = false;
    lastUpdated.value = new Date();

    streamHandler = (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(upsertAction);
      } else {
        upsertAction(payload);
      }
    };

    stream.connect(streamHandler);
  };

  const buildSummary = () => {
    const today = dayjs();
    const total = actions.value.length;
    const acknowledged = actions.value.filter((item) => item.acknowledged).length;
    const active = total - acknowledged;
    const critical = actions.value.filter((item) => (item.severity || '').toLowerCase() === 'critical').length;
    const todayCount = actions.value.filter((item) =>
      dayjs(item.timestamp).isAfter(today.startOf('day'))
    ).length;

    return {
      total,
      acknowledged,
      active,
      critical,
      today: todayCount,
    };
  };

  return {
    actions,
    loading,
    lastUpdated,
    init,
    buildSummary,
    toggleAcknowledged,
    streamConnected: computed(() => stream.connected.value),
    streamError: computed(() => stream.error.value),
    reconnectAttempts: computed(() => stream.reconnectAttempts.value),
    maxReconnectAttempts: computed(() => stream.maxReconnectAttempts),
    retryStream: () => {
      if (streamHandler) {
        stream.forceReconnect();
      } else {
        init();
      }
    },
  };
});
