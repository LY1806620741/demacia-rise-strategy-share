import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const configPath = path.resolve('./config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function normalizeLineupToken(token) {
  const normalized = String(token || '').trim().replace(/^[\[\]()（）]+|[\[\]()（）]+$/g, '');
  if (!normalized) return '';
  const lowered = normalized.toLowerCase();
  return lowered
    .replace(/[\s]*([x×*])[\s]*\d+$/i, '')
    .replace(/[\s]+\d+$/i, '')
    .replace(/^[+＋*×:：]+|[+＋*×:：]+$/g, '')
    .trim();
}

function parseLineupCount(token) {
  const normalized = String(token || '').trim().toLowerCase();
  const explicit = normalized.match(/(?:^|\s|[+＋,，;；|/])(?:x|×|\*)\s*(\d+)$/i)
    || normalized.match(/(?:x|×|\*)\s*(\d+)$/i)
    || normalized.match(/\s+(\d+)$/i);
  return Math.max(1, Number(explicit?.[1] || 1));
}

function normalizedLineupCounts(lineup) {
  const counts = new Map();
  String(lineup || '')
    .split(/[，,；;\n\t|/]/)
    .flatMap(segment => segment.split(/[+＋]/))
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .forEach(chunk => {
      const key = normalizeLineupToken(chunk);
      if (!key) return;
      const count = parseLineupCount(chunk);
      counts.set(key, (counts.get(key) || 0) + count);
    });
  return counts;
}

function calculateLineupSimilarity(lineupA, lineupB) {
  const countsA = normalizedLineupCounts(lineupA);
  const countsB = normalizedLineupCounts(lineupB);
  if (!countsA.size && !countsB.size) return 1;
  if (!countsA.size || !countsB.size) return 0;

  const allKeys = new Set([...countsA.keys(), ...countsB.keys()]);
  let overlap = 0;
  let total = 0;

  allKeys.forEach(key => {
    const a = countsA.get(key) || 0;
    const b = countsB.get(key) || 0;
    overlap += Math.min(a, b);
    total += Math.max(a, b);
  });

  return total ? overlap / total : 0;
}

function findOfficialRecommendationsByEnemyLineup(query) {
  return (config.town_defense_recommendations || []).flatMap(entry =>
    (entry.waves || []).map(wave => ({
      town: entry.town_name,
      wave: wave.label,
      similarity: calculateLineupSimilarity(wave.incoming_enemy_text || '', query),
    }))
  ).filter(item => item.similarity > 0).sort((a, b) => b.similarity - a.similarity);
}

const exactHits = findOfficialRecommendationsByEnemyLineup('雪人 x2, 部落战士 x15, 巨魔 x3');
assert.ok(exactHits.length > 0, '精确数量应命中至少一个官方防守推荐');
assert.equal(exactHits[0].town, '鹰石镇', '精确数量应优先命中鹰石镇');
assert.ok(exactHits[0].similarity >= 0.99, '精确数量匹配时，相似度应接近 1');

const nearHits = findOfficialRecommendationsByEnemyLineup('雪人 x2, 部落战士 x15, 巨魔 x2');
assert.ok(nearHits.length > 0, '数量略有差异时仍应命中官方防守推荐');
assert.equal(nearHits[0].town, '鹰石镇', '数量略有差异时仍应优先命中鹰石镇');
assert.ok(nearHits[0].similarity < exactHits[0].similarity, '数量不完全一致时，相似度应低于精确匹配');
assert.ok(nearHits[0].similarity > 0.8, '数量接近时仍应保持较高匹配度');

console.log('official-lineup-search: ok');
