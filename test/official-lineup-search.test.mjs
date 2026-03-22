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

function normalizedLineupUnits(lineup) {
  return new Set(
    String(lineup || '')
      .split(/[，,；;\n\t|/]/)
      .flatMap(segment => segment.split(/[+＋]/))
      .map(normalizeLineupToken)
      .filter(Boolean)
  );
}

function calculateLineupSimilarity(lineupA, lineupB) {
  const unitsA = normalizedLineupUnits(lineupA);
  const unitsB = normalizedLineupUnits(lineupB);
  if (!unitsA.size && !unitsB.size) return 1;
  if (!unitsA.size || !unitsB.size) return 0;
  const intersection = [...unitsA].filter(unit => unitsB.has(unit)).length;
  const union = new Set([...unitsA, ...unitsB]).size;
  return union ? intersection / union : 0;
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

const hits = findOfficialRecommendationsByEnemyLineup('雪人 x2, 部落战士 x15, 巨魔 x2');
assert.ok(hits.length > 0, '应命中至少一个官方防守推荐');
assert.equal(hits[0].town, '鹰石镇', '应优先命中鹰石镇官方防守推荐');
assert.ok(hits[0].similarity >= 0.99, '单位集合完全一致时，相似度应接近 1');

console.log('official-lineup-search: ok');
