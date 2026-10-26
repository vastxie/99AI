// 最小 Socket.IO v5 / Engine.IO v4 客户端，只用 Node 24 自带的 WebSocket，供冒烟测试走真实的 Web 实时通道。
// 只实现 websocket 传输、单命名空间、事件收发与 ack；不做重连、不做二进制包。
// 连接超时、出错、CONNECT 被拒或命名空间断开时都会关闭底层连接并拒绝待决 ack，避免挂到 job 超时。

export class MiniSocketIo {
  constructor(
    baseUrl,
    { path = '/socket.io', namespace = '/', auth, WebSocketImpl = globalThis.WebSocket } = {},
  ) {
    const url = new URL(baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = `${path.replace(/\/$/, '')}/`;
    url.search = new URLSearchParams({ EIO: '4', transport: 'websocket' }).toString();
    this.url = url.toString();
    this.namespace = namespace;
    this.auth = auth;
    this.WebSocketImpl = WebSocketImpl;
    this.listeners = new Map();
    this.pendingAcks = new Map();
    this.nextAckId = 1;
    this.transportClosed = false;
    this.namespaceConnected = false;
  }

  nsPrefix() {
    return this.namespace === '/' ? '' : `${this.namespace},`;
  }

  connect(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          this.closeTransport(error);
          reject(error);
        } else {
          resolve(value);
        }
      };
      const timer = setTimeout(() => settle(new Error(`socket 连接超时：${this.url}`)), timeoutMs);
      this.handshake = settle;
      const ws = new this.WebSocketImpl(this.url);
      this.ws = ws;
      ws.addEventListener('error', (event) =>
        settle(new Error(`socket 错误：${event?.message || 'unknown'}`)),
      );
      ws.addEventListener('close', () => {
        this.transportClosed = true;
        this.namespaceConnected = false;
        this.rejectPending(new Error('socket 已关闭'));
        settle(new Error('socket 在连接完成前关闭'));
      });
      ws.addEventListener('message', (event) => {
        const data =
          typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8');
        this.handlePacket(data);
      });
    });
  }

  handlePacket(packet) {
    const engineType = packet[0];
    if (engineType === '0') {
      // Engine.IO OPEN：连接命名空间，token 放在 CONNECT 包的 auth 里（服务端读 handshake.auth.token）
      this.send(`40${this.nsPrefix()}${this.auth ? JSON.stringify(this.auth) : ''}`);
      return;
    }
    if (engineType === '2') {
      this.send('3');
      return;
    }
    if (engineType === '1') {
      this.closeTransport(new Error('服务端关闭了连接'));
      return;
    }
    if (engineType !== '4') return;
    const socketType = packet[1];
    let rest = packet.slice(2);
    if (rest.startsWith('/')) rest = rest.slice(rest.indexOf(',') + 1);
    if (socketType === '0') {
      this.namespaceConnected = true;
      this.handshake?.(null, rest ? JSON.parse(rest) : {});
      return;
    }
    if (socketType === '4') {
      this.handshake?.(new Error(`socket connect_error：${rest}`));
      return;
    }
    if (socketType === '1') {
      // 命名空间 DISCONNECT：底层连接可能仍存活，这里主动关闭，避免调用方等到超时
      this.namespaceConnected = false;
      this.closeTransport(new Error('服务端断开了命名空间连接'));
      return;
    }
    const match = /^(\d*)([\s\S]*)$/.exec(rest);
    const ackId = match[1] ? Number(match[1]) : undefined;
    const payload = match[2] ? JSON.parse(match[2]) : [];
    if (socketType === '2') {
      const [event, ...args] = payload;
      for (const handler of this.listeners.get(event) || []) handler(...args);
      return;
    }
    if (socketType === '3' && ackId !== undefined) {
      const pending = this.pendingAcks.get(ackId);
      if (!pending) return;
      this.pendingAcks.delete(ackId);
      clearTimeout(pending.timer);
      pending.resolve(payload);
    }
  }

  send(packet) {
    if (!this.transportClosed) this.ws?.send(packet);
  }

  rejectPending(error) {
    for (const pending of this.pendingAcks.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingAcks.clear();
  }

  closeTransport(error = new Error('socket 已关闭')) {
    this.rejectPending(error);
    if (this.transportClosed) return;
    this.transportClosed = true;
    this.namespaceConnected = false;
    try {
      this.ws?.close();
    } catch {
      // 连接已断开
    }
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  /** 发送带 ack 的事件，返回 ack 参数数组 */
  emitWithAck(event, args = [], timeoutMs = 30000) {
    if (this.transportClosed || !this.namespaceConnected) {
      return Promise.reject(new Error(`socket 未连接，无法发送 ${event}`));
    }
    const id = this.nextAckId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAcks.delete(id);
        reject(new Error(`等待 ${event} 的 ack 超时`));
      }, timeoutMs);
      this.pendingAcks.set(id, { resolve, reject, timer });
      this.send(`42${this.nsPrefix()}${id}${JSON.stringify([event, ...args])}`);
    });
  }

  close() {
    if (this.namespaceConnected) this.send(`41${this.nsPrefix()}`);
    this.closeTransport();
  }
}
