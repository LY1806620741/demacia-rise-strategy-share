export const state = {
  nodeId: crypto.randomUUID(),
  knownNodes: new Map(),
  peerIndices: new Map(),
  localVotes: new Map(),
  selectedBattleTechs: new Set(),
  enemyQueue: [],
  enemyLineupDraft: '',
  config: null,
  networkRuntime: {
    peerId: 'wasm-peer-pending',
    swarmReady: false,
    connectedPeers: [],
    lastEvent: '未初始化 swarm',
    lastError: '',
  },
  networkConfig: {
    communitySearchEnabled: true,
    defaultMaxResults: 8,
    preferIpv6: false,
    stunServers: [],
    bootstrapSources: [],
    bootstrapNote: '',
  },
  bootstrapStatus: [],
  db: null,
  nodeHeartBeatTimer: null,
  lastHeartbeatAt: 0,
  seenP2PMessages: new Set(),
};

export const NODE_TTL = 10000;
