import assert from 'node:assert/strict';
import {
  normalizeIndexManifest,
  ensureDiscoveryRegistration,
  getKnownPointerCids,
  mergeIndexManifest,
  aggregateOnlineReplicaClaimsForPointers,
} from './helpers/community-bootstrap-contracts.mjs';

// 更贴近真实流程的“初组网 + 同步索引 + 在线副本聚合”集成测试。
const firstNodePointer = 'bafy-first-node-pointer';
const secondNodePointer = 'bafy-second-node-pointer';

const firstNodeBootstrap = ensureDiscoveryRegistration({ hasNetworkEntry: false, pointerCid: firstNodePointer });
assert.equal(firstNodeBootstrap.ok, true, '首节点应能在无入口时建立本地候选入口');

const secondNodeDiscoveredPointers = getKnownPointerCids(
  { currentPointerCid: firstNodePointer, fallbackPointerCids: [secondNodePointer] },
  [],
  [],
  []
);
assert.deepEqual(
  secondNodeDiscoveredPointers,
  [firstNodePointer, secondNodePointer],
  '第二节点应能从公告板拿到首节点入口，并看到后续候选入口扩展'
);

const pointersWithConfiguredFallback = getKnownPointerCids(
  { currentPointerCid: firstNodePointer, fallbackPointerCids: [secondNodePointer] },
  ['bafy-default-pointer'],
  [],
  []
);
assert.deepEqual(
  pointersWithConfiguredFallback,
  [firstNodePointer, secondNodePointer, 'bafy-default-pointer'],
  '候选入口合并时应同时保留配置默认入口，作为初组网后的额外回退来源'
);

const pointersWithBrokenCandidate = getKnownPointerCids(
  { currentPointerCid: firstNodePointer, fallbackPointerCids: ['', 'bafy-broken-pointer', secondNodePointer] },
  ['bafy-default-pointer'],
  [],
  []
);
assert.deepEqual(
  pointersWithBrokenCandidate,
  [firstNodePointer, 'bafy-broken-pointer', secondNodePointer, 'bafy-default-pointer'],
  '候选入口收集阶段应保留原始候选顺序，后续同步阶段再跳过无效 pointer'
);

const dedupedMixedPointers = getKnownPointerCids(
  { currentPointerCid: firstNodePointer, fallbackPointerCids: [secondNodePointer, firstNodePointer] },
  ['bafy-default-pointer', secondNodePointer],
  [firstNodePointer, 'bafy-local-pointer'],
  ['bafy-local-pointer']
);
assert.deepEqual(
  dedupedMixedPointers,
  [firstNodePointer, secondNodePointer, 'bafy-default-pointer', 'bafy-local-pointer'],
  '混合候选入口去重时应保留首次出现顺序，并正确合并公告板、默认入口、本地入口与已发布入口'
);

const firstNodeIndex = normalizeIndexManifest({
  version: 2,
  sourceCid: firstNodePointer,
  replicaBoardCid: 'bafy-replica-board-a',
  items: [
    { cid: 'bafy-strategy-a', addedAt: 1, title: '首节点策略A', target: '雪人*2' },
    { cid: 'bafy-strategy-b', addedAt: 2, title: '首节点策略B', target: '巨魔*2' },
  ],
});
const secondNodeIndex = normalizeIndexManifest({
  version: 2,
  sourceCid: secondNodePointer,
  replicaBoardCid: 'bafy-replica-board-b',
  items: [
    { cid: 'bafy-strategy-c', addedAt: 3, title: '第二节点策略C', target: '龙蜥*1' },
  ],
});

const mergedToSecondNode = mergeIndexManifest(secondNodeIndex, firstNodeIndex);
assert.equal(mergedToSecondNode.added, 2, '第二节点应能把首节点的两条策略合并进本地索引');
assert.deepEqual(
  mergedToSecondNode.index.items.map(item => item.cid),
  ['bafy-strategy-c', 'bafy-strategy-b', 'bafy-strategy-a'],
  '索引合并后应保留时间顺序并包含两端策略'
);

const resilientMergedIndex = mergeIndexManifest(
  normalizeIndexManifest({
    version: 2,
    sourceCid: secondNodePointer,
    items: [{ cid: 'bafy-strategy-c', addedAt: 3, title: '第二节点策略C', target: '龙蜥*1' }],
  }),
  firstNodeIndex
);
assert.deepEqual(
  resilientMergedIndex.index.items.map(item => item.cid),
  ['bafy-strategy-c', 'bafy-strategy-b', 'bafy-strategy-a'],
  '即使候选入口列表中存在坏 pointer，只要仍有一个有效入口，索引合并结果也应保持稳定'
);

const replicaCounts = aggregateOnlineReplicaClaimsForPointers([
  {
    sourceCid: firstNodePointer,
    replicaBoardCid: 'bafy-replica-board-a',
    replicaBoard: {
      claims: [
        { cid: 'bafy-strategy-a', peerId: 'peer-first' },
        { cid: 'bafy-strategy-b', peerId: 'peer-first' },
      ],
    },
  },
  {
    sourceCid: secondNodePointer,
    replicaBoardCid: 'bafy-replica-board-b',
    replicaBoard: {
      claims: [
        { cid: 'bafy-strategy-a', peerId: 'peer-second' },
        { cid: 'bafy-strategy-c', peerId: 'peer-second' },
      ],
    },
  },
]);
assert.deepEqual(
  replicaCounts,
  {
    'bafy-strategy-a': 2,
    'bafy-strategy-b': 1,
    'bafy-strategy-c': 1,
  },
  '集成流程中在线副本应按候选入口聚合并按 peer 去重'
);

const duplicateBoardReplicaCounts = aggregateOnlineReplicaClaimsForPointers([
  {
    sourceCid: firstNodePointer,
    replicaBoardCid: 'bafy-shared-board',
    replicaBoard: {
      claims: [
        { cid: 'bafy-strategy-a', peerId: 'peer-first' },
        { cid: 'bafy-strategy-a', peerId: 'peer-second' },
      ],
    },
  },
  {
    sourceCid: secondNodePointer,
    replicaBoardCid: 'bafy-shared-board',
    replicaBoard: {
      claims: [
        { cid: 'bafy-strategy-a', peerId: 'peer-first' },
      ],
    },
  },
]);
assert.deepEqual(
  duplicateBoardReplicaCounts,
  {
    'bafy-strategy-a': 2,
  },
  '多个候选入口引用同一个 replicaBoardCid 时，应只读取同一声明板一次，但完整保留该声明板中的唯一 peer 声明'
);

console.log('community bootstrap integration: ok');
