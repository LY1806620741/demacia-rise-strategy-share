import assert from 'node:assert/strict';
import {
  normalizeIndexManifest,
  ensureDiscoveryRegistration,
  getKnownPointerCids,
  mergeIndexManifest,
  aggregateOnlineReplicaClaimsForPointers,
} from './helpers/community-bootstrap-contracts.mjs';

// 场景零：IPNS 公告板为空时，不应误判为已经组网。
const emptyKnownPointers = getKnownPointerCids({ currentPointerCid: '', fallbackPointerCids: [] }, [], [], []);
assert.deepEqual(emptyKnownPointers, [], '空的 IPNS 公告板不应产生伪候选入口');

// 场景一：首节点启动时没有任何社区入口，发布本地索引后建立本地候选入口。
const firstNodePointer = 'bafy-first-node-pointer';
const firstNodeBootstrap = ensureDiscoveryRegistration({ hasNetworkEntry: false, pointerCid: firstNodePointer });
assert.equal(firstNodeBootstrap.ok, true, '首节点在未发现入口时应完成初组网');
assert.equal(firstNodeBootstrap.localOnly, true, '首节点初组网应先建立本地候选入口');
assert.deepEqual(firstNodeBootstrap.discovery.knownPointers, [firstNodePointer], '首节点应把自己的 pointer 作为首个候选入口');

// 场景二：第二节点读取 IPNS 公告板与本地已知候选入口后，应能加入同一社区网络。
const secondNodeKnownPointers = getKnownPointerCids(
  { currentPointerCid: firstNodePointer, fallbackPointerCids: [] },
  [],
  [],
  []
);
assert.deepEqual(secondNodeKnownPointers, [firstNodePointer], '第二节点应能从 IPNS 公告板获得首节点的 pointer');

// 场景三：当第二节点同步到自己的 pointer 后，候选入口应合并而不是覆盖。
const mergedNetworkPointers = getKnownPointerCids(
  { currentPointerCid: firstNodePointer, fallbackPointerCids: ['bafy-second-node-pointer'] },
  [],
  ['bafy-second-node-pointer'],
  []
);
assert.deepEqual(
  mergedNetworkPointers,
  [firstNodePointer, 'bafy-second-node-pointer'],
  '初组网后新增节点的候选入口应与首节点入口合并去重'
);

// 场景四：首节点发布最小社区索引，第二节点通过候选入口拿到该 pointer 后应能把索引合并到本地。
const firstNodeIndex = {
  version: 2,
  sourceCid: firstNodePointer,
  items: [
    {
      cid: 'bafy-strategy-a',
      title: '首节点策略',
      target: '雪人*2，部落战士*15，巨魔*2',
      addedAt: 1,
    },
  ],
};
const secondNodeLocalIndex = normalizeIndexManifest({ version: 2, items: [] });
const mergedIndex = mergeIndexManifest(secondNodeLocalIndex, firstNodeIndex);
assert.equal(mergedIndex.added, 1, '第二节点应能从首节点最小索引中合并出一条新策略');
assert.equal(mergedIndex.index.sourceCid, firstNodePointer, '合并后索引来源应更新为首节点 pointer');
assert.deepEqual(
  mergedIndex.index.items.map(item => item.cid),
  ['bafy-strategy-a'],
  '第二节点合并后的本地索引应包含首节点发布的社区策略 CID'
);

const remergedIndex = mergeIndexManifest(mergedIndex.index, firstNodeIndex);
assert.equal(remergedIndex.added, 0, '重复同步相同 pointer 时不应重复追加策略');
assert.deepEqual(
  remergedIndex.index.items.map(item => item.cid),
  ['bafy-strategy-a'],
  '重复同步后本地索引内容应保持稳定不重复'
);

// 场景五：首节点发布索引并携带在线副本声明，第二节点同步后应能正确聚合在线副本数。
const firstNodePublishedManifest = {
  sourceCid: firstNodePointer,
  replicaBoardCid: 'bafy-replica-board-a',
  replicaBoard: {
    claims: [
      { cid: 'bafy-strategy-a', peerId: 'peer-first' },
      { cid: 'bafy-strategy-a', peerId: 'peer-first' },
      { cid: 'bafy-strategy-b', peerId: 'peer-first' },
    ],
  },
};
const secondNodePublishedManifest = {
  sourceCid: 'bafy-second-node-pointer',
  replicaBoardCid: 'bafy-replica-board-b',
  replicaBoard: {
    claims: [
      { cid: 'bafy-strategy-a', peerId: 'peer-second' },
      { cid: 'bafy-strategy-c', peerId: 'peer-second' },
    ],
  },
};
const replicaCounts = aggregateOnlineReplicaClaimsForPointers([firstNodePublishedManifest, secondNodePublishedManifest]);
assert.deepEqual(
  replicaCounts,
  {
    'bafy-strategy-a': 2,
    'bafy-strategy-b': 1,
    'bafy-strategy-c': 1,
  },
  '初组网后应按 cid + peerId 去重聚合在线副本数，并合并多个候选入口来源'
);

console.log('initial bootstrap network: ok');
