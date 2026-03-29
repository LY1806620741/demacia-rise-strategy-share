import assert from 'node:assert/strict';

function ensureDiscoveryRegistration({ hasNetworkEntry = false, pointerCid = '' } = {}) {
  if (hasNetworkEntry || !pointerCid) {
    return { ok: false, skipped: true, reason: hasNetworkEntry ? 'network-entry-exists' : 'missing-pointer' };
  }
  return {
    ok: true,
    localOnly: true,
    pointerCid,
    discovery: {
      source: 'ipns-local-seed',
      knownPointers: [pointerCid],
      hasNetworkEntry: true,
    },
  };
}

const firstNodeRegistration = ensureDiscoveryRegistration({ hasNetworkEntry: false, pointerCid: 'bafy-first-pointer' });
assert.equal(firstNodeRegistration.ok, true, '首个节点在未发现社区入口时应能建立本地候选入口');
assert.equal(firstNodeRegistration.localOnly, true, 'IPNS 模式下首个节点建立的是本地候选入口');
assert.equal(firstNodeRegistration.discovery.source, 'ipns-local-seed', '本地候选入口应标记为 ipns-local-seed 来源');
assert.deepEqual(firstNodeRegistration.discovery.knownPointers, ['bafy-first-pointer'], '首个节点应至少记录自己的 pointer 作为候选入口');

const existingNetworkRegistration = ensureDiscoveryRegistration({ hasNetworkEntry: true, pointerCid: 'bafy-other' });
assert.equal(existingNetworkRegistration.ok, false, '已存在社区入口时不应重复建立候选入口');
assert.equal(existingNetworkRegistration.reason, 'network-entry-exists', '应明确返回跳过原因');

console.log('community publish discovery: ok');
