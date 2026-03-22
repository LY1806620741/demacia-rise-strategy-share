import assert from 'node:assert/strict';

const NODE_TTL = 10000;
const state = {
  nodeId: 'self-node',
  knownNodes: new Map(),
  p2pNode: {},
  p2pChannel: { postMessage() {} },
  lastHeartbeatAt: 0,
};

function nowMs() {
  return 1000;
}

function syncKnownNodes() {
  const cutoff = nowMs() - NODE_TTL;
  for (const [key, value] of state.knownNodes.entries()) {
    if ((value.lastSeen || 0) < cutoff) state.knownNodes.delete(key);
  }

  state.knownNodes.set(state.nodeId, {
    lastSeen: nowMs(),
    transport: state.p2pChannel ? 'broadcast-channel' : 'storage-event',
    self: true,
  });
}

function dashboardState() {
  const activeNodeCount = state.knownNodes.size;
  const hasLocalTransport = !!state.p2pChannel || state.p2pNode;
  return hasLocalTransport ? (activeNodeCount > 1 ? '已连接' : '在线') : '离线';
}

syncKnownNodes();
assert.equal(state.knownNodes.size, 1, '单页面启动后应至少注册自身节点');
assert.equal(state.knownNodes.get('self-node')?.self, true, '自身节点应标记为 self');
assert.equal(dashboardState(), '在线', '单节点本地通道可用时，状态应显示在线');

state.knownNodes.set('peer-1', { lastSeen: nowMs(), transport: 'broadcast-channel' });
assert.equal(dashboardState(), '已连接', '存在其他活动节点时，状态应显示已连接');

console.log('p2p-local-state: ok');

