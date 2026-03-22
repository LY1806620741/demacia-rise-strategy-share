import { byId, escapeHtml, wasmArray } from './utils.js';

export function buildStrategyTitle(description, target) {
  const desc = (description || '').trim();
  if (desc) return desc.length > 24 ? `${desc.slice(0, 24)}…` : desc;
  return target ? `针对 ${target}` : '未命名策略';
}

export function renderCommunityLineups(getStrategies, onRendered) {
  const list = byId('strategy-list');
  if (!list) return;
  const strategies = wasmArray(getStrategies());
  list.innerHTML = strategies.length
    ? strategies.slice().reverse().map(strategy => `
      <div style="background:#171717;border:1px solid #333;border-radius:10px;padding:1rem;margin-bottom:.8rem;">
        <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center;"><strong>${escapeHtml(strategy.description || strategy.title || '未命名策略')}</strong><span class="muted">评分 ${Number(strategy.score || 0).toFixed(1)}</span></div>
        <div style="margin:.45rem 0;"><strong>敌人阵容：</strong>${escapeHtml(strategy.target_hero || '未填写')}</div>
        <div style="margin:.45rem 0;"><strong>应对阵容：</strong>${escapeHtml(strategy.counter_lineup || '未填写')}</div>
        <div style="margin:.45rem 0;"><strong>科技：</strong>${escapeHtml(strategy.counter_tech || '未填写')}</div>
      </div>
    `).join('')
    : '<div class="muted">暂无社区策略，快发布第一条吧</div>';
  onRendered?.();
}

export function submitBattleStrategy({ state, createStrategy, nowMs, getSelectedTechNames, renderCommunityLineups, searchByEnemyLineup, updateDashboard, renderEnemyEditor, renderCounterSelection, renderBattleTechOptions }) {
  const desc = byId('battle-strategy-desc')?.value?.trim() || '';
  const target = state.enemyLineupDraft.trim();
  const counter = state.selectedCounterUnits.map(unit => unit.name).join(', ');
  const tech = getSelectedTechNames().join(', ') || '未选择科技';
  if (!desc || !target || !counter) {
    window.alert('请至少填写策略描述、敌人阵容和应对阵容。');
    return;
  }
  const id = `strategy-${nowMs()}-${Math.random().toString(36).slice(2, 8)}`;
  const title = buildStrategyTitle(desc, target);
  createStrategy(id, title, desc, target, counter, tech);
  renderCommunityLineups();
  searchByEnemyLineup();
  updateDashboard();
  const descInput = byId('battle-strategy-desc');
  if (descInput) descInput.value = '';
  state.enemyQueue = [];
  state.enemyLineupDraft = '';
  state.selectedCounterUnits = [];
  state.selectedBattleTechs.clear();
  renderEnemyEditor();
  renderCounterSelection();
  renderBattleTechOptions();
}

