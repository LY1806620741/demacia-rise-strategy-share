import { byId, escapeHtml, wasmArray } from './utils.js';
import {
  uploadCommunityStrategy,
  fetchCommunityStrategies,
  addFavorite,
  removeFavorite,
  getFavorites,
  searchStrategies,
  getPublishedCids,
  getPinnedCids,
} from './ipfs-client.js';
import { createCommunityStrategyRecord, normalizeCommunityStrategyRecord, calculateStrategySimilarity } from './strategy-schema.js';

export function buildStrategyTitle(description, target) {
  const desc = (description || '').trim();
  if (desc) return desc.length > 24 ? `${desc.slice(0, 24)}…` : desc;
  return target ? `针对 ${target}` : '未命名策略';
}

export function renderCommunityLineups(getStrategies, { onRendered, onVote, onPin } = {}) {
  const list = byId('strategy-list');
  if (!list) return;
  const published = new Set(getPublishedCids());
  const pinned = new Set(getPinnedCids());
  const strategies = wasmArray(getStrategies()).map(normalizeCommunityStrategyRecord);
  list.innerHTML = strategies.length
    ? strategies.slice().reverse().map(strategy => {
      const isPublishedHere = published.has(strategy.cid);
      const isPinned = pinned.has(strategy.cid) || strategy.pinned === true;
      return `
      <div style="background:#171717;border:1px solid #333;border-radius:10px;padding:1rem;margin-bottom:.8rem;">
        <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center;flex-wrap:wrap;">
          <strong>${escapeHtml(strategy.description || strategy.title || '未命名策略')}</strong>
          <span class="muted">评分 ${Number(strategy.score || 0).toFixed(1)}</span>
        </div>
        <div style="margin:.45rem 0;"><strong>敌方阵营：</strong>${escapeHtml(strategy.target || '未填写')}</div>
        <div style="margin:.45rem 0;"><strong>阵容：</strong>${escapeHtml(strategy.counter_lineup || '未填写')}</div>
        <div style="margin:.45rem 0;"><strong>研究：</strong>${escapeHtml(strategy.counter_tech || '未填写')}</div>
        <div class="muted"><strong>诀窍：</strong>${escapeHtml(strategy.description || '未填写')}</div>
        <div class="muted" style="margin-top:.45rem;word-break:break-all;">
          CID：${escapeHtml(strategy.cid || '未发布')}
          ${isPublishedHere ? ' · <span style="color:#8bc34a;">当前节点正在提供</span>' : ''}
          ${isPinned ? ' · <span style="color:#4fc3f7;">已固定</span>' : ''}
        </div>
        <div style="display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap;">
          <button type="button" onclick="voteStrategy('${strategy.id}', true)">👍 ${strategy.likes || 0}</button>
          <button type="button" onclick="voteStrategy('${strategy.id}', false)">👎 ${strategy.dislikes || 0}</button>
          <button type="button" onclick="pinCommunityStrategy('${strategy.cid}')">📌 ${isPinned ? '已固定' : '固定并继续提供'}</button>
        </div>
      </div>`;
    }).join('')
    : '<div class="muted">暂无社区策略，快发布第一条吧</div>';
  onRendered?.();
  onVote?.();
  onPin?.();
}

export async function submitBattleStrategy({ state, nowMs, getSelectedTechNames, renderCommunityLineups, searchByEnemyLineup, updateDashboard, renderEnemyEditor, renderCounterSelection, renderBattleTechOptions, onCreated }) {
  const strategyObj = createCommunityStrategyRecord({
    id: `strategy-${nowMs()}`,
    title: buildStrategyTitle(state.strategyNotes || '', state.enemyLineupDraft || ''),
    target: state.enemyLineupDraft || '',
    counter: state.selectedCounterUnits || [],
    research: getSelectedTechNames() || [],
    notes: state.strategyNotes || '',
    createdAt: nowMs(),
    likes: 0,
    dislikes: 0,
  });
  const cid = await create_strategy(strategyObj);
  const created = normalizeCommunityStrategyRecord({ ...strategyObj, cid });
  await onCreated?.(created);
  alert(`社区策略已上传，CID: ${cid}`);
  renderCommunityLineups();
  searchByEnemyLineup();
  updateDashboard();
  renderEnemyEditor({ preserveDraft: true });
  renderCounterSelection();
  renderBattleTechOptions();
  return created;
}

export async function loadCommunityStrategies(cidList) {
  return await fetchCommunityStrategies(cidList);
}

export function favoriteStrategy(cid) { addFavorite(cid); }
export function unfavoriteStrategy(cid) { removeFavorite(cid); }
export function getFavoriteStrategies() { return getFavorites(); }

export function searchCommunity(keyword, strategies) {
  return searchStrategies(strategies, keyword);
}

let localStrategies = [];

export function get_strategies() {
  return localStrategies;
}

export async function create_strategy(strategyObj) {
  const normalized = normalizeCommunityStrategyRecord(strategyObj);
  const cid = await uploadCommunityStrategy(normalized);
  const newStrategy = normalizeCommunityStrategyRecord({ ...normalized, cid });
  localStrategies.push(newStrategy);
  const communityCount = document.getElementById('community-strategy-count');
  if (communityCount) communityCount.textContent = String(localStrategies.length);
  return cid;
}

export function syncLocalStrategies(strategies) {
  localStrategies = (Array.isArray(strategies) ? strategies : []).map(normalizeCommunityStrategyRecord);
  const communityCount = document.getElementById('community-strategy-count');
  if (communityCount) communityCount.textContent = String(localStrategies.length);
}

export function recommend_strategies_for_enemy(enemyLineupText, limit = 8) {
  return localStrategies
    .map(strategy => {
      const normalized = normalizeCommunityStrategyRecord(strategy);
      const similarity = calculateStrategySimilarity(normalized, enemyLineupText);
      return {
        ...normalized,
        strategy_id: normalized.id,
        similarity_score: similarity,
      };
    })
    .filter(item => item.similarity_score > 0)
    .sort((a, b) => {
      if (b.similarity_score !== a.similarity_score) return b.similarity_score - a.similarity_score;
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      return (b.createdAt || 0) - (a.createdAt || 0);
    })
    .slice(0, limit);
}

export function vote(id, isLike) {
  const idx = localStrategies.findIndex(s => s.id === id);
  if (idx >= 0) {
    const current = normalizeCommunityStrategyRecord(localStrategies[idx]);
    const next = normalizeCommunityStrategyRecord({
      ...current,
      likes: isLike ? (current.likes || 0) + 1 : current.likes,
      dislikes: isLike ? current.dislikes : (current.dislikes || 0) + 1,
      score: (isLike ? (current.likes || 0) + 1 : (current.likes || 0)) - (isLike ? (current.dislikes || 0) : (current.dislikes || 0) + 1),
    });
    localStrategies[idx] = next;
  }
}

