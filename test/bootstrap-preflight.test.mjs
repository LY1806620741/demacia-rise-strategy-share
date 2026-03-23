import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const configPath = new URL('../config.json', import.meta.url);
const rawConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
const source = rawConfig.network.bootstrap_sources.find(item => item.name === 'bootstrap.libp2p.io');

function classifyBootstrapAttempt(candidate) {
  const value = String(candidate || '').trim();
  if (!value) {
    return { status: '配置错误', network_status: '未拨号' };
  }
  if (value.startsWith('/dnsaddr/')) {
    return { status: '拨号预检完成', network_status: '等待 DNSADDR 解析' };
  }
  const browserCompatible = value.includes('/webrtc') || value.includes('/webtransport') || value.includes('/wss/') || value.endsWith('/wss');
  return {
    status: '拨号预检完成',
    network_status: browserCompatible ? '可尝试拨号' : '协议不兼容',
  };
}

assert.ok(source, '应存在 bootstrap.libp2p.io 配置');
const result = classifyBootstrapAttempt(source.dnsaddr);
assert.equal(result.status, '拨号预检完成', '公共 bootstrap 应进入真实拨号预检阶段');
assert.equal(result.network_status, '等待 DNSADDR 解析', 'dnsaddr 引导源应明确等待 DNSADDR 解析，而不是伪装成已组网');

const directBrowserAddr = classifyBootstrapAttempt('/dns4/example.com/tcp/443/wss/p2p/12D3KooWExample');
assert.equal(directBrowserAddr.network_status, '可尝试拨号', '浏览器可达的 wss 地址应标记为可尝试拨号');

const incompatibleAddr = classifyBootstrapAttempt('/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWExample');
assert.equal(incompatibleAddr.network_status, '协议不兼容', '普通 tcp 地址不应被误判成浏览器可直接拨号');

console.log('bootstrap-preflight: ok');

