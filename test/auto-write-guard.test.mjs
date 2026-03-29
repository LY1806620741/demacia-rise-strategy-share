import assert from 'node:assert/strict';

function shouldAttemptAutoWrite({
  hasReplicas = false,
  hasNetworkEntry = false,
  ipfsReady = false,
  canProvide = false,
  lastReplicaBoardUpdatedAt = 0,
  now = Date.now(),
  heartbeatMs = 1000 * 60 * 3,
} = {}) {
  if (!hasReplicas) return false;
  if (hasNetworkEntry) return false;
  if (!ipfsReady) return false;
  if (!canProvide) return false;
  return !lastReplicaBoardUpdatedAt || now - lastReplicaBoardUpdatedAt >= heartbeatMs;
}

const now = Date.now();
assert.equal(shouldAttemptAutoWrite({ hasReplicas: false, hasNetworkEntry: false, ipfsReady: true, canProvide: true, now }), false, '没有副本内容时不应触发自动写');
assert.equal(shouldAttemptAutoWrite({ hasReplicas: true, hasNetworkEntry: true, ipfsReady: true, canProvide: true, now }), false, '已有网络入口时不应触发自动写');
assert.equal(shouldAttemptAutoWrite({ hasReplicas: true, hasNetworkEntry: false, ipfsReady: false, canProvide: true, now }), false, 'IPFS 未就绪时不应触发自动写');
assert.equal(shouldAttemptAutoWrite({ hasReplicas: true, hasNetworkEntry: false, ipfsReady: true, canProvide: false, now }), false, '当前节点不能提供内容时不应触发自动写');
assert.equal(shouldAttemptAutoWrite({ hasReplicas: true, hasNetworkEntry: false, ipfsReady: true, canProvide: true, lastReplicaBoardUpdatedAt: now - 1000 * 60, now }), false, '心跳间隔内不应重复自动写');
assert.equal(shouldAttemptAutoWrite({ hasReplicas: true, hasNetworkEntry: false, ipfsReady: true, canProvide: true, lastReplicaBoardUpdatedAt: now - 1000 * 60 * 4, now }), true, '无网络且可提供内容、超过心跳间隔时应允许自动写');

console.log('auto write guard: ok');

