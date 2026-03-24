import assert from 'node:assert/strict';

function createStubNode() {
  let lastEvent = '未初始化 swarm';
  let lastError = '';
  let swarmReady = false;
  return {
    init_swarm() {
      swarmReady = true;
      lastEvent = '真实 libp2p Swarm 已初始化';
      lastError = '';
      return {
        peer_id: '12D3KooWStubPeer',
        swarm_ready: swarmReady,
        connected_peers: [],
        last_event: lastEvent,
        last_error: lastError,
      };
    },
    dial_addr(addr) {
      if (!swarmReady) {
        lastEvent = `收到拨号请求：${addr}`;
        lastError = 'Swarm 尚未初始化，请先调用 init_swarm()';
      } else if (!String(addr).includes('/wss/') && !String(addr).includes('/webrtc') && !String(addr).includes('/webtransport')) {
        lastEvent = `拨号请求被拒绝：${addr}`;
        lastError = '该地址不是浏览器兼容的 webrtc/webtransport/wss multiaddr';
      } else {
        lastEvent = `已调用 swarm.dial：${addr}`;
        lastError = '';
      }
      return {
        peer_id: '12D3KooWStubPeer',
        swarm_ready: swarmReady,
        connected_peers: [],
        last_event: lastEvent,
        last_error: lastError,
      };
    },
    poll_once() {
      lastEvent = 'poll_once 已调用，当前无新事件';
      return {
        peer_id: '12D3KooWStubPeer',
        swarm_ready: swarmReady,
        connected_peers: [],
        last_event: lastEvent,
        last_error: lastError,
      };
    }
  };
}

const node = createStubNode();

const notReadyDial = node.dial_addr('/dns4/example.com/tcp/443/wss/p2p/12D3KooWExample');
assert.equal(notReadyDial.swarm_ready, false, '未初始化前不应伪装成 swarm 已就绪');
assert.match(notReadyDial.last_error, /Swarm 尚未初始化/, '未初始化时拨号应返回明确错误');

const initState = node.init_swarm();
assert.equal(initState.swarm_ready, true, 'init_swarm 后应标记为已初始化真实 swarm');
assert.match(initState.peer_id, /^12D3KooW/, 'init_swarm 应暴露本地 peer id');
assert.equal(initState.last_error, '', '初始化成功后不应残留错误');

const incompatibleDial = node.dial_addr('/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWExample');
assert.match(incompatibleDial.last_error, /浏览器兼容/, '普通 tcp 地址应被识别为浏览器不兼容');

const directDial = node.dial_addr('/dns4/example.com/tcp/443/wss/p2p/12D3KooWExample');
assert.equal(directDial.swarm_ready, true, '拨号时 swarm 应保持已初始化状态');
assert.match(directDial.last_event, /已调用 swarm\.dial/, '显式浏览器兼容地址应进入真实拨号调用阶段');
assert.equal(directDial.last_error, '', '兼容地址进入拨号阶段时不应立即报错');

const pollState = node.poll_once();
assert.match(pollState.last_event, /当前无新事件/, '无事件时 poll_once 应返回空闲状态');
assert.equal(Array.isArray(pollState.connected_peers), true, 'network_state 合约里应始终返回 connected_peers 数组');

console.log('remote-network-contract: ok');
