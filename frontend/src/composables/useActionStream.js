import { ref } from 'vue';

const buildWsUrl = (baseUrl) => {
  try {
    const normalized = baseUrl || '';
    const wsBase = normalized.startsWith('http')
      ? normalized.replace(/^http/, 'ws')
      : `ws://${normalized.replace(/^ws?:\/\//, '')}`;
    const url = new URL(wsBase);
    url.pathname = url.pathname.replace(/\/$/, '') + '/ws/actions';
    return url.toString();
  } catch (error) {
    console.warn('无法解析 WebSocket 地址，使用默认值 ws://localhost:8090/ws/actions', error);
    return 'ws://localhost:8090/ws/actions';
  }
};

const buildRestUrl = (baseUrl) => {
  try {
    const normalized = baseUrl || '';
    const httpBase = normalized.startsWith('http')
      ? normalized
      : `http://${normalized.replace(/^ws?:\/\//, '')}`;
    const url = new URL(httpBase);
    url.pathname = url.pathname.replace(/\/$/, '') + '/api/actions';
    return url.toString();
  } catch (error) {
    console.warn('无法解析 API 地址，使用默认值 http://localhost:8090/api/actions', error);
    return 'http://localhost:8090/api/actions';
  }
};

export const useActionStream = () => {
  const loading = ref(false);
  const error = ref(null);
  const socket = ref(null);
  const reconnectAttempts = ref(0);
  let reconnectTimer = null;

  const fallbackBaseUrl =
    import.meta.env.VITE_ACTION_API_BASE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8090');
  const baseUrl = fallbackBaseUrl || 'http://localhost:8090';
  const restUrl = buildRestUrl(baseUrl);
  const wsUrl = buildWsUrl(baseUrl);

  const clearReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = (onMessage) => {
    clearReconnect();
    const timeout = Math.min(30000, 1000 * 2 ** reconnectAttempts.value);
    reconnectTimer = setTimeout(() => {
      connect(onMessage);
    }, timeout);
  };

  const fetchInitial = async () => {
    loading.value = true;
    try {
      const response = await fetch(restUrl, {
        headers: {
          Accept: 'application/json, text/plain, */*',
        },
      });
      if (!response.ok) {
        throw new Error(`加载 Action 列表失败: ${response.status}`);
      }
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        if (!text) {
          loading.value = false;
          return [];
        }
        throw new Error(
          `Action API 返回非 JSON 响应（content-type: ${contentType || 'unknown'}）`
        );
      }
      const payload = await response.json();
      loading.value = false;
      return payload;
    } catch (err) {
      error.value = err;
      loading.value = false;
      console.error('加载 Action 列表失败', err);
      return [];
    }
  };

  const connect = (onMessage) => {
    clearReconnect();

    if (socket.value) {
      socket.value.close();
    }

    try {
      socket.value = new WebSocket(wsUrl);
    } catch (err) {
      error.value = err;
      scheduleReconnect(onMessage);
      console.error('创建 WebSocket 失败', err);
      return;
    }

    socket.value.onopen = () => {
      reconnectAttempts.value = 0;
      error.value = null;
    };

    socket.value.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        onMessage(payload);
      } catch (err) {
        console.error('解析 WebSocket 消息失败', err);
      }
    };

    socket.value.onerror = (event) => {
      console.error('WebSocket 错误', event);
      error.value = new Error('WebSocket 连接发生错误');
    };

    socket.value.onclose = () => {
      reconnectAttempts.value += 1;
      scheduleReconnect(onMessage);
    };
  };

  const close = () => {
    clearReconnect();
    if (socket.value) {
      socket.value.close();
      socket.value = null;
    }
  };

  return {
    loading,
    error,
    fetchInitial,
    connect,
    close,
  };
};
