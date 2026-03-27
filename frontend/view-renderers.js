import { byId, wasmArray, escapeHtml, highlight } from './utils.js';
import { getHeroes, getOfficialLineups, getResolvedTownDefenseRecommendations } from './data.js';
import { renderUnitHint } from './unit-tooltips.js';
import { getIpfsStatus } from './ipfs-client.js';
import { normalizeCommunityStrategyRecord } from './strategy-schema.js';
import { state } from './state.js';

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
      <span>${renderUnitHint(unit.name, unit.description || '')}${unit.isHero ? '（英雄）' : ''}</span>
      <button type="button" onclick="removeCounterUnit(${index})" style="padding:0 .35rem;line-height:1;">×</button>
    </div>
  `).join('');
}

export function updateDashboard({ state, getStrategies }) {
  const strategies = wasmArray(getStrategies());
  const communityCount = byId('community-strategy-count');
  const localCount = byId('local-strategy-count');
  if (communityCount) communityCount.textContent = String(strategies.length);
  if (localCount) localCount.textContent = String(strategies.length);
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
  if (scope === 'community') {
    results = results.map(normalizeCommunityStrategyRecord).slice(0, limit).map(item => ({
      doc_type: 'strategy',
      title: item.description || item.title || '未命名策略',
      snippet: [item.target, item.counter_lineup, item.counter_tech, item.description].filter(Boolean).join(' · '),
    }));
  }
  if (scope !== 'all') results = results.filter(item => item.doc_type === (scope === 'community' ? 'strategy' : scope));
  container.innerHTML = results.length
    ? results.map(item => `<div style="padding:.8rem;border:1px solid #333;border-radius:8px;margin-bottom:.6rem;background:#171717;"><div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center;"><strong>${highlight(escapeHtml(item.title || ''), q)}</strong><span class="muted">${escapeHtml(item.doc_type || '')}</span></div><div class="muted" style="margin-top:.4rem;">${highlight(escapeHtml(item.snippet || ''), q)}</div></div>`).join('')
    : '<div class="muted">没有找到相关结果</div>';
}

export async function renderIpfsStatus() {
  const container = byId('ipfs-status-container');
  if (!container) return;
  const status = await getIpfsStatus();
  state.ipfs = {
    ...state.ipfs,
    ready: status.ready,
    peerId: status.id,
    addresses: status.addresses,
    addressCount: status.addressCount,
    canProvide: status.canProvide,
    canPin: status.canPin,
    publishedCids: status.publishedCids,
    pinnedCids: status.pinnedCids,
    lastPublishedCid: status.lastPublishedCid,
    lastPinnedCid: status.lastPinnedCid,
    lastError: status.lastError,
    providerStatus: status.providerStatus,
  };
  if (!status.ready) {
    container.innerHTML = `<div style="font-size:.92em;line-height:1.7;color:#ff8a80;">
      <strong>IPFS 状态</strong><br>
      未连接：${escapeHtml(status.lastError || '初始化失败')}<br>
      当前无法作为社区数据提供者
    </div>`;
    return;
  }
  container.innerHTML = `<div style="font-size:.92em;line-height:1.7;">
    <strong>IPFS 状态</strong><br>
    Peer ID: <span style="word-break:break-all;">${escapeHtml(status.id)}</span><br>
    地址数: ${status.addressCount}<br>
    提供者状态: <span style="color:${status.canProvide ? '#8bc34a' : '#ffd54f'};">${escapeHtml(status.providerStatus)}</span><br>
    已发布: ${status.publishedCids.length} 条<br>
    已固定: ${status.pinnedCids.length} 条
  </div>`;
}

export function renderCommunityIndexStatus(index, pointerCid = '', message = '', knownPointers = []) {
  const container = byId('community-index-status');
  if (!container) return;
  const itemCount = Array.isArray(index?.items) ? index.items.length : 0;
  const pinnedCount = Array.isArray(index?.items) ? index.items.filter(item => item.pinned === true).length : 0;
  const updatedAt = index?.updatedAt ? new Date(index.updatedAt).toLocaleString() : '未记录';
  const pointerLine = pointerCid ? `当前共享 pointer：<span style="word-break:break-all;">${escapeHtml(pointerCid)}</span><br>` : '';
  const knownLine = knownPointers.length ? `已知共享入口：${knownPointers.length} 个<br>` : '已知共享入口：0 个<br>';
  const providerLine = state.ipfs.ready
    ? `本机提供状态：<span style="color:${state.ipfs.canProvide ? '#8bc34a' : '#ffd54f'};">${escapeHtml(state.ipfs.providerStatus || (state.ipfs.canProvide ? '在线，可提供社区数据' : '已连接，待发布后可提供'))}</span><br>`
    : `本机提供状态：<span style="color:#ff8a80;">IPFS 未连接</span><br>`;
  const discoveryLine = `发现方式：${escapeHtml(state.communitySync.discoverySource || 'local')}${state.communitySync.redisRegistered ? '（已登记 Redis 引导）' : ''}<br>`;
  const communityPinsLine = `在线副本总数：${Number(state.communityPins?.totalReplicas || 0)}<br>存在在线副本的策略：${Number(state.communityPins?.replicatedStrategyCount || 0)}<br>`;
  const messageLine = message ? `<div style="margin-top:.35rem;color:#9fd3ff;">${escapeHtml(message)}</div>` : '';
  container.innerHTML = `本地索引条目：${itemCount}<br>已固定条目：${pinnedCount}<br>${pointerLine}${knownLine}${providerLine}${discoveryLine}${communityPinsLine}最近更新：${escapeHtml(updatedAt)}${messageLine}`;
}
