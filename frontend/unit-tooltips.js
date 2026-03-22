import { escapeHtml } from './utils.js';

export function renderUnitHint(name, description = '', options = {}) {
  const { titleOnly = false } = options;
  const safeName = escapeHtml(name || '未知单位');
  const safeDescription = escapeHtml(description || '暂无单位说明');
  const hint = `<span class="unit-help" title="${safeDescription}" aria-label="${safeName}说明">?</span>`;
  return titleOnly ? `${safeName}${hint}` : `<span class="unit-with-help"><span>${safeName}</span>${hint}</span>`;
}

