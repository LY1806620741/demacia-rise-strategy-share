import assert from 'node:assert/strict';

function normalizeIndexManifest(raw = {}) {
  return {
    version: Number(raw.version || 2),
    updatedAt: Number(raw.updatedAt || Date.now()),
    sourceCid: String(raw.sourceCid || ''),
    items: Array.isArray(raw.items)
      ? raw.items.filter(item => item?.cid).map(item => ({
          cid: String(item.cid),
          addedAt: Number(item.addedAt || Date.now()),
          title: String(item.title || ''),
          target: String(item.target || ''),
          pinned: item.pinned === true,
        }))
      : [],
  };
}

function mergeIndexManifest(baseIndex, incomingIndex) {
  const base = normalizeIndexManifest(baseIndex);
  const incoming = normalizeIndexManifest(incomingIndex);
  const map = new Map(base.items.map(item => [item.cid, item]));
  let added = 0;
  for (const item of incoming.items) {
    if (!map.has(item.cid)) {
      map.set(item.cid, item);
      added += 1;
    }
  }
  return {
    index: {
      version: Math.max(base.version, incoming.version, 2),
      updatedAt: Date.now(),
      sourceCid: incoming.sourceCid || base.sourceCid || '',
      items: [...map.values()].sort((a, b) => b.addedAt - a.addedAt),
    },
    added,
  };
}

const local = normalizeIndexManifest({
  sourceCid: 'pointer-a',
  items: [{ cid: 'cid-a', addedAt: 1, title: 'A', target: '雪人', pinned: false }],
});
const remote = normalizeIndexManifest({
  sourceCid: 'pointer-b',
  items: [
    { cid: 'cid-a', addedAt: 1, title: 'A', target: '雪人', pinned: false },
    { cid: 'cid-b', addedAt: 2, title: 'B', target: '龙蜥', pinned: true },
  ],
});

const merged = mergeIndexManifest(local, remote);
assert.equal(merged.added, 1, '从远端共享指针导入时应只新增未见过的条目');
assert.equal(merged.index.sourceCid, 'pointer-b', '最新远端指针应成为索引来源');
assert.equal(merged.index.items.length, 2, '共享索引合并后应保留全部唯一条目');
assert.equal(merged.index.items[0].cid, 'cid-b', '较新的共享条目应排在前面');
assert.equal(merged.index.items[0].pinned, true, '固定状态应保留到索引条目中');

console.log('community-index sharing: ok');

