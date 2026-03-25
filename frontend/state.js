export const state = {
  nodeId: crypto.randomUUID(),
  localVotes: new Map(),
  selectedBattleTechs: new Set(),
  selectedCounterUnits: [],
  enemyQueue: [],
  enemyLineupDraft: '',
  strategyNotes: '',
  config: null,
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

export const NODE_TTL = 10000;
