import { state } from './state.js';
import { byId } from './utils.js';
import { getAllEnemyUnits, getAllDefenseUnits, getTechTree } from './data.js';

export async function loadConfig() {
  const res = await fetch('./config.json');
  state.config = await res.json();
}

export function renderBattleTechOptions() {
  const list = byId('battle-strategy-tech-list');
  const summary = byId('battle-strategy-tech-summary');
  const search = byId('battle-tech-search');
  if (!list || !summary) return;

  const normalized = search?.value?.trim().toLowerCase() || '';
  const chapters = getTechTree();
  const selected = [];
  list.innerHTML = '';

  chapters.forEach(chapter => {
    const matchedTechs = (Array.isArray(chapter.techs) ? chapter.techs : []).filter(tech => {
      const text = `${chapter.name} ${tech.name} ${tech.effect} ${tech.description}`.toLowerCase();
      return !normalized || text.includes(normalized);
    });
    if (!matchedTechs.length) return;

    const block = document.createElement('div');
    block.style.marginBottom = '0.75rem';
    block.innerHTML = `<div style="font-weight:bold;color:#ffd54f;margin-bottom:0.4rem;">主城等级 ${chapter.chapter} · ${chapter.name}</div>`;

    matchedTechs.forEach(tech => {
      if (state.selectedBattleTechs.has(tech.name)) selected.push(tech.name);
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.padding = '0.35rem 0';
      label.style.cursor = 'pointer';
      label.innerHTML = `
        <input type="checkbox" value="${tech.name}" ${state.selectedBattleTechs.has(tech.name) ? 'checked' : ''} />
        <span style="margin-left:0.4rem;"><strong>${tech.name}</strong>：${tech.effect}</span>
        <div class="muted" style="margin-left:1.5rem;font-size:0.85rem;">${tech.description}</div>
      `;
      const checkbox = label.querySelector('input');
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.selectedBattleTechs.add(tech.name);
        else state.selectedBattleTechs.delete(tech.name);
        renderBattleTechOptions();
      });
      block.appendChild(label);
    });

    list.appendChild(block);
  });

  if (!list.children.length) {
    list.innerHTML = '<div class="muted">未找到匹配的科技</div>';
  }

  summary.textContent = selected.length
    ? `已选择科技：${selected.join('、')}`
    : '未选择科技，将默认记为“未选择科技”';
}

export function setupBattleTechPicker() {
  const input = byId('battle-tech-search');
  if (!input) return;
  input.addEventListener('input', renderBattleTechOptions);
}

export function renderEnemyUnitList(filter = '', typeFilter = 'all') {
  const list = byId('enemy-unit-list');
  if (!list) return;
  const normalized = filter.trim().toLowerCase();
  const filtered = getAllEnemyUnits().filter(unit => {
    const matchesSearch = !normalized || unit.name.toLowerCase().includes(normalized) || unit.id.toLowerCase().includes(normalized);
    const matchesType = typeFilter === 'all'
      || (typeFilter === 'soldier' && ['melee', 'ranged'].includes(unit.type))
      || (typeFilter === 'wild' && unit.category === 'wild')
      || (typeFilter === 'noxus' && unit.category === 'noxus')
      || (typeFilter === 'hero' && unit.category === 'hero');
    return matchesSearch && matchesType;
  });

  if (!filtered.length) {
    list.innerHTML = '<div class="muted">未找到符合条件的敌人单位</div>';
    return;
  }

  list.innerHTML = filtered.map(unit => `
    <div style="display:flex;flex-direction:column;justify-content:space-between;background:#222;border:1px solid #444;border-radius:4px;padding:.4rem;min-height:80px;">
      <div>
        <div style="font-weight:bold;">${unit.name}</div>
        <div style="font-size:.8rem;color:#aaa;">${unit.id} / ${unit.type} / ${unit.category}</div>
      </div>
      <button onclick="addEnemyUnit('${unit.id}')" style="margin-top:.25rem;padding:.25rem .4rem;background:#3a8cff;border:none;color:#fff;border-radius:3px;">+ 添加</button>
    </div>
  `).join('');
}

export function setupEnemyUnitPicker() {
  renderEnemyUnitList();

  document.querySelectorAll('.filter-btn').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      renderEnemyUnitList('', button.dataset.filter);
    });
  });
}

export function setupCounterUnitSelection(addCounterUnit) {
  const available = byId('counter-units-available');
  const selected = byId('counter-units-selected');
  if (!available || !selected) return;

  const defenseUnits = getAllDefenseUnits();
  available.innerHTML = '';
  if (!defenseUnits.length) {
    available.innerHTML = '<div class="muted">未加载到可用防守单位</div>';
    return;
  }

  defenseUnits.forEach(unit => {
    const payload = JSON.stringify({ id: unit.id, name: unit.name, isHero: !!unit.isHero });
    const button = document.createElement('button');
    button.type = 'button';
    button.style.cssText = 'padding:0.4rem 0.8rem;background:#2a2a2a;border-radius:4px;cursor:grab;color:#fff;border:1px solid #444;';
    button.textContent = `${unit.name}${unit.isHero ? '（英雄）' : ''}`;
    button.draggable = true;
    button.ondragstart = (e) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', payload);
    };
    button.onclick = () => addCounterUnit(payload);
    available.appendChild(button);
  });

  selected.ondragover = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  selected.ondrop = (e) => {
    e.preventDefault();
    addCounterUnit(e.dataTransfer.getData('text/plain'));
  };
}
