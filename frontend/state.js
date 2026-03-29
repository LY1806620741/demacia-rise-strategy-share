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
    lastMessage: '未同步社区索引',
    discoverySource: 'local',
    knownPointerCount: 0,
    redisRegistered: false,
    autoWriteReason: '未检查',
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
    providerStatus: 'IPFS 未连接',
  },
  communityPins: {
    pinCounts: {},
    totalReplicas: 0,
    replicatedStrategyCount: 0,
    updatedAt: 0,
  },
  networkConfig: {
    communitySearchEnabled: true,
    defaultMaxResults: 8,
    discoveryMode: 'decentralized-first',
  },
};

export const NODE_TTL = 10000;
export const DISCOVERY_RECORD_TTL_MS = 1000 * 60 * 10;
