import assert from 'node:assert/strict';

function createEmptyIndex() {
  return {
    version: 2,
    updatedAt: Date.now(),
    sourceCid: '',
    items: [],
  };
}

function ensureLocalIndexInitialized(index) {
  return index || createEmptyIndex();
}

const initialized = ensureLocalIndexInitialized(null);
assert.equal(initialized.version, 2, '空本地存储时应立即初始化本地索引');
assert.deepEqual(initialized.items, [], '初始化后的本地索引应为空数组而非未定义');
assert.equal(typeof initialized.updatedAt, 'number', '初始化后的本地索引应有更新时间');

console.log('community-index init: ok');

