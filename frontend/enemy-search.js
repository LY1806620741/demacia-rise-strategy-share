import { state } from './state.js';
import { byId, escapeHtml, wasmArray } from './utils.js';
import { getResolvedTownDefenseRecommendations, getCurrentChapter } from './data.js';
import { normalizedLineupCounts, formatLineup } from './enemy-lineup.js';
import { fetchCommunityStrategies, searchStrategies } from './ipfs-client.js';
import { calculateStrategySimilarity, normalizeCommunityStrategyRecord } from './strategy-schema.js';
import { getIndexedCids } from './community-index.js';

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
  if (wave.incoming_enemy_text) return wave.incoming_enemy_text;
  if (Array.isArray(wave.incomingEnemies) && wave.incomingEnemies.length) {
    return wave.incomingEnemies.map(enemy => enemy.name).join('、');
  }
  return '';
}

function mapOfficialMatches(entries, query, chapter = getCurrentChapter()) {
  const currentChapter = Number(chapter || 0) || 0;
  return entries
    .flatMap(entry => (entry.waves || []).map(wave => ({
      townName: entry.town?.name || entry.town_name || entry.town_id,
      wave,
      similarity: calculateLineupSimilarity(getWaveEnemyLineupText(wave), query),
      chapterMatched: currentChapter > 0 && Number(wave.chapter || 0) === currentChapter,
    })))
    .filter(item => item.similarity > 0)
    .sort((a, b) => {
      if (Number(b.chapterMatched) !== Number(a.chapterMatched)) return Number(b.chapterMatched) - Number(a.chapterMatched);
      return b.similarity - a.similarity;
    });
}

export function findOfficialRecommendationsByEnemyLineup(query, limit = 5, chapter = getCurrentChapter()) {
  return mapOfficialMatches(getResolvedTownDefenseRecommendations(), query, chapter).slice(0, limit);
}

export async function searchCommunityByEnemyLineup(cidList, keyword) {
  const strategies = await fetchCommunityStrategies(cidList);
  return searchStrategies(strategies, keyword);
}

async function findIndexedCommunityRecommendations(query, limit) {
  const cidList = getIndexedCids();
  if (!cidList.length) return [];
  const strategies = await fetchCommunityStrategies(cidList);
  return strategies
    .map(record => normalizeCommunityStrategyRecord({ ...record.data, cid: record.cid }))
    .map(strategy => ({
      ...strategy,
      strategy_id: strategy.id,
      similarity_score: calculateStrategySimilarity(strategy, query),
    }))
    .filter(item => item.similarity_score > 0)
    .sort((a, b) => {
      if (b.similarity_score !== a.similarity_score) return b.similarity_score - a.similarity_score;
      return (b.createdAt || 0) - (a.createdAt || 0);
    })
    .slice(0, limit);
}

export async function searchByEnemyLineup({ recommendStrategies, getStrategies }) {
  const input = byId('enemy-lineup-text-input');
  const query = input?.value?.trim() || state.enemyLineupDraft.trim() || formatLineup(state.enemyQueue);
  const includeCommunity = !!byId('include-community-search')?.checked;
  const limit = Math.max(1, Number(byId('similarity-result-limit')?.value || 8));
  const container = byId('similarity-recommendations');
  if (!container) return;
  if (!query) {
    container.innerHTML = '<div class="muted">请先输入敌人阵容</div>';
    return;
  }

  const officialLimit = Math.max(3, Math.ceil(limit / 2));
  const officialMatches = findOfficialRecommendationsByEnemyLineup(query, officialLimit);
  const localCommunityMatches = includeCommunity ? wasmArray(recommendStrategies(query, limit)) : [];
  const indexedCommunityMatches = includeCommunity ? await findIndexedCommunityRecommendations(query, limit) : [];
  const communityMap = new Map();
  for (const item of [...indexedCommunityMatches, ...localCommunityMatches]) {
    const key = item.strategy_id || item.id || item.cid;
    if (!key) continue;
    const current = communityMap.get(key);
    if (!current || (item.similarity_score || 0) > (current.similarity_score || 0)) communityMap.set(key, item);
  }
  const communityMatches = [...communityMap.values()]
    .sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0))
    .slice(0, limit);
  const strategies = includeCommunity ? wasmArray(getStrategies()) : [];

  if (!officialMatches.length && !communityMatches.length) {
    container.innerHTML = '<div style="background:#171717;border:1px solid #333;border-radius:10px;padding:1rem;"><strong>暂无匹配策略</strong><div class="muted" style="margin-top:.45rem;">没有找到匹配的官方防守方案；你也可以补充并发布自己的社区策略。</div></div>';
    return;
  }

  const officialHtml = officialMatches.length ? `<div style="margin-bottom:1rem;"><div style="font-weight:bold;color:#ffd54f;margin-bottom:.6rem;">官方防守推荐</div>${officialMatches.map(item => {
    const wave = item.wave;
    const enemyText = getWaveEnemyLineupText(wave);
    const lineupText = wave.recommended_lineup_text || (wave.recommendedLineup || []).map(unit => unit.name).join('、') || '未配置';
    const researchText = (wave.recommendedTechs || []).length ? wave.recommendedTechs.map(tech => tech.name).join('、') : '未配置';
    const chapterBadge = item.chapterMatched ? '<span class="muted" style="margin-left:.5rem;color:#8bc34a;">当前章节优先</span>' : '';
    const requiredHtml = wave.required_tech_text ? `<div style="margin:.45rem 0;"><strong>必需研究：</strong>${escapeHtml(wave.required_tech_text)}</div>` : '';
    const optionalHtml = wave.optional_tech_text ? `<div style="margin:.45rem 0;"><strong>可选研究：</strong>${escapeHtml(wave.optional_tech_text)}</div>` : '';
    const tacticHtml = wave.tactic ? `<div class="muted"><strong>诀窍：</strong>${escapeHtml(wave.tactic)}</div>` : '';
    return `<div style="background:#171717;border:1px solid #333;border-radius:10px;padding:1rem;margin-bottom:.75rem;"><div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center;"><strong>${escapeHtml(item.townName)} · ${escapeHtml(wave.label || '来袭波次')}${chapterBadge}</strong><span class="muted">匹配度 ${(item.similarity * 100).toFixed(0)}%</span></div><div style="margin:.45rem 0;"><strong>来袭敌人：</strong>${escapeHtml(enemyText)}</div><div style="margin:.45rem 0;"><strong>推荐阵容：</strong>${escapeHtml(lineupText)}</div><div style="margin:.45rem 0;"><strong>推荐研究：</strong>${escapeHtml(researchText)}</div>${requiredHtml}${optionalHtml}${tacticHtml}</div>`;
  }).join('')}</div>` : '';

  const communityItemsHtml = communityMatches.length ? communityMatches.map(item => {
    const strategy = strategies.find(s => s.id === item.strategy_id) || item;
    const displayTitle = strategy?.description || strategy?.title || item.strategy_id;
    return `<div style="background:#171717;border:1px solid #333;border-radius:10px;padding:1rem;margin-bottom:.75rem;"><div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center;"><strong>${escapeHtml(displayTitle)}</strong><span class="muted">相似度 ${(Number(item.similarity_score || 0) * 100).toFixed(0)}%</span></div><div style="margin:.45rem 0;"><strong>建议阵容：</strong>${escapeHtml(item.counter_lineup || strategy?.counter_lineup || '未填写')}</div><div style="margin:.45rem 0;"><strong>敌人阵容：</strong>${escapeHtml(strategy?.target || item.target || query)}</div><div style="margin:.45rem 0;"><strong>研究：</strong>${escapeHtml(strategy?.counter_tech || item.counter_tech || '未填写')}</div><div class="muted">${escapeHtml(strategy?.description || item.description || '')}</div><div class="muted" style="margin-top:.35rem;word-break:break-all;">CID：${escapeHtml(strategy?.cid || item.cid || '')}</div></div>`;
  }).join('') : '<div class="muted">未找到匹配的社区策略</div>';
  const communityHtml = includeCommunity ? `<div><div style="font-weight:bold;color:#9fd3ff;margin-bottom:.6rem;">社区相似策略</div>${communityItemsHtml}</div>` : '';

  container.innerHTML = `${officialHtml}${communityHtml}`;
}
