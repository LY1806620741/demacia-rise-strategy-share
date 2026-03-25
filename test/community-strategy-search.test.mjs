import assert from 'node:assert/strict';

function normalizeLineupToken(token) {
  const normalized = String(token || '').trim().replace(/^[\[\]()（）]+|[\[\]()（）]+$/g, '');
  if (!normalized) return '';
  return normalized.toLowerCase()
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
      counts.set(key, (counts.get(key) || 0) + parseLineupCount(chunk));
    });
  return counts;
}

function calculateSimilarity(lineupA, lineupB) {
  const countsA = normalizedLineupCounts(lineupA);
  const countsB = normalizedLineupCounts(lineupB);
  const keys = new Set([...countsA.keys(), ...countsB.keys()]);
  let overlap = 0;
  let total = 0;
  for (const key of keys) {
    overlap += Math.min(countsA.get(key) || 0, countsB.get(key) || 0);
    total += Math.max(countsA.get(key) || 0, countsB.get(key) || 0);
  }
  return total ? overlap / total : 0;
}

const exact = calculateSimilarity('雪人 x2, 部落战士 x15, 巨魔 x3', '雪人*2，部落战士*15，巨魔*3');
const near = calculateSimilarity('雪人 x2, 部落战士 x15, 巨魔 x3', '雪人*2，部落战士*15，巨魔*2');
const miss = calculateSimilarity('雪人 x2, 部落战士 x15, 巨魔 x3', '龙犬 x8, 石甲虫 x4');

assert.ok(exact > 0.99, '完全一致时匹配度应接近 1');
assert.ok(near > 0.8, '数量接近时应保持高匹配度');
assert.ok(near < exact, '近似匹配应低于完全匹配');
assert.equal(miss, 0, '完全不同的阵容应不匹配');

console.log('community-strategy similarity: ok');

