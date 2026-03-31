export function normalizeIndexManifest(raw = {}) {
  return {
    version: Number(raw.version || 2),
    updatedAt: Number(raw.updatedAt || Date.now()),
    sourceCid: String(raw.sourceCid || ''),
    replicaBoardCid: String(raw.replicaBoardCid || ''),
    items: Array.isArray(raw.items)
      ? raw.items.filter(item => item?.cid).map(item => ({
          cid: String(item.cid),
          addedAt: Number(item.addedAt || Date.now()),
          title: String(item.title || ''),
          target: String(item.target || ''),
          pinned: item.pinned === true,
        }))
      : [],
  };
}

export function ensureDiscoveryRegistration({ hasNetworkEntry = false, pointerCid = '' } = {}) {
  if (hasNetworkEntry || !pointerCid) {
    return {
      ok: false,
      skipped: true,
      reason: hasNetworkEntry ? 'network-entry-exists' : 'missing-pointer',
      discovery: {
        source: hasNetworkEntry ? 'ipns' : 'empty',
        knownPointers: hasNetworkEntry ? [pointerCid].filter(Boolean) : [],
        hasNetworkEntry,
      },
    };
  }
  return {
    ok: true,
    localOnly: true,
    pointerCid,
    discovery: {
      source: 'ipns-local-seed',
      knownPointers: [pointerCid],
      hasNetworkEntry: true,
    },
  };
}

export function getKnownPointerCids(ipnsBoard, configPointers = [], localPointers = [], publishedPointers = []) {
  const current = String(ipnsBoard?.currentPointerCid || '').trim();
  const fallback = Array.isArray(ipnsBoard?.fallbackPointerCids) ? ipnsBoard.fallbackPointerCids.map(String).filter(Boolean) : [];
  const configured = Array.isArray(configPointers) ? configPointers.map(String).filter(Boolean) : [];
  const local = Array.isArray(localPointers) ? localPointers.map(String).filter(Boolean) : [];
  const published = Array.isArray(publishedPointers) ? publishedPointers.map(String).filter(Boolean) : [];
  return [...new Set([current, ...fallback, ...configured, ...local, ...published].filter(Boolean))];
}

export function mergeIndexManifest(baseIndex = { items: [] }, incomingIndex = { items: [] }) {
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
      version: Math.max(base.version, incoming.version, 2),
      updatedAt: Date.now(),
      sourceCid: incoming.sourceCid || base.sourceCid || '',
      replicaBoardCid: incoming.replicaBoardCid || base.replicaBoardCid || '',
      items: [...map.values()].sort((a, b) => b.addedAt - a.addedAt),
    },
    added,
  };
}

export function aggregateOnlineReplicaClaimsForPointers(pointerManifests = []) {
  const claims = [];
  const visitedBoards = new Set();
  for (const manifest of Array.isArray(pointerManifests) ? pointerManifests : []) {
    const boardCid = String(manifest?.replicaBoardCid || '').trim();
    if (!boardCid || visitedBoards.has(boardCid)) continue;
    visitedBoards.add(boardCid);
    for (const claim of Array.isArray(manifest?.replicaBoard?.claims) ? manifest.replicaBoard.claims : []) {
      if (!claim?.cid || !claim?.peerId) continue;
      claims.push({ cid: String(claim.cid), peerId: String(claim.peerId) });
    }
  }
  const seen = new Set();
  const counts = {};
  for (const claim of claims) {
    const key = `${claim.cid}::${claim.peerId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts[claim.cid] = Number(counts[claim.cid] || 0) + 1;
  }
  return counts;
}

