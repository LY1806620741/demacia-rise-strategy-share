import { byId, wasmArray, escapeHtml, highlight } from './utils.js';
import { getBuildings, getHeroes, getOfficialLineups, getResolvedTownDefenseRecommendations } from './data.js';

export function renderEditorTips() {
  const desc = byId('battle-strategy-desc');
  if (desc) desc.placeholder = '补充你的战术思路、站位、目标优先级、科技搭配与使用时机...';
}

export function renderCounterSelection(selectedCounterUnits) {
  const selected = byId('counter-units-selected');
  if (!selected) return;
  if (!selectedCounterUnits.length) {
    selected.innerHTML = '<div class="muted">拖拽单位到这里</div>';
    return;
  }
  selected.innerHTML = selectedCounterUnits.map((unit, index) => `
    <div style="display:inline-flex;align-items:center;gap:.4rem;background:#213127;border:1px solid #3f6b4f;border-radius:999px;padding:.35rem .65rem;">
      <span>${escapeHtml(unit.name)}${unit.isHero ? '（英雄）' : ''}</span>
      <button type="button" onclick="removeCounterUnit(${index})" style="padding:0 .35rem;line-height:1;">×</button>
    </div>
  `).join('');
}

export function updateDashboard({ state, getStrategies }) {
  const strategies = wasmArray(getStrategies());
  const stateLabel = byId('p2p-network-state');
  const light = byId('p2p-status-light');
  const nodeCount = byId('p2p-node-count');
  const communityCount = byId('community-strategy-count');
  const localCount = byId('local-strategy-count');
  const heroCount = byId('official-hero-count');
  const buildingCount = byId('official-building-count');
  const activeNodeCount = state.knownNodes.size;
  const hasLocalTransport = !!state.p2pChannel || state.p2pNode;

  if (stateLabel) stateLabel.textContent = hasLocalTransport ? (activeNodeCount > 1 ? '已连接' : '在线') : '离线';
  if (light) light.className = `status-light ${hasLocalTransport ? 'online' : 'offline'}`;
  if (nodeCount) nodeCount.textContent = String(activeNodeCount);
  if (communityCount) communityCount.textContent = String(strategies.length);
  if (localCount) localCount.textContent = String(strategies.length);
  if (heroCount) heroCount.textContent = String(getHeroes().length);
  if (buildingCount) buildingCount.textContent = String(getBuildings().length);
}

export function renderOfficialLineups() {
  const container = byId('official-recommendations-container');
  if (!container) return;
  const townRecommendations = getResolvedTownDefenseRecommendations();
  const fallbackCompositions = getOfficialLineups();

  if (townRecommendations.length) {
    container.innerHTML = townRecommendations.map(entry => `
      <div style="background:#171717;border:1px solid #333;border-radius:12px;padding:1rem;display:grid;gap:.85rem;">
        <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;">
          <div>
            <h4 style="margin:0;color:#ffd54f;">${escapeHtml(entry.town.name)}</h4>
            <div class="muted" style="margin-top:.2rem;">地区：${escapeHtml(entry.town.region || entry.region || '未知')}</div>
          </div>
          <span class="muted">${entry.waves.length} 个来袭波次</span>
        </div>
        <div class="muted">${escapeHtml(entry.notes || '暂无额外说明')}</div>
      </div>
    `).join('');
    return;
  }

  container.innerHTML = fallbackCompositions.length
    ? fallbackCompositions.map(comp => `<div style="background:#171717;border:1px solid #333;border-radius:10px;padding:1rem;">${escapeHtml(comp.name)}</div>`).join('')
    : '<div class="muted">暂无官方阵容数据</div>';
}

export function renderHeroList() {
  const list = byId('hero-list');
  if (!list) return;
  const heroes = getHeroes();
  list.innerHTML = heroes.length
    ? heroes.map(hero => `<div style="background:#1b1b1b;border:1px solid #333;border-radius:8px;padding:.8rem;margin-bottom:.6rem;"><strong>${escapeHtml(hero.name)}</strong><div class="muted">${escapeHtml(hero.id)} · ${escapeHtml(hero.type || '')}</div><div style="margin-top:.25rem;">${escapeHtml(hero.description || '')}</div></div>`).join('')
    : '<div class="muted">暂无官方英雄数据</div>';
}

export function renderSearchResults({ searchFn, scopeValue, queryValue, limitValue }) {
  const q = queryValue?.trim() || '';
  const scope = scopeValue || 'all';
  const limit = Math.max(1, Number(limitValue || 8));
  const container = byId('search-results');
  if (!container) return;
  if (!q) {
    container.innerHTML = '<div class="muted">请输入关键词进行检索</div>';
    return;
  }
  let results = wasmArray(searchFn(q, limit));
  if (scope !== 'all') results = results.filter(item => item.doc_type === (scope === 'community' ? 'strategy' : scope));
  container.innerHTML = results.length
    ? results.map(item => `<div style="padding:.8rem;border:1px solid #333;border-radius:8px;margin-bottom:.6rem;background:#171717;"><div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center;"><strong>${highlight(escapeHtml(item.title || ''), q)}</strong><span class="muted">${escapeHtml(item.doc_type || '')}</span></div><div class="muted" style="margin-top:.4rem;">${highlight(escapeHtml(item.snippet || ''), q)}</div></div>`).join('')
    : '<div class="muted">没有找到相关结果</div>';
}
