import { normalizedLineupCounts } from './enemy-lineup.js';

function joinCounterUnits(counter = []) {
  return (Array.isArray(counter) ? counter : [])
    .map(unit => unit?.name || unit?.id || '')
    .filter(Boolean)
    .join('、');
}

function joinResearch(research = []) {
  return (Array.isArray(research) ? research : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .join('、');
}

export function createCommunityStrategyRecord({ id, title = '', target = '', counter = [], research = [], notes = '', createdAt = Date.now(), likes = 0, dislikes = 0, cid = '', score } = {}) {
  const description = String(notes || '').trim();
  const targetText = String(target || '').trim();
  const counterUnits = Array.isArray(counter) ? counter : [];
  const researchList = Array.isArray(research) ? research : [];
  const counterLineup = joinCounterUnits(counterUnits);
  const researchText = joinResearch(researchList);
  const computedScore = Number.isFinite(Number(score)) ? Number(score) : Number(likes || 0) - Number(dislikes || 0);

  return {
    id: String(id || `strategy-${createdAt}`),
    cid: String(cid || ''),
    title: String(title || description.slice(0, 24) || targetText || '未命名策略'),
    description,
    notes: description,
    target: targetText,
    target_hero: targetText,
    counter: counterUnits,
    counter_lineup: counterLineup,
    research: researchList,
    counter_tech: researchText,
    createdAt: Number(createdAt || Date.now()),
    likes: Number(likes || 0),
    dislikes: Number(dislikes || 0),
    score: computedScore,
  };
}

export function normalizeCommunityStrategyRecord(raw = {}) {
  if (!raw || typeof raw !== 'object') return createCommunityStrategyRecord();
  return createCommunityStrategyRecord({
    id: raw.id,
    title: raw.title,
    target: raw.target ?? raw.target_hero ?? raw.enemy_lineup_text ?? '',
    counter: Array.isArray(raw.counter) ? raw.counter : [],
    research: Array.isArray(raw.research)
      ? raw.research
      : String(raw.counter_tech || raw.research_text || '')
          .split(/[、,，；;\n]/)
          .map(item => item.trim())
          .filter(Boolean),
    notes: raw.notes ?? raw.description ?? '',
    createdAt: raw.createdAt,
    likes: raw.likes,
    dislikes: raw.dislikes,
    cid: raw.cid,
    score: raw.score,
  });
}

export function calculateStrategySimilarity(strategy, enemyLineupText) {
  const normalized = normalizeCommunityStrategyRecord(strategy);
  const targetCounts = normalizedLineupCounts(normalized.target);
  const queryCounts = normalizedLineupCounts(enemyLineupText);
  if (!targetCounts.size || !queryCounts.size) return 0;
  const keys = new Set([...targetCounts.keys(), ...queryCounts.keys()]);
  let overlap = 0;
  let total = 0;
  for (const key of keys) {
    const a = targetCounts.get(key) || 0;
    const b = queryCounts.get(key) || 0;
    overlap += Math.min(a, b);
    total += Math.max(a, b);
  }
  return total ? overlap / total : 0;
}

