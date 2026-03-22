import { nowMs, wasmArray } from './utils.js';

const P2P_CHANNEL_NAME = 'demacia-rise-p2p';
const P2P_STORAGE_KEY = '__demacia_rise_p2p_bus__';
const MAX_SEEN_P2P_MESSAGES = 200;

export function createP2PSync({ state, nodeTtl, getStrategies, receiveJson, receiveHistoryJson, onCommunityChanged, onSearchChanged, onDashboardChanged }) {
  function markPeerSeen(nodeId, meta = {}) {
    if (!nodeId || nodeId === state.nodeId) return;
    state.knownNodes.set(nodeId, { ...state.knownNodes.get(nodeId), ...meta, lastSeen: nowMs() });
  }

  function rememberP2PMessage(messageId) {
    if (!messageId || state.seenP2PMessages.has(messageId)) return false;
    state.seenP2PMessages.add(messageId);
    if (state.seenP2PMessages.size > MAX_SEEN_P2P_MESSAGES) {
      const firstKey = state.seenP2PMessages.values().next().value;
      if (firstKey) state.seenP2PMessages.delete(firstKey);
    }
    return true;
  }

  function receiveStrategyPayload(json, sourceNodeId) {
    if (sourceNodeId && sourceNodeId !== state.nodeId) {
      markPeerSeen(sourceNodeId, { transport: 'browser-local' });
      receiveJson(json);
      onCommunityChanged?.();
      onSearchChanged?.();
      onDashboardChanged?.();
    }
  }

  function sendHistoryToNode(targetNodeId) {
    if (!targetNodeId || targetNodeId === state.nodeId) return;
    const strategies = wasmArray(getStrategies());
    if (!strategies.length) return;
    broadcastEnvelope('history_response', JSON.stringify(strategies), { targetNodeId });
  }

  function importHistoryPayload(payload, sourceNodeId) {
    if (!payload || sourceNodeId === state.nodeId) return;
    markPeerSeen(sourceNodeId, { transport: 'browser-local' });
    receiveHistoryJson(payload);
    onCommunityChanged?.();
    onSearchChanged?.();
    onDashboardChanged?.();
  }

  function handleEnvelope(envelope) {
    if (!envelope || envelope.sourceNodeId === state.nodeId) return;
    if (envelope.targetNodeId && envelope.targetNodeId !== state.nodeId) return;
    if (envelope.messageId && !rememberP2PMessage(envelope.messageId)) return;

    if (envelope.type === 'heartbeat') {
      markPeerSeen(envelope.sourceNodeId, { transport: envelope.transport || 'browser-local' });
      onDashboardChanged?.();
      return;
    }

    if (envelope.type === 'history_request') {
      markPeerSeen(envelope.sourceNodeId, { transport: envelope.transport || 'browser-local' });
      sendHistoryToNode(envelope.sourceNodeId);
      onDashboardChanged?.();
      return;
    }

    if (envelope.type === 'history_response' && typeof envelope.payload === 'string') {
      importHistoryPayload(envelope.payload, envelope.sourceNodeId);
      return;
    }

    if (envelope.type === 'strategy' && typeof envelope.payload === 'string') {
      receiveStrategyPayload(envelope.payload, envelope.sourceNodeId);
    }
  }

  function broadcastEnvelope(type, payload = null, extra = {}) {
    const envelope = {
      type,
      payload,
      sourceNodeId: state.nodeId,
      transport: state.p2pChannel ? 'broadcast-channel' : 'storage-event',
      messageId: `${state.nodeId}:${type}:${nowMs()}:${Math.random().toString(36).slice(2, 8)}`,
      sentAt: nowMs(),
      ...extra,
    };

    rememberP2PMessage(envelope.messageId);
    if (state.p2pChannel) state.p2pChannel.postMessage(envelope);

    try {
      localStorage.setItem(P2P_STORAGE_KEY, JSON.stringify(envelope));
      localStorage.removeItem(P2P_STORAGE_KEY);
    } catch {}

    return envelope;
  }

  function setupLocalTransport() {
    if ('BroadcastChannel' in window) {
      state.p2pChannel = new BroadcastChannel(P2P_CHANNEL_NAME);
      state.p2pChannel.onmessage = event => handleEnvelope(event.data);
    }

    window.addEventListener('storage', event => {
      if (event.key !== P2P_STORAGE_KEY || !event.newValue) return;
      try { handleEnvelope(JSON.parse(event.newValue)); } catch {}
    });

    window.addEventListener('beforeunload', () => {
      if (state.p2pChannel) state.p2pChannel.close();
    });
  }

  function syncKnownNodes() {
    const cutoff = nowMs() - nodeTtl;
    for (const [key, value] of state.knownNodes.entries()) {
      if ((value.lastSeen || 0) < cutoff) state.knownNodes.delete(key);
    }

    state.knownNodes.set(state.nodeId, {
      lastSeen: nowMs(),
      transport: state.p2pChannel ? 'broadcast-channel' : 'storage-event',
      self: true,
    });

    if (!state.lastHeartbeatAt || nowMs() - state.lastHeartbeatAt >= Math.max(1500, Math.floor(nodeTtl / 3))) {
      state.lastHeartbeatAt = nowMs();
      broadcastEnvelope('heartbeat');
    }

    onDashboardChanged?.();
  }

  return {
    setupLocalTransport,
    syncKnownNodes,
    broadcastEnvelope,
  };
}

