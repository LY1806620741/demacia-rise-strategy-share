import assert from 'node:assert/strict';

function createCommunitySyncState() {
  return {
    lastPublishedPointerCid: '',
    lastImportedPointerCid: '',
    lastMessage: '未同步索引',
  };
}

const syncState = createCommunitySyncState();
assert.equal(syncState.lastPublishedPointerCid, '', '初始不应存在已发布指针');
assert.equal(syncState.lastImportedPointerCid, '', '初始不应存在已导入指针');
assert.equal(syncState.lastMessage, '未同步索引', '初始应提示尚未同步索引');

syncState.lastPublishedPointerCid = 'bafy-published';
syncState.lastImportedPointerCid = 'bafy-imported';
syncState.lastMessage = '已从公告板同步，新增 2 条';
assert.match(syncState.lastMessage, /同步|新增/, '同步状态文案应可表达导入结果');

console.log('community-sync local state: ok');

