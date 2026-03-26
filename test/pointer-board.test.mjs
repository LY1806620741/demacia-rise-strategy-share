import assert from 'node:assert/strict';

function normalizePointerBoard(raw = {}, source = '', extra = {}) {
  const current = String(raw.current_pointer_cid || '').trim();
  const fallback = Array.isArray(raw.fallback_pointer_cids)
    ? raw.fallback_pointer_cids.map(value => String(value || '').trim()).filter(Boolean)
    : [];
  return {
    version: Number(raw.version || 1),
    updatedAt: Number(raw.updatedAt || 0),
    currentPointerCid: current,
    fallbackPointerCids: fallback,
    source,
    sourceType: extra.sourceType || 'static-pointer-board',
    ipnsName: extra.ipnsName || '',
  };
}

function getKnownPointerCids(board, configured = [], local = []) {
  return [...new Set([
    board.currentPointerCid,
    ...board.fallbackPointerCids,
    ...configured.map(String),
    ...local.map(String),
  ].filter(Boolean))];
}

const ipnsBoard = normalizePointerBoard(
  {
    version: 1,
    updatedAt: 123,
    current_pointer_cid: 'bafy-current',
    fallback_pointer_cids: ['bafy-old-1', 'bafy-old-2'],
  },
  './ipns/k51-demo',
  { sourceType: 'ipns', ipnsName: 'k51-demo' }
);

assert.equal(ipnsBoard.sourceType, 'ipns', '应优先支持 IPNS 作为固定入口');
assert.equal(ipnsBoard.ipnsName, 'k51-demo', '应记录当前使用的 IPNS 名称');
assert.equal(ipnsBoard.currentPointerCid, 'bafy-current', 'IPNS 公告板应能提供最新 pointer');
assert.deepEqual(ipnsBoard.fallbackPointerCids, ['bafy-old-1', 'bafy-old-2'], 'IPNS 公告板应能提供备用 pointer 列表');
assert.deepEqual(
  getKnownPointerCids(ipnsBoard, ['bafy-config'], ['bafy-local', 'bafy-old-1']),
  ['bafy-current', 'bafy-old-1', 'bafy-old-2', 'bafy-config', 'bafy-local'],
  'IPNS 公告板、配置入口和本地入口应合并去重'
);

console.log('pointer board: ok');

