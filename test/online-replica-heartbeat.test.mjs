import assert from 'node:assert/strict';

function shouldRefreshReplicaBoard(lastUpdatedAt, now = Date.now(), intervalMs = 1000 * 60 * 3) {
  return Number(lastUpdatedAt || 0) <= 0 || now - Number(lastUpdatedAt || 0) >= intervalMs;
}

const now = Date.now();
assert.equal(shouldRefreshReplicaBoard(0, now), true, '从未发布过在线副本声明时应立即刷新');
assert.equal(shouldRefreshReplicaBoard(now - 1000 * 60 * 4, now), true, '超过刷新间隔后应重新发布在线副本声明');
assert.equal(shouldRefreshReplicaBoard(now - 1000 * 60, now), false, '刷新间隔内不应重复发布在线副本声明');

console.log('online replica heartbeat: ok');

