import assert from 'node:assert/strict';

function getKnownPointerCids(configPointers, localPointers) {
  const configured = Array.isArray(configPointers) ? configPointers.map(String).filter(Boolean) : [];
  const local = Array.isArray(localPointers) ? localPointers.map(String).filter(Boolean) : [];
  return [...new Set([...configured, ...local])];
}

const firstJoinNodePointers = getKnownPointerCids(['bafy-default-a', 'bafy-default-b'], []);
assert.deepEqual(firstJoinNodePointers, ['bafy-default-a', 'bafy-default-b'], '新加入节点即使本地没有历史记录，也应从配置默认共享入口获得可同步的 pointer');

const mergedPointers = getKnownPointerCids(['bafy-default-a'], ['bafy-local-c', 'bafy-default-a']);
assert.deepEqual(mergedPointers, ['bafy-default-a', 'bafy-local-c'], '配置默认入口和本地入口应合并去重');

console.log('new-node pointer seeds: ok');

