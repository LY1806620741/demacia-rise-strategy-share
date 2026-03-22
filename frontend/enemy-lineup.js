import { state } from './state.js';
import { byId, escapeHtml } from './utils.js';
import { getAllEnemyUnits } from './data.js';

export function formatLineup(items) {
  return items.map(item => `${item.name} x${item.count}`).join(', ');
}

export function getEnemyUnitPool() {
  return getAllEnemyUnits();
}

export function normalizeLineupToken(token) {
  const normalized = (token || '').trim().replace(/^[\[\]()（）]+|[\[\]()（）]+$/g, '');
  if (!normalized) return '';
  return normalized.toLowerCase()
    .replace(/[\s]*([x×*])[\s]*\d+$/i, '')
    .replace(/[\s]+\d+$/i, '')
    .replace(/^[+＋*×:：]+|[+＋*×:：]+$/g, '')
    .trim();
}

export function parseLineupCount(token) {
  const normalized = String(token || '').trim().toLowerCase();
  const explicit = normalized.match(/(?:^|\s|[+＋,，;；|/])(?:x|×|\*)\s*(\d+)$/i)
    || normalized.match(/(?:x|×|\*)\s*(\d+)$/i)
    || normalized.match(/\s+(\d+)$/i);
  return Math.max(1, Number(explicit?.[1] || 1));
}

export function normalizedLineupCounts(lineup) {
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

export function parseLineupText(text, pool = getEnemyUnitPool()) {
  const merged = new Map();
  String(text || '')
    .split(/[，,；;\n\t|/]/)
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .forEach(chunk => {
      const rawName = normalizeLineupToken(chunk);
      const count = parseLineupCount(chunk);
      if (!rawName) return;
      const unit = pool.find(item => item.name === rawName || item.id === rawName);
      const key = unit?.id || rawName;
      const current = merged.get(key) || { id: key, name: unit?.name || rawName, count: 0 };
      current.count += count;
      merged.set(key, current);
    });
  return [...merged.values()];
}

export function handleEnemyTextInput(renderEnemyEditor) {
  const input = byId('enemy-lineup-text-input');
  if (!input) return;
  state.enemyLineupDraft = input.value;
  state.enemyQueue = input.value.trim() ? parseLineupText(input.value) : [];
  renderEnemyEditor({ preserveDraft: true });
}

export function renderEnemyEditor(options = {}) {
  const { preserveDraft = false } = options;
  const editor = byId('enemy-units-editor');
  const textInput = byId('enemy-lineup-text-input');
  const dropzone = byId('enemy-lineup-dropzone');
  if (!editor || !dropzone) return;

  if (!state.enemyQueue.length) {
    editor.innerHTML = '<div class="muted">敌人配队将显示在这里</div>';
    dropzone.innerHTML = '<div class="muted">将单位拖拽至此，或在上方输入框编辑</div>';
    if (textInput) textInput.value = preserveDraft ? state.enemyLineupDraft : '';
    return;
  }

  editor.innerHTML = state.enemyQueue.map(item => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;background:#222;border:1px solid #444;border-radius:4px;padding:.45rem .6rem;margin-bottom:.4rem;">
      <div>
        <div style="font-weight:bold;">${escapeHtml(item.name)}</div>
        <div class="muted" style="font-size:.82rem;">${escapeHtml(item.id)} · ${item.count} 个</div>
      </div>
      <div style="display:flex;gap:.35rem;">
        <button type="button" onclick="changeEnemyUnitCount('${item.id}', -1)">-</button>
        <button type="button" onclick="changeEnemyUnitCount('${item.id}', 1)">+</button>
        <button type="button" onclick="removeEnemyUnit('${item.id}')">移除</button>
      </div>
    </div>
  `).join('');

  dropzone.innerHTML = state.enemyQueue.map(item => `
    <span style="display:inline-flex;align-items:center;gap:.35rem;background:#243447;border:1px solid #3d5a73;border-radius:999px;padding:.35rem .7rem;">
      <strong>${escapeHtml(item.name)}</strong>
      <span>x${item.count}</span>
    </span>
  `).join('');

  if (textInput && !preserveDraft) {
    state.enemyLineupDraft = formatLineup(state.enemyQueue);
    textInput.value = state.enemyLineupDraft;
  }
}

export function addEnemyUnit(id, onChange) {
  const unit = getEnemyUnitPool().find(item => item.id === id);
  if (!unit) return;
  const existing = state.enemyQueue.find(item => item.id === id);
  if (existing) existing.count += 1;
  else state.enemyQueue.push({ id: unit.id, name: unit.name, count: 1 });
  state.enemyLineupDraft = formatLineup(state.enemyQueue);
  renderEnemyEditor();
  onChange?.();
}

export function changeEnemyUnitCount(id, delta, onChange) {
  const target = state.enemyQueue.find(item => item.id === id);
  if (!target) return;
  target.count += delta;
  state.enemyQueue = state.enemyQueue.filter(item => item.count > 0);
  state.enemyLineupDraft = formatLineup(state.enemyQueue);
  renderEnemyEditor();
  onChange?.();
}

export function removeEnemyUnit(id, onChange) {
  state.enemyQueue = state.enemyQueue.filter(item => item.id !== id);
  state.enemyLineupDraft = formatLineup(state.enemyQueue);
  renderEnemyEditor();
  onChange?.();
}

