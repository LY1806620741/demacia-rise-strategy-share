import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const configPath = new URL('../config.json', import.meta.url);
const rawConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));

function normalizeCommunityConfig(raw = {}) {
  return {
    communitySearchEnabled: raw.community_search_enabled !== false,
    defaultMaxResults: Math.max(1, Number(raw.default_max_results || 8)),
    pointerHint: String(raw.pointer_hint || '通过指针 CID 同步社区索引'),
  };
}

const community = normalizeCommunityConfig(rawConfig.community || {});
assert.equal(community.communitySearchEnabled, true, '社区搜索应默认开启');
assert.equal(community.defaultMaxResults, 8, '社区搜索默认结果数应为 8');
assert.match(community.pointerHint, /指针 CID|社区索引/, '应保留当前索引同步提示文案');

console.log('community-config defaults: ok');
