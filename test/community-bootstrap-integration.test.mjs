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

console.log('community bootstrap integration: ok');

