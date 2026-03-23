export const state = {
  p2pNode: null,
  nodeId: crypto.randomUUID(),
  knownNodes: new Map(),
  peerIndices: new Map(),
  localVotes: new Map(),
  selectedBattleTechs: new Set(),
  enemyQueue: [],
  enemyLineupDraft: '',
  config: null,
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
  p2pChannel: null,
  lastHeartbeatAt: 0,
  seenP2PMessages: new Set(),
};

export const NODE_TTL = 10000;
