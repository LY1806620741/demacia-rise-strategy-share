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
      lastMessage: '未同步社区索引',
      discoverySource: 'local',
      knownPointerCount: 0,
      autoWriteReason: '未检查',
    },
    networkConfig: {
      communitySearchEnabled: true,
      defaultMaxResults: 8,
      discoveryMode: 'decentralized-first',
      currentChapter: 0,
    },
  };
}

const state = createFrontendState();
assert.equal(state.networkConfig.communitySearchEnabled, true, '社区搜索应默认开启');
assert.equal(state.networkConfig.defaultMaxResults, 8, '默认最多显示结果数应为 8');
assert.equal(state.networkConfig.discoveryMode, 'decentralized-first', '发现策略应默认为去中心化优先');
assert.equal(state.networkConfig.currentChapter, 0, '没有章节选择 UI 时，默认不应启用运行时章节过滤');
assert.deepEqual(state.selectedCounterUnits, [], '初始不应预置应对单位');
assert.equal(state.strategyNotes, '', '策略描述应默认为空字符串');
assert.equal(state.communitySync.lastMessage, '未同步社区索引', '社区索引同步状态应有明确初始文案');
assert.equal(state.communitySync.discoverySource, 'local', '默认发现来源应为本地');
assert.equal(state.communitySync.autoWriteReason, '未检查', '默认应保留自动候选入口状态文案');

console.log('frontend-state defaults: ok');
