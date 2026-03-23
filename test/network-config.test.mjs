import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const configPath = new URL('../config.json', import.meta.url);
const rawConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));

function normalizeNetworkConfig(raw = {}) {
  const bootstrapSources = Array.isArray(raw.bootstrap_sources)
    ? raw.bootstrap_sources
        .filter(source => source && source.enabled !== false)
        .map(source => ({
          id: source.id || source.name || 'bootstrap-source',
          name: source.name || source.id || '未命名引导源',
          type: source.type || 'bootstrap',
          enabled: source.enabled !== false,
          supportsWasm: source.supports_wasm !== false,
          preferIpv6: !!source.prefer_ipv6,
          dnsaddr: source.dnsaddr || '',
          note: source.note || '',
        }))
    : [];

  return {
    communitySearchEnabled: raw.community_search_enabled !== false,
    defaultMaxResults: Math.max(1, Number(raw.default_max_results || 8)),
    preferIpv6: !!raw.prefer_ipv6,
    stunServers: Array.isArray(raw.stun_servers) ? raw.stun_servers.filter(Boolean) : [],
    bootstrapSources,
    bootstrapNote: raw.bootstrap_note || '',
  };
}

const network = normalizeNetworkConfig(rawConfig.network);
const publicBootstrap = network.bootstrapSources.find(source => source.name === 'bootstrap.libp2p.io');

assert.equal(network.communitySearchEnabled, true, '社区搜索应默认开启');
assert.equal(network.defaultMaxResults, 8, '默认相似策略条数应为 8');
assert.equal(network.preferIpv6, true, '应默认启用 IPv6 优先');
assert.ok(network.stunServers.length >= 1, '应至少配置一个 STUN 服务器');
assert.ok(publicBootstrap, '应包含 bootstrap.libp2p.io 作为公共引导源');
assert.equal(publicBootstrap.supportsWasm, true, '公共引导源应标记为支持 wasm');
assert.equal(publicBootstrap.preferIpv6, true, '公共引导源应标记 IPv6 优先');
assert.equal(publicBootstrap.dnsaddr, '/dnsaddr/bootstrap.libp2p.io', '应保留 dnsaddr 配置');

console.log('network-config: ok');

