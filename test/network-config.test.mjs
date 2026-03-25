import assert from 'node:assert/strict';

function createFrontendState() {
  return {
    selectedBattleTechs: new Set(),
    selectedCounterUnits: [],
    enemyQueue: [],
    enemyLineupDraft: '',
    strategyNotes: '',
    communitySync: {
      lastPublishedPointerCid: '',
      lastImportedPointerCid: '',
      lastMessage: '未同步索引',
    },
    networkConfig: {
      communitySearchEnabled: true,
      defaultMaxResults: 8,
    },
  };
}

const state = createFrontendState();
assert.equal(state.networkConfig.communitySearchEnabled, true, '社区搜索应默认开启');
assert.equal(state.networkConfig.defaultMaxResults, 8, '默认最多显示结果数应为 8');
assert.deepEqual(state.selectedCounterUnits, [], '初始不应预置应对单位');
assert.equal(state.strategyNotes, '', '策略描述应默认为空字符串');
assert.equal(state.communitySync.lastMessage, '未同步索引', '索引同步状态应有明确初始文案');

console.log('frontend-state defaults: ok');

