import { ref } from 'vue';

const buildWsUrl = (baseUrl) => {
  try {
    const normalized = baseUrl || '';
    const wsBase = normalized.startsWith('http')
      ? normalized.replace(/^http/, 'ws')
      : normalized.startsWith('ws')
      ? normalized
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
    console.warn('无法解析 API 地址，已禁用 REST 初始加载', error);
    return null;
  }
};

export const useActionStream = () => {
  const loading = ref(false);
  const error = ref(null);
  const socket = ref(null);
  const connected = ref(false);
  const reconnectAttempts = ref(0);
  const parsedMaxReconnect = Number.parseInt(
    import.meta.env.VITE_ACTION_MAX_RECONNECT ?? '8',
    10
  );
  const maxReconnectAttempts = Number.isFinite(parsedMaxReconnect)
    ? parsedMaxReconnect
    : 8;

  let reconnectTimer = null;
  let lastHandler = null;
  const ignoredSockets = new WeakSet();

  const resolveDefaultWsBase = () => {
    if (typeof window === 'undefined') {
      return 'ws://localhost:8090';
    }
    const { protocol, hostname, port } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return port && port !== '8090'
        ? `${protocol === 'https:' ? 'wss' : 'ws'}://localhost:8090`
        : window.location.origin;
    }
    return window.location.origin;
  };

  const wsBase =
    (import.meta.env.VITE_ACTION_WS_BASE_URL || import.meta.env.VITE_ACTION_API_BASE_URL || '').trim() ||
    resolveDefaultWsBase();
  const restBase =
    (import.meta.env.VITE_ACTION_REST_URL || import.meta.env.VITE_ACTION_API_BASE_URL || '').trim();

  const wsUrl = buildWsUrl(wsBase);
  const restUrl = restBase ? buildRestUrl(restBase) : null;

  const clearReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    clearReconnect();
    if (
      maxReconnectAttempts > 0 &&
      reconnectAttempts.value >= maxReconnectAttempts &&
      lastHandler
    ) {
      error.value = new Error(
        `无法连接到 WebSocket (${wsUrl})，请确认 kafka-websocket-bridge 服务已运行并监听对应端口。`
      );
      return;
    }

    if (!lastHandler) {
      return;
    }

    const timeout = Math.min(30000, 1000 * 2 ** reconnectAttempts.value);
    reconnectTimer = setTimeout(() => {
      connect();
    }, timeout);
  };

  const fetchInitial = async () => {
    if (!restUrl) {
      loading.value = false;
      error.value = null;
      return [];
    }

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
      const hint = restUrl
        ? `加载 Action 列表失败：无法访问 ${restUrl}。`
        : '加载 Action 列表失败。';
      error.value = new Error(hint);
      loading.value = false;
      console.error('加载 Action 列表失败', err);
      return [];
    }
  };

  const connect = (onMessage) => {
    clearReconnect();

    const handler = typeof onMessage === 'function' ? onMessage : lastHandler;
    if (typeof handler !== 'function') {
      console.warn('缺少 WebSocket 消息处理器，已跳过连接。');
      return;
    }

    lastHandler = handler;
    connected.value = false;

    if (socket.value) {
      ignoredSockets.add(socket.value);
      try {
        socket.value.close();
      } catch (closeError) {
        console.warn('关闭旧 WebSocket 连接失败', closeError);
      }
      socket.value = null;
    }

    try {
      socket.value = new WebSocket(wsUrl);
    } catch (err) {
      const reason = err?.message ? `：${err.message}` : '';
      error.value = new Error(`创建 WebSocket 失败${reason}。请确认 ${wsUrl} 可访问。`);
      reconnectAttempts.value += 1;
      scheduleReconnect();
      console.error('创建 WebSocket 失败', err);
      return;
    }

    const activeSocket = socket.value;

    activeSocket.onopen = () => {
      reconnectAttempts.value = 0;
      error.value = null;
      connected.value = true;
    };

    activeSocket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handler(payload);
      } catch (err) {
        console.error('解析 WebSocket 消息失败', err);
      }
    };

    activeSocket.onerror = (event) => {
      console.error('WebSocket 错误', event);
      connected.value = false;
      error.value = new Error(
        `WebSocket 连接发生错误：无法访问 ${wsUrl}。请检查网络或 kafka-websocket-bridge 服务。`
      );
    };

    activeSocket.onclose = () => {
      if (ignoredSockets.has(activeSocket)) {
        ignoredSockets.delete(activeSocket);
        return;
      }

      connected.value = false;
      if (socket.value === activeSocket) {
        socket.value = null;
      }
      reconnectAttempts.value += 1;
      scheduleReconnect();
    };
  };

  const close = () => {
    clearReconnect();
    if (socket.value) {
      ignoredSockets.add(socket.value);
      try {
        socket.value.close();
      } catch (err) {
        console.warn('关闭 WebSocket 失败', err);
      }
      socket.value = null;
    }
    connected.value = false;
  };

  return {
    loading,
    error,
    connected,
    reconnectAttempts,
    maxReconnectAttempts,
    fetchInitial,
    connect,
    close,
    forceReconnect: () => {
      reconnectAttempts.value = 0;
      error.value = null;
      connect();
    },
  };
};
