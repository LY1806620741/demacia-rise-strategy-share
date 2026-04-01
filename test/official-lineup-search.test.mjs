import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const configPath = path.resolve('./config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function normalizeLineupToken(token) {
  const normalized = String(token || '').trim().replace(/^[\[\]()（）]+|[\[\]()（）]+$/gu, '');
  if (!normalized) return '';
  const lowered = normalized.toLowerCase();
  return lowered
    .replace(/\s*([x×*])\s*\d+$/i, '')
    .replace(/\s+\d+$/i, '')
    .replace(/^[+＋*×:：]+|[+＋*×:：]+$/gu, '')
    .trim();
}

function parseLineupCount(token) {
  const normalized = String(token || '').trim().toLowerCase();
  const explicit = /(?:^|\s|[+＋,，;；|/])[x×*]\s*(\d+)$/i.exec(normalized)
    || /[x×*]\s*(\d+)$/i.exec(normalized)
    || /\s+(\d+)$/i.exec(normalized);
  return Math.max(1, Number(explicit?.[1] || 1));
}

function normalizedLineupCounts(lineup) {
  const counts = new Map();
  const chunks = String(lineup || '')
    .split(/[，,；;\n\t|/]/)
    .flatMap(segment => segment.split(/[+＋]/))
    .map(chunk => chunk.trim())
    .filter(Boolean);
  for (const chunk of chunks) {
    const key = normalizeLineupToken(chunk);
    if (!key) continue;
    const count = parseLineupCount(chunk);
    counts.set(key, (counts.get(key) || 0) + count);
  }
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

  for (const key of allKeys) {
    const a = countsA.get(key) || 0;
    const b = countsB.get(key) || 0;
    overlap += Math.min(a, b);
    total += Math.max(a, b);
  }

  return total ? overlap / total : 0;
}

function parseChapter(label = '') {
  const matched = /第\s*(\d+)\s*章/.exec(String(label));
  return matched ? Number(matched[1]) : 0;
}

function mapOfficialMatches(entries, query, chapter = 0) {
  const currentChapter = Number(chapter || 0) || 0;
  return entries.flatMap(entry =>
    (entry.waves || []).map(wave => ({
      town: entry.town_name,
      wave: wave.label,
      chapter: Number(wave.chapter || parseChapter(wave.label || '')),
      similarity: calculateLineupSimilarity(wave.incoming_enemy_text || '', query),
      chapterMatched: currentChapter > 0 && Number(wave.chapter || parseChapter(wave.label || '')) === currentChapter,
    }))
  ).filter(item => item.similarity > 0).sort((a, b) => {
    if (Number(b.chapterMatched) !== Number(a.chapterMatched)) return Number(b.chapterMatched) - Number(a.chapterMatched);
    return b.similarity - a.similarity;
  });
}

function findOfficialRecommendationsByEnemyLineup(query, chapter = 0) {
  return mapOfficialMatches(config.town_defense_recommendations || [], query, chapter);
}

const exactHits = findOfficialRecommendationsByEnemyLineup('雪人 x2, 部落战士 x15, 巨魔 x3', 5);
assert.ok(exactHits.length > 0, '精确数量应命中至少一个官方防守推荐');
assert.equal(exactHits[0].town, '鹰石镇', '精确数量应优先命中鹰石镇');
assert.ok(exactHits[0].similarity >= 0.99, '精确数量匹配时，相似度应接近 1');
assert.equal(exactHits[0].chapter, 5, '按章节搜索时应优先返回当前章节结果');

const nearHits = findOfficialRecommendationsByEnemyLineup('雪人 x2, 部落战士 x15, 巨魔 x2', 5);
assert.ok(nearHits.length > 0, '数量略有差异时仍应命中官方防守推荐');
assert.equal(nearHits[0].town, '鹰石镇', '数量略有差异时仍应优先命中鹰石镇');
assert.ok(nearHits[0].similarity < exactHits[0].similarity, '数量不完全一致时，相似度应低于精确匹配');
assert.ok(nearHits[0].similarity > 0.8, '数量接近时仍应保持较高匹配度');

const fallbackHits = findOfficialRecommendationsByEnemyLineup('雪人 x2, 部落战士 x15, 巨魔 x3', 6);
assert.ok(fallbackHits.length > 0, '当前章节没有命中时仍应保留全局官方数据作为后备结果');
assert.equal(fallbackHits[0].town, '鹰石镇', '当前章节无直接命中时应回退到全局最佳匹配');
assert.equal(fallbackHits[0].chapter, 5, '回退命中时应能返回真实所属章节');
assert.equal(fallbackHits[0].chapterMatched, false, '回退结果不应被误标记为当前章节命中');

const chapter2Hits = findOfficialRecommendationsByEnemyLineup('龙犬 x3, 石甲虫 x5', 2);
assert.ok(chapter2Hits.length > 0, '第二章官方数据应可按章节命中');
assert.equal(chapter2Hits[0].town, '托比西亚', '第二章搜索应优先命中托比西亚');
assert.equal(chapter2Hits[0].chapter, 2, '第二章搜索结果应标记为第2章');

const chapter6Hits = findOfficialRecommendationsByEnemyLineup('诺克萨斯步兵 x9, 诺克萨斯战斗法师 x7, 龙蜥 x1', 6);
assert.ok(chapter6Hits.length > 0, '第六章官方数据应可按章节命中');
assert.equal(chapter6Hits[0].chapter, 6, '第六章搜索应优先返回第6章结果');
assert.equal(chapter6Hits[0].town, '第六章敌袭 1', '第六章搜索应命中对应敌袭条目');

const chapter7Hits = findOfficialRecommendationsByEnemyLineup('诺克萨斯龙犬 x17, 诺克萨斯重击兵 x1, 诺克萨斯战斗法师 x2', 7);
assert.ok(chapter7Hits.length > 0, '第七章官方数据应可按章节命中');
assert.equal(chapter7Hits[0].chapter, 7, '第七章搜索应优先返回第7章结果');
assert.equal(chapter7Hits[0].town, '第七章强敌来袭-极限', '第七章搜索应命中极限战条目');

console.log('official-lineup-search: ok');
