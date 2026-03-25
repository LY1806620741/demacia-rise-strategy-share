import assert from 'node:assert/strict';

function normalizeIndexManifest(raw = {}) {
  return {
    version: Number(raw.version || 1),
    updatedAt: Number(raw.updatedAt || Date.now()),
    sourceCid: String(raw.sourceCid || ''),
    items: Array.isArray(raw.items)
      ? raw.items
          .filter(item => item?.cid)
          .map(item => ({
            cid: String(item.cid),
            addedAt: Number(item.addedAt || Date.now()),
            title: String(item.title || ''),
            target: String(item.target || ''),
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
      version: Math.max(base.version, incoming.version, 1),
      updatedAt: Date.now(),
      sourceCid: incoming.sourceCid || base.sourceCid || '',
      items: [...map.values()].sort((a, b) => b.addedAt - a.addedAt),
    },
    added,
  };
}

const base = {
  version: 1,
  updatedAt: 1,
  items: [
    { cid: 'bafy-old', addedAt: 10, title: '旧条目', target: '雪人 x2' },
  ],
};

const incoming = {
  version: 1,
  updatedAt: 2,
  sourceCid: 'bafy-pointer',
  items: [
    { cid: 'bafy-old', addedAt: 10, title: '重复条目', target: '雪人 x2' },
    { cid: 'bafy-new', addedAt: 20, title: '新条目', target: '巨魔 x2' },
  ],
};

const result = mergeIndexManifest(base, incoming);
assert.equal(result.added, 1, '应只新增一个非重复 CID');
assert.equal(result.index.items.length, 2, '合并后应保留两个唯一 CID');
assert.equal(result.index.items[0].cid, 'bafy-new', '应按 addedAt 倒序排列');
assert.equal(result.index.sourceCid, 'bafy-pointer', '应记录最新指针 CID');

console.log('community-index merge contract ok');
