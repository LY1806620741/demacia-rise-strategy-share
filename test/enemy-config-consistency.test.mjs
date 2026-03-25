import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const configPath = path.resolve('./config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function normalizeLineupToken(token) {
  const normalized = String(token || '').trim().replace(/^[\[\]()（）]+|[\[\]()（）]+$/g, '');
  if (!normalized) return '';
  return normalized.toLowerCase()
    .replace(/[\s]*([x×*])[\s]*\d+$/i, '')
    .replace(/[\s]+\d+$/i, '')
    .replace(/^[+＋*×:：]+|[+＋*×:：]+$/g, '')
    .trim();
}

const canonicalEnemies = [
  '云霄亚龙',
  '龙犬',
  '石甲虫',
  '雪人',
  '残渊雪人',
  '龙蜥',
  '诺克萨斯步兵',
  '诺克萨斯重击兵',
  '诺克萨斯龙犬',
  '诺克萨斯战斗法师',
  '部落战士',
  '巨魔',
  '精锐石甲虫',
  '精锐巨魔',
];

const enemyNames = new Set((config.enemies || []).flatMap(enemy => [enemy.id, enemy.name, ...(enemy.aliases || [])].map(value => String(value || '').toLowerCase())));
for (const name of canonicalEnemies) {
  assert.ok(enemyNames.has(name.toLowerCase()), `canonical enemy missing from config: ${name}`);
}
assert.ok(!(config.enemies || []).some(enemy => enemy.id === 'noxian_soldier'), '诺克萨斯士兵不应再作为独立 enemy 保留');
assert.ok(!(config.units?.demacia || []).some(unit => unit.id === 'vanguard'), '无畏先锋不应再作为独立防守单位保留');
assert.ok((config.units?.demacia || []).some(unit => unit.id === 'soldier' && (unit.aliases || []).includes('无畏先锋')), '士兵应承担无畏先锋别名');

for (const entry of config.town_defense_recommendations || []) {
  for (const wave of entry.waves || []) {
    const tokens = String(wave.incoming_enemy_text || '')
      .split(/[，,；;\n\t|/]/)
      .map(chunk => normalizeLineupToken(chunk))
      .filter(Boolean);

    for (const token of tokens) {
      assert.ok(enemyNames.has(token), `官方推荐敌人文本未在 enemies 中定义: ${token}`);
    }
  }
}

console.log('enemy-config consistency: ok');
