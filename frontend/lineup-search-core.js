const LINEUP_ALIASES = new Map([
  ['诺克萨斯士兵', '诺克萨斯步兵'],
  ['诺克萨斯步兵', '诺克萨斯步兵'],
  ['精锐石甲虫', '精锐石甲虫'],
  ['精锐巨魔', '精锐巨魔'],
  ['残渊雪人', '残渊雪人'],
  ['亚龙', '云霄亚龙'],
  ['特殊雪人', '残渊雪人'],
  ['巨魔精锐', '精锐巨魔'],
  ['石甲', '石甲虫'],
  ['无畏先锋', '士兵'],
]);

function resolveEnemyAlias(name) {
  return LINEUP_ALIASES.get(name) || name;
}

export function normalizeLineupToken(token) {
  const normalized = String(token || '').trim().replace(/(^[[\]()（）]+)|([[\]()（）]+$)/gu, '');
  if (!normalized) return '';
  const name = normalized.toLowerCase()
    .replace(/\s*([x×*])\s*\d+$/i, '')
    .replace(/\s+\d+$/i, '')
    .replace(/(^[+＋*×:：]+)|([+＋*×:：]+$)/gu, '')
    .trim();
  return resolveEnemyAlias(name);
}

export function parseLineupCount(token) {
  const normalized = String(token || '').trim().toLowerCase();
  const explicit = /(?:^|\s|[+＋,，;；|/])[x×*]\s*(\d+)$/i.exec(normalized)
    || /[x×*]\s*(\d+)$/i.exec(normalized)
    || /\s+(\d+)$/i.exec(normalized);
  return Math.max(1, Number(explicit?.[1] || 1));
}

export function normalizedLineupCounts(lineup) {
  const counts = new Map();
  const chunks = String(lineup || '')
    .split(/[，,；;\n\t|/]/)
    .flatMap(segment => segment.split(/[+＋]/))
    .map(chunk => chunk.trim())
    .filter(Boolean);
  for (const chunk of chunks) {
    const key = normalizeLineupToken(chunk);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + parseLineupCount(chunk));
  }
  return counts;
}

export function calculateLineupSimilarity(lineupA, lineupB) {
  const countsA = normalizedLineupCounts(lineupA);
  const countsB = normalizedLineupCounts(lineupB);
  if (!countsA.size && !countsB.size) return 1;
  if (!countsA.size || !countsB.size) return 0;

  const allKeys = new Set([...countsA.keys(), ...countsB.keys()]);
  let overlap = 0;
  let total = 0;
  for (const key of allKeys) {
    const a = countsA.get(key) || 0;
    const b = countsB.get(key) || 0;
    overlap += Math.min(a, b);
    total += Math.max(a, b);
  }
  return total ? overlap / total : 0;
}

export function getWaveEnemyLineupText(wave) {
  if (wave?.incoming_enemy_text) return wave.incoming_enemy_text;
  if (Array.isArray(wave?.incomingEnemies) && wave.incomingEnemies.length) {
    return wave.incomingEnemies.map(enemy => enemy.name).join('、');
  }
  return '';
}

export function mapOfficialMatches(entries, query, chapter = 0) {
  const currentChapter = Number(chapter || 0) || 0;
  return (Array.isArray(entries) ? entries : [])
    .flatMap(entry => (entry.waves || []).map(wave => ({
      townName: entry.town?.name || entry.town_name || entry.town_id,
      wave,
      chapter: Number(wave.chapter || 0),
      similarity: calculateLineupSimilarity(getWaveEnemyLineupText(wave), query),
      chapterMatched: currentChapter > 0 && Number(wave.chapter || 0) === currentChapter,
    })))
    .filter(item => item.similarity > 0)
    .sort((a, b) => {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity;
      if (Number(b.chapterMatched) !== Number(a.chapterMatched)) return Number(b.chapterMatched) - Number(a.chapterMatched);
      if (b.chapter !== a.chapter) return b.chapter - a.chapter;
      return String(a.townName || '').localeCompare(String(b.townName || ''), 'zh-CN');
    });
}

export function normalizeErrorMessage(error, fallback = '社区搜索暂不可用') {
  const message = String(error?.message || error || '').trim();
  return message || fallback;
}

export async function collectCommunityMatches({
  includeCommunity = false,
  limit = 8,
  recommendStrategies = () => [],
  getIndexedCommunityMatches = async () => [],
  getStrategies = () => [],
  wasmArrayTransform = value => value,
} = {}) {
  if (!includeCommunity) {
    return {
      communityMatches: [],
      strategies: [],
      communityError: '',
    };
  }

  let localCommunityMatches = [];
  let indexedCommunityMatches = [];
  let communityError = '';

  try {
    localCommunityMatches = wasmArrayTransform(await recommendStrategies(limit));
  } catch (error) {
    communityError = normalizeErrorMessage(error);
  }

  try {
    indexedCommunityMatches = await getIndexedCommunityMatches(limit);
  } catch (error) {
    if (!communityError) communityError = normalizeErrorMessage(error);
  }

  const communityMap = new Map();
  for (const item of [...indexedCommunityMatches, ...localCommunityMatches]) {
    const key = item?.strategy_id || item?.id || item?.cid;
    if (!key) continue;
    const current = communityMap.get(key);
    if (!current || (item.similarity_score || 0) > (current.similarity_score || 0)) communityMap.set(key, item);
  }

  let strategies = [];
  try {
    strategies = wasmArrayTransform(await getStrategies());
  } catch {
    strategies = [];
  }

  return {
    communityMatches: [...communityMap.values()]
      .sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0))
      .slice(0, Math.max(1, Number(limit || 8))),
    strategies,
    communityError,
  };
}

export async function buildEnemySearchState({
  entries = [],
  query = '',
  chapter = 0,
  officialLimit = 5,
  includeCommunity = false,
  limit = 8,
  recommendStrategies = () => [],
  getIndexedCommunityMatches = async () => [],
  getStrategies = () => [],
  wasmArrayTransform = value => value,
} = {}) {
  const officialMatches = mapOfficialMatches(entries, query, chapter).slice(0, Math.max(1, Number(officialLimit || 5)));
  const communityState = await collectCommunityMatches({
    includeCommunity,
    limit,
    recommendStrategies,
    getIndexedCommunityMatches,
    getStrategies,
    wasmArrayTransform,
  });
  return {
    officialMatches,
    ...communityState,
    hasAnyMatches: officialMatches.length > 0 || communityState.communityMatches.length > 0,
  };
}


