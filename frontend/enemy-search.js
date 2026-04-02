import { state } from './state.js';
import { byId, escapeHtml, wasmArray } from './utils.js';
import { getResolvedTownDefenseRecommendations, getCurrentChapter } from './data.js';
import { formatLineup } from './enemy-lineup.js';
import { fetchCommunityStrategies, searchStrategies } from './ipfs-client.js';
import { calculateStrategySimilarity, normalizeCommunityStrategyRecord } from './strategy-schema.js';
import { getIndexedCids } from './community-index.js';
import { getWaveEnemyLineupText, mapOfficialMatches, buildEnemySearchState } from './lineup-search-core.js';

const COMMUNITY_SEARCH_TIMEOUT_MS = 2500;
let latestEnemySearchRequestId = 0;

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

function withTimeout(promise, timeoutMs, message = '社区搜索超时') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ]);
}

function renderOfficialMatchesHtml(officialMatches) {
  if (!officialMatches.length) return '';
  return `<div style="margin-bottom:1rem;"><div style="font-weight:bold;color:#ffd54f;margin-bottom:.6rem;">官方防守推荐</div>${officialMatches.map(item => {
    const wave = item.wave;
    const enemyText = getWaveEnemyLineupText(wave);
    const lineupText = wave.recommended_lineup_text || (wave.recommendedLineup || []).map(unit => unit.name).join('、') || '未配置';
    const researchText = (wave.recommendedTechs || []).length ? wave.recommendedTechs.map(tech => tech.name).join('、') : '未配置';
    const chapterBadge = item.chapterMatched ? '<span class="muted" style="margin-left:.5rem;color:#8bc34a;">当前章节优先</span>' : '';
    const requiredHtml = wave.required_tech_text ? `<div style="margin:.45rem 0;"><strong>必需研究：</strong>${escapeHtml(wave.required_tech_text)}</div>` : '';
    const optionalHtml = wave.optional_tech_text ? `<div style="margin:.45rem 0;"><strong>可选研究：</strong>${escapeHtml(wave.optional_tech_text)}</div>` : '';
    const tacticHtml = wave.tactic ? `<div class="muted"><strong>诀窍：</strong>${escapeHtml(wave.tactic)}</div>` : '';
    return `<div style="background:#171717;border:1px solid #333;border-radius:10px;padding:1rem;margin-bottom:.75rem;"><div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center;"><strong>${escapeHtml(item.townName)} · ${escapeHtml(wave.label || '来袭波次')}${chapterBadge}</strong><span class="muted">匹配度 ${(item.similarity * 100).toFixed(0)}%</span></div><div style="margin:.45rem 0;"><strong>来袭敌人：</strong>${escapeHtml(enemyText)}</div><div style="margin:.45rem 0;"><strong>推荐阵容：</strong>${escapeHtml(lineupText)}</div><div style="margin:.45rem 0;"><strong>推荐研究：</strong>${escapeHtml(researchText)}</div>${requiredHtml}${optionalHtml}${tacticHtml}</div>`;
  }).join('')}</div>`;
}

function renderCommunityMatchesHtml({ includeCommunity, communityMatches = [], strategies = [], communityError = '', query = '', loading = false }) {
  if (!includeCommunity) return '';
  const normalizedStrategies = Array.isArray(strategies) ? strategies : [];
  const loadingHtml = '<div class="muted">正在补充社区相似策略…</div>';
  const emptyHtml = `<div class="muted">${communityError ? `社区搜索失败：${escapeHtml(communityError)}` : '未找到匹配的社区策略'}</div>`;
  const communityItemsHtml = loading ? loadingHtml : (communityMatches.length ? communityMatches.map(item => {
    const strategy = normalizedStrategies.find(s => s?.id === item?.strategy_id) || item || {};
    const displayTitle = strategy?.description || strategy?.title || item?.strategy_id || '未命名社区策略';
    return `<div style="background:#171717;border:1px solid #333;border-radius:10px;padding:1rem;margin-bottom:.75rem;"><div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center;"><strong>${escapeHtml(displayTitle)}</strong><span class="muted">相似度 ${(Number(item?.similarity_score || 0) * 100).toFixed(0)}%</span></div><div style="margin:.45rem 0;"><strong>建议阵容：</strong>${escapeHtml(item?.counter_lineup || strategy?.counter_lineup || '未填写')}</div><div style="margin:.45rem 0;"><strong>敌人阵容：</strong>${escapeHtml(strategy?.target || item?.target || query)}</div><div style="margin:.45rem 0;"><strong>研究：</strong>${escapeHtml(strategy?.counter_tech || item?.counter_tech || '未填写')}</div><div class="muted">${escapeHtml(strategy?.description || item?.description || '')}</div><div class="muted" style="margin-top:.35rem;word-break:break-all;">CID：${escapeHtml(strategy?.cid || item?.cid || '')}</div></div>`;
  }).join('') : emptyHtml);
  return `<div><div style="font-weight:bold;color:#9fd3ff;margin-bottom:.6rem;">社区相似策略</div>${communityItemsHtml}</div>`;
}

function renderSearchContainer(container, { officialMatches = [], includeCommunity = false, communityMatches = [], strategies = [], communityError = '', query = '', loadingCommunity = false } = {}) {
  const officialHtml = renderOfficialMatchesHtml(officialMatches);
  const communityHtml = renderCommunityMatchesHtml({ includeCommunity, communityMatches, strategies, communityError, query, loading: loadingCommunity });
  if (!officialHtml && !communityHtml) {
    container.innerHTML = '<div style="background:#171717;border:1px solid #333;border-radius:10px;padding:1rem;"><strong>暂无匹配策略</strong><div class="muted" style="margin-top:.45rem;">没有找到匹配的官方防守方案；你也可以补充并发布自己的社区策略。</div></div>';
    return;
  }
  container.innerHTML = `${officialHtml}${communityHtml}`;
}

export async function searchByEnemyLineup({ recommendStrategies, getStrategies }) {
  const requestId = ++latestEnemySearchRequestId;
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

  try {
    const officialLimit = Math.max(3, Math.ceil(limit / 2));
    const officialMatches = findOfficialRecommendationsByEnemyLineup(query, officialLimit);

    renderSearchContainer(container, {
      officialMatches,
      includeCommunity,
      query,
      loadingCommunity: includeCommunity,
    });

    if (!includeCommunity) return;

    const { communityMatches, strategies, communityError } = await withTimeout(buildEnemySearchState({
      entries: getResolvedTownDefenseRecommendations(),
      query,
      chapter: getCurrentChapter(),
      officialLimit,
      includeCommunity,
      limit,
      recommendStrategies: innerLimit => {
        try {
          return recommendStrategies(query, innerLimit);
        } catch (error) {
          console.warn('[community-search] local strategy recommend failed', error);
          throw error;
        }
      },
      getIndexedCommunityMatches: async innerLimit => {
        try {
          return await findIndexedCommunityRecommendations(query, innerLimit);
        } catch (error) {
          console.warn('[community-search] indexed strategy search failed', error);
          throw error;
        }
      },
      getStrategies,
      wasmArrayTransform: wasmArray,
    }), COMMUNITY_SEARCH_TIMEOUT_MS);

    if (requestId !== latestEnemySearchRequestId) return;
    renderSearchContainer(container, {
      officialMatches,
      includeCommunity,
      communityMatches,
      strategies,
      communityError,
      query,
    });
  } catch (error) {
    console.warn('[enemy-search] failed to render community section', error);
    if (requestId !== latestEnemySearchRequestId) return;
    const officialMatches = findOfficialRecommendationsByEnemyLineup(query, Math.max(3, Math.ceil(limit / 2)));
    renderSearchContainer(container, {
      officialMatches,
      includeCommunity,
      communityError: error?.message || '社区搜索暂不可用',
      query,
    });
  }
}
