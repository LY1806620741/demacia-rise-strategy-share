import assert from 'node:assert/strict';

function summarizeOnlineReplicas(items = [], localReplicaCids = []) {
  const localReplicas = new Set(localReplicaCids.map(String));
  const replicaCounts = {};
  for (const item of items) {
    if (!item?.cid) continue;
    let count = 0;
    if (item.pinned === true) count += 1;
    if (localReplicas.has(String(item.cid))) count += 1;
    if (count > 0) replicaCounts[String(item.cid)] = count;
  }
  return {
    replicaCounts,
    totalReplicas: Object.values(replicaCounts).reduce((sum, value) => sum + Number(value || 0), 0),
    replicatedStrategyCount: Object.keys(replicaCounts).length,
  };
}

const summary = summarizeOnlineReplicas(
  [
    { cid: 'cid-a', pinned: true },
    { cid: 'cid-b', pinned: false },
    { cid: 'cid-c', pinned: true },
  ],
  ['cid-b', 'cid-c']
);

assert.deepEqual(summary.replicaCounts, {
  'cid-a': 1,
  'cid-b': 1,
  'cid-c': 2,
}, '在线副本聚合应同时统计索引副本标记与本地在线副本来源');
assert.equal(summary.totalReplicas, 4, '应汇总全部在线副本数');
assert.equal(summary.replicatedStrategyCount, 3, '应统计至少存在一个在线副本的策略数');

const emptySummary = summarizeOnlineReplicas([{ cid: 'cid-x', pinned: false }], []);
assert.deepEqual(emptySummary.replicaCounts, {}, '没有在线副本的策略不应出现在副本统计中');
assert.equal(emptySummary.totalReplicas, 0, '无在线副本时总数应为 0');
assert.equal(emptySummary.replicatedStrategyCount, 0, '无在线副本时策略数应为 0');

console.log('community online replica summary: ok');
