import { byId, escapeHtml, wasmArray } from './utils.js';
import {
  uploadCommunityStrategy,
  fetchCommunityStrategies,
  addFavorite,
  removeFavorite,
  getFavorites,
  searchStrategies
} from './ipfs-client.js';

export function buildStrategyTitle(description, target) {
  const desc = (description || '').trim();
  if (desc) return desc.length > 24 ? `${desc.slice(0, 24)}…` : desc;
  return target ? `针对 ${target}` : '未命名策略';
}

export function renderCommunityLineups(getStrategies, { onRendered, onVote } = {}) {
  const list = byId('strategy-list');
  if (!list) return;
  const strategies = wasmArray(getStrategies());
  list.innerHTML = strategies.length
    ? strategies.slice().reverse().map(strategy => `
      <div style="background:#171717;border:1px solid #333;border-radius:10px;padding:1rem;margin-bottom:.8rem;">
        <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center;"><strong>${escapeHtml(strategy.description || strategy.title || '未命名策略')}</strong><span class="muted">评分 ${Number(strategy.score || 0).toFixed(1)}</span></div>
        <div style="margin:.45rem 0;"><strong>敌方阵营：</strong>${escapeHtml(strategy.target_hero || '未填写')}</div>
        <div style="margin:.45rem 0;"><strong>阵容：</strong>${escapeHtml(strategy.counter_lineup || '未填写')}</div>
        <div style="margin:.45rem 0;"><strong>研究：</strong>${escapeHtml(strategy.counter_tech || '未填写')}</div>
        <div class="muted"><strong>诀窍：</strong>${escapeHtml(strategy.description || '未填写')}</div>
        <div style="display:flex;gap:.5rem;margin-top:.75rem;">
          <button type="button" onclick="voteStrategy('${strategy.id}', true)">👍 ${strategy.likes || 0}</button>
          <button type="button" onclick="voteStrategy('${strategy.id}', false)">👎 ${strategy.dislikes || 0}</button>
        </div>
      </div>
    `).join('')
    : '<div class="muted">暂无社区策略，快发布第一条吧</div>';
  onRendered?.();
  onVote?.();
}

// 提交社区策略
export async function submitBattleStrategy({ state, createStrategy, nowMs, getSelectedTechNames, renderCommunityLineups, searchByEnemyLineup, updateDashboard, renderEnemyEditor, renderCounterSelection, renderBattleTechOptions }) {
  const strategyObj = {
    // 这里根据实际表单/状态结构组织数据
    id: 'strategy-' + nowMs(),
    title: state.strategyTitle || '',
    notes: state.strategyNotes || '',
    target: state.enemyLineupDraft || '',
    counter: state.selectedCounterUnits || [],
    research: getSelectedTechNames() || [],
    createdAt: nowMs(),
    likes: 0,
    dislikes: 0
  };
  const cid = await uploadCommunityStrategy(strategyObj);
  alert('社区策略已上传，CID: ' + cid);
  // 可选：推送到公告板/索引
  renderCommunityLineups();
  updateDashboard();
}

// 拉取社区策略（传入CID列表）
export async function loadCommunityStrategies(cidList) {
  return await fetchCommunityStrategies(cidList);
}

// 收藏/取消收藏
export function favoriteStrategy(cid) { addFavorite(cid); }
export function unfavoriteStrategy(cid) { removeFavorite(cid); }
export function getFavoriteStrategies() { return getFavorites(); }

// 搜索社区策略
export function searchCommunity(keyword, strategies) {
  return searchStrategies(strategies, keyword);
}

// 策略本地缓存（可用IndexedDB/LocalStorage/内存）
let localStrategies = [];

export function get_strategies() {
  // 返回本地缓存的所有策略
  return localStrategies;
}

export async function create_strategy(strategyObj) {
  // 上传到IPFS并加入本地缓存
  const cid = await uploadCommunityStrategy(strategyObj);
  localStrategies.push({ ...strategyObj, cid });
  return cid;
}

export function recommend_strategies_for_enemy(enemyLineupText, limit = 8) {
  // 简单相似度匹配（可优化为更复杂算法）
  const kw = enemyLineupText.trim().toLowerCase();
  return localStrategies
    .map(s => ({
      ...s,
      similarity: s.target?.toLowerCase().includes(kw) ? 1 : 0 // 可扩展为更复杂的匹配
    }))
    .filter(s => s.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export function vote(id, isLike) {
  // 本地投票实现，可扩展为IPFS投票
  const idx = localStrategies.findIndex(s => s.id === id);
  if (idx >= 0) {
    if (isLike) localStrategies[idx].likes = (localStrategies[idx].likes || 0) + 1;
    else localStrategies[idx].dislikes = (localStrategies[idx].dislikes || 0) + 1;
  }
}
