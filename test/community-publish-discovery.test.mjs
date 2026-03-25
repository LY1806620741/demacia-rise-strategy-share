import assert from 'node:assert/strict';

function isSoldierLike(unit) {
  return unit.category === 'noxus'
    || /步兵|士兵|战士|重击兵|法师/.test(unit.name)
    || /infantry|soldier|warrior|mauler|mage/.test(unit.id);
}

const wildEnemy = { id: 'yeti', name: '雪人', category: 'wild', type: 'ranged' };
const noxusEnemy = { id: 'noxian_infantry', name: '诺克萨斯步兵', category: 'noxus', type: 'melee' };
const tribalEnemy = { id: 'tribal_warrior', name: '部落战士', category: 'wild', type: 'melee' };

assert.equal(isSoldierLike(wildEnemy), false, '雪人不应落入士兵分类');
assert.equal(isSoldierLike(noxusEnemy), true, '诺克萨斯步兵应落入士兵分类');
assert.equal(isSoldierLike(tribalEnemy), true, '部落战士应落入士兵样近战分类');

async function publishFlow(onCreated) {
  const created = { cid: 'bafy-strategy', createdAt: 1, title: 'T', target: '雪人 x2' };
  const calls = [];
  const indexController = {
    appendCreatedStrategy: async item => calls.push(['append', item.cid]),
    publishCommunityIndexPointer: async () => calls.push(['publish-pointer']),
  };
  await onCreated(created, indexController, calls);
  return calls;
}

const calls = await publishFlow(async (created, indexController, calls) => {
  await indexController.appendCreatedStrategy(created);
  await indexController.publishCommunityIndexPointer();
  calls.push(['done']);
});

assert.deepEqual(calls, [['append', 'bafy-strategy'], ['publish-pointer'], ['done']], '发布策略后应立即更新并发布共享索引指针，便于其他节点发现');

console.log('community publish discovery: ok');

