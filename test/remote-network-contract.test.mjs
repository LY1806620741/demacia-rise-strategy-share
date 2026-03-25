import assert from 'node:assert/strict';

function normalizeStrategyRecord(raw = {}) {
  const description = String(raw.notes ?? raw.description ?? '').trim();
  const target = String(raw.target ?? raw.target_hero ?? '').trim();
  const counterTech = Array.isArray(raw.research)
    ? raw.research.join('、')
    : String(raw.counter_tech || '').trim();
  return {
    id: String(raw.id || 'strategy-1'),
    target,
    description,
    counter_lineup: Array.isArray(raw.counter) ? raw.counter.map(item => item.name).join('、') : String(raw.counter_lineup || '').trim(),
    counter_tech: counterTech,
    likes: Number(raw.likes || 0),
    dislikes: Number(raw.dislikes || 0),
  };
}

const normalized = normalizeStrategyRecord({
  id: 'strategy-42',
  target: '雪人 x2，部落战士 x15，巨魔 x2',
  counter: [{ name: '天使' }, { name: '盖伦' }, { name: '莫甘娜' }],
  research: ['战场扩增', '战斗领导术'],
  notes: '前排扛住，莫甘娜输出',
  likes: 3,
  dislikes: 1,
});

assert.equal(normalized.id, 'strategy-42', '应保留策略 ID');
assert.equal(normalized.counter_lineup, '天使、盖伦、莫甘娜', '应输出统一的阵容文本');
assert.equal(normalized.counter_tech, '战场扩增、战斗领导术', '应输出统一的研究文本');
assert.equal(normalized.description, '前排扛住，莫甘娜输出', '应统一到 description 字段');
assert.equal(normalized.likes - normalized.dislikes, 2, '评分可基于点赞/点踩差值计算');

console.log('strategy-schema contract: ok');

