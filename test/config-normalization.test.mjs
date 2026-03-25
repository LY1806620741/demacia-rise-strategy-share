import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const config = JSON.parse(fs.readFileSync(path.resolve('./config.json'), 'utf8'));

for (const entry of config.town_defense_recommendations || []) {
  for (const wave of entry.waves || []) {
    assert.ok(!String(wave.required_tech_text || '').includes('、无畏先锋'), '官方研究文案应使用“士兵升级（无畏先锋）”而非独立单位表达');
    assert.ok(!String(wave.incoming_enemy_text || '').includes('诺克萨斯士兵*'), '官方敌方阵容文本应统一使用“诺克萨斯步兵”');
  }
}

assert.ok((config.units?.demacia || []).some(unit => unit.id === 'soldier' && (unit.aliases || []).includes('无畏先锋')), '士兵应承载无畏先锋别名');
assert.ok((config.enemies || []).some(enemy => enemy.id === 'noxian_infantry' && enemy.name === '诺克萨斯步兵'), '诺克萨斯步兵应为唯一 canonical 敌人记录');

console.log('config normalization: ok');
