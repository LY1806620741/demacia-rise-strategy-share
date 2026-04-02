import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildEnemySearchState } from '../frontend/lineup-search-core.js';

const configPath = path.resolve('./config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const query = '雪人 x2, 部落战士 x15, 巨魔 x3';

const result = await buildEnemySearchState({
  entries: config.town_defense_recommendations || [],
  query,
  chapter: 6,
  officialLimit: 4,
  includeCommunity: true,
  limit: 8,
  recommendStrategies: () => {
    throw new Error('local community unavailable');
  },
  getIndexedCommunityMatches: async () => {
    throw new Error('indexed community unavailable');
  },
  getStrategies: () => [],
  wasmArrayTransform: value => value,
});

assert.ok(result.officialMatches.length > 0, '社区搜索失败时，仍应返回官方匹配结果');
assert.equal(result.officialMatches[0].townName, '鹰石镇', '社区异常不应影响官方最佳匹配结果');
assert.equal(result.officialMatches[0].chapter, 5, '官方最佳匹配应保留真实章节');
assert.deepEqual(result.communityMatches, [], '社区异常时不应生成伪社区结果');
assert.equal(result.communityError, 'local community unavailable', '应暴露首个社区异常，便于 UI 提示降级原因');
assert.equal(result.hasAnyMatches, true, '只要官方仍有结果，就不应进入“暂无匹配”状态');

console.log('enemy-search fallback: ok');

const mixedResult = await buildEnemySearchState({
  entries: config.town_defense_recommendations || [],
  query,
  chapter: 5,
  officialLimit: 4,
  includeCommunity: true,
  limit: 8,
  recommendStrategies: () => ([
    {
      strategy_id: 'community-eaglestone-alt',
      similarity_score: 0.62,
      counter_lineup: '莫甘娜、加里奥、士兵、士兵',
      counter_tech: '战场扩增、战斗领导术',
      target: query,
      description: '社区备选阵容',
    },
  ]),
  getIndexedCommunityMatches: async () => ([
    {
      strategy_id: 'community-eaglestone-alt',
      similarity_score: 0.74,
      counter_lineup: '莫甘娜、加里奥、士兵、士兵',
      counter_tech: '战场扩增、战斗领导术',
      target: query,
      description: '社区备选阵容',
    },
  ]),
  getStrategies: () => ([
    {
      id: 'community-eaglestone-alt',
      description: '社区备选阵容',
      target: query,
      counter_lineup: '莫甘娜、加里奥、士兵、士兵',
      counter_tech: '战场扩增、战斗领导术',
    },
  ]),
  wasmArrayTransform: value => value,
});

assert.ok(mixedResult.officialMatches.length > 0, '同时搜索社区时，官方结果仍应保留');
assert.ok(mixedResult.communityMatches.length > 0, '同时搜索社区时，应能返回社区匹配结果');
assert.equal(mixedResult.officialMatches[0].townName, '鹰石镇', '官方首条结果应仍然是最佳官方匹配');
assert.equal(mixedResult.communityMatches[0].strategy_id, 'community-eaglestone-alt', '社区结果应在独立列表中保留');
assert.equal(mixedResult.communityError, '', '社区搜索成功时不应产生降级错误');

console.log('enemy-search priority: ok');

const asyncResult = await buildEnemySearchState({
  entries: config.town_defense_recommendations || [],
  query,
  chapter: 5,
  officialLimit: 4,
  includeCommunity: true,
  limit: 8,
  recommendStrategies: async () => ([
    {
      strategy_id: 'async-community-eaglestone',
      similarity_score: 0.58,
      counter_lineup: '加里奥、莫甘娜、士兵',
      counter_tech: '战场扩增',
      target: query,
    },
  ]),
  getIndexedCommunityMatches: async () => [],
  getStrategies: async () => ([
    {
      id: 'async-community-eaglestone',
      description: '异步社区策略',
      target: query,
      counter_lineup: '加里奥、莫甘娜、士兵',
      counter_tech: '战场扩增',
    },
  ]),
  wasmArrayTransform: value => value,
});

assert.equal(asyncResult.officialMatches[0].townName, '鹰石镇', '异步社区源存在时，官方最佳匹配仍应可用');
assert.equal(asyncResult.communityMatches[0].strategy_id, 'async-community-eaglestone', '异步社区源应被正常收集');
assert.equal(asyncResult.strategies[0].id, 'async-community-eaglestone', '异步策略列表应被正常解析');

console.log('enemy-search async community: ok');



