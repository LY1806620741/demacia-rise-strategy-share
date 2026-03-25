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
  ipfs: {
    ready: false,
    peerId: '',
    addresses: [],
    addressCount: 0,
    canProvide: false,
    canPin: true,
    publishedCids: [],
    pinnedCids: [],
    lastPublishedCid: '',
    lastPinnedCid: '',
    lastError: '',
  },
  networkConfig: {
    communitySearchEnabled: true,
    defaultMaxResults: 8,
  },
};

export const NODE_TTL = 10000;
