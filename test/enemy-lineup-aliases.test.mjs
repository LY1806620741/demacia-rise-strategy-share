import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const configPath = path.resolve('./config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const LINEUP_ALIASES = new Map([
  ['诺克萨斯士兵', '诺克萨斯步兵'],
  ['诺克萨斯步兵', '诺克萨斯步兵'],
  ['精锐石甲虫', '精锐石甲虫'],
  ['精锐巨魔', '精锐巨魔'],
  ['残渊雪人', '残渊雪人'],
  ['亚龙', '云霄亚龙'],
  ['特殊雪人', '残渊雪人'],
  ['巨魔精锐', '精锐巨魔'],
  ['石甲', '石甲虫'],
  ['无畏先锋', '士兵'],
]);

function resolveEnemyAlias(name) {
  return LINEUP_ALIASES.get(name) || name;
}

function normalizeLineupToken(token) {
  const normalized = String(token || '').trim().replace(/^[\[\]()（）]+|[\[\]()（）]+$/g, '');
  if (!normalized) return '';
  const name = normalized.toLowerCase()
    .replace(/[\s]*([x×*])[\s]*\d+$/i, '')
    .replace(/[\s]+\d+$/i, '')
    .replace(/^[+＋*×:：]+|[+＋*×:：]+$/g, '')
    .trim();
  return resolveEnemyAlias(name);
}

function parseLineupCount(token) {
  const normalized = String(token || '').trim().toLowerCase();
  const explicit = normalized.match(/(?:^|\s|[+＋,，;；|/])(?:x|×|\*)\s*(\d+)$/i)
    || normalized.match(/(?:x|×|\*)\s*(\d+)$/i)
    || normalized.match(/\s+(\d+)$/i);
  return Math.max(1, Number(explicit?.[1] || 1));
}

function parseLineupText(text, pool) {
  const merged = new Map();
  for (const chunk of String(text || '').split(/[，,；;\n\t|/]/).map(item => item.trim()).filter(Boolean)) {
    const rawName = normalizeLineupToken(chunk);
    const count = parseLineupCount(chunk);
    const unit = pool.find(item => [item.name, item.id, ...(item.aliases || [])].map(value => String(value || '').toLowerCase()).includes(rawName));
    const key = unit?.id || rawName;
    const current = merged.get(key) || { id: key, name: unit?.name || rawName, count: 0 };
    current.count += count;
    merged.set(key, current);
  }
  return [...merged.values()];
}

const parsedEnemies = parseLineupText('诺克萨斯士兵*3, 亚龙 x1, 特殊雪人 x2, 巨魔精锐 x1, 石甲 x4', config.enemies || []);
const enemyIds = parsedEnemies.map(item => item.id);
assert.ok(enemyIds.includes('noxian_infantry'), '诺克萨斯士兵别名应解析为诺克萨斯步兵');
assert.ok(enemyIds.includes('cloud_drake'), '亚龙别名应解析为云霄亚龙');
assert.ok(enemyIds.includes('abyssal_yeti'), '特殊雪人别名应解析为残渊雪人');
assert.ok(enemyIds.includes('elite_troll'), '巨魔精锐别名应解析为精锐巨魔');
assert.ok(enemyIds.includes('krug'), '石甲别名应解析为石甲虫');

const parsedDefense = parseLineupText('士兵 x2, 无畏先锋 x1', config.units?.demacia || []);
assert.equal(parsedDefense.length, 1, '无畏先锋应并入士兵，而不是单独成一个单位');
assert.equal(parsedDefense[0].id, 'soldier', '无畏先锋应解析为士兵');
assert.equal(parsedDefense[0].count, 3, '无畏先锋数量应累计到士兵上');

console.log('enemy-lineup aliases: ok');
