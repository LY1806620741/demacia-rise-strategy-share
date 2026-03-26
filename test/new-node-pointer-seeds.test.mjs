import assert from 'node:assert/strict';

function getKnownPointerCids(ipnsBoard, configPointers, localPointers) {
  const configured = Array.isArray(configPointers) ? configPointers.map(String).filter(Boolean) : [];
  const local = Array.isArray(localPointers) ? localPointers.map(String).filter(Boolean) : [];
  const boardCurrent = String(ipnsBoard?.currentPointerCid || '').trim();
  const boardFallback = Array.isArray(ipnsBoard?.fallbackPointerCids) ? ipnsBoard.fallbackPointerCids.map(String).filter(Boolean) : [];
  return [...new Set([boardCurrent, ...boardFallback, ...configured, ...local].filter(Boolean))];
}

const firstJoinNodePointers = getKnownPointerCids(
  { currentPointerCid: 'bafy-ipns-latest', fallbackPointerCids: ['bafy-ipns-old'] },
  ['bafy-default-a'],
  []
);
assert.deepEqual(firstJoinNodePointers, ['bafy-ipns-latest', 'bafy-ipns-old', 'bafy-default-a'], '新加入节点应优先从 IPNS 公告板获得可同步 pointer，再补充配置默认入口');

const mergedPointers = getKnownPointerCids(
  { currentPointerCid: 'bafy-ipns-latest', fallbackPointerCids: ['bafy-default-a'] },
  ['bafy-default-a'],
  ['bafy-local-c', 'bafy-ipns-latest']
);
assert.deepEqual(mergedPointers, ['bafy-ipns-latest', 'bafy-default-a', 'bafy-local-c'], 'IPNS、配置入口和本地入口应合并去重');

console.log('new-node pointer seeds: ok');

