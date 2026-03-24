use libp2p::{identity, Multiaddr, PeerId, Swarm};
use libp2p::futures::StreamExt;
use libp2p::identify::{Behaviour as IdentifyBehaviour, Config as IdentifyConfig, Event as IdentifyEvent};
use libp2p::swarm::{Config as SwarmConfig, NetworkBehaviour, SwarmEvent};
use libp2p_webrtc_websys::{Config as WebRtcConfig, Transport as WebRtcTransport};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use web_sys::console;

#[derive(Default, Serialize, Deserialize, Clone)]
struct BootstrapConfigInput {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    r#type: String,
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    supports_wasm: bool,
    #[serde(default)]
    prefer_ipv6: bool,
    #[serde(default)]
    dnsaddr: String,
    #[serde(default)]
    note: String,
}

#[derive(Default, Serialize, Deserialize, Clone)]
struct BootstrapStatus {
    id: String,
    name: String,
    r#type: String,
    enabled: bool,
    supports_wasm: bool,
    prefer_ipv6: bool,
    dnsaddr: String,
    note: String,
    status: String,
    network_status: String,
    reason: String,
}

#[derive(NetworkBehaviour)]
struct DemaciaBehaviour {
    identify: IdentifyBehaviour,
}

#[wasm_bindgen]
pub struct P2PNode {
    bootstrap_statuses: Vec<BootstrapStatus>,
    peer_id: String,
    swarm_ready: bool,
    connected_peers: Vec<String>,
    last_event: String,
    last_error: String,
    swarm: Option<Swarm<DemaciaBehaviour>>,
    pending_dial_addr: Option<Multiaddr>,
}

fn empty_network_state(node: &P2PNode) -> JsValue {
    serde_wasm_bindgen::to_value(&serde_json::json!({
        "peer_id": node.peer_id,
        "swarm_ready": node.swarm_ready,
        "connected_peers": node.connected_peers,
        "last_event": node.last_event,
        "last_error": node.last_error,
    })).unwrap_or(JsValue::NULL)
}

fn is_browser_compatible(addr: &Multiaddr) -> bool {
    let rendered = addr.to_string();
    rendered.contains("/webrtc") || rendered.contains("/webtransport") || rendered.contains("/wss/") || rendered.ends_with("/wss")
}

fn classify_bootstrap_attempt(status: &mut BootstrapStatus) {
    let candidate = status.dnsaddr.trim();

    if candidate.is_empty() {
        status.status = "配置错误".into();
        status.network_status = "未拨号".into();
        status.reason = "缺少 dnsaddr，无法发起 bootstrap 尝试".into();
        return;
    }

    if candidate.starts_with("/dnsaddr/") {
        status.status = "无法直拨".into();
        status.network_status = "需外部解析".into();
        status.reason = "当前浏览器 wasm 客户端尚未实现 dnsaddr 解析；该地址不会进入真实 swarm.dial。若要继续组网，需要先把 dnsaddr 解析成显式的 webrtc/webtransport/wss multiaddr 再传入 Rust。".into();
        return;
    }

    match candidate.parse::<Multiaddr>() {
        Ok(addr) => {
            status.status = "拨号预检完成".into();
            if is_browser_compatible(&addr) {
                status.network_status = "可尝试拨号".into();
                status.reason = format!("已完成真实地址解析：{addr}。当前客户端将允许把这个显式地址送入 swarm.dial。", addr = addr);
            } else {
                status.network_status = "协议不兼容".into();
                status.reason = format!("已完成真实地址解析：{addr}。但该地址未体现浏览器 wasm 常用的 webrtc/webtransport/wss 传输，当前客户端大概率无法直接拨通。", addr = addr);
            }
        }
        Err(error) => {
            status.status = "拨号预检失败".into();
            status.network_status = "地址解析失败".into();
            status.reason = format!("已尝试将配置作为真实 bootstrap 地址解析，但失败：{error}");
        }
    }
}

fn validate_bootstrap_source(source: BootstrapConfigInput) -> BootstrapStatus {
    let mut status = BootstrapStatus {
        id: if source.id.is_empty() { "bootstrap-source".into() } else { source.id },
        name: if source.name.is_empty() { "未命名引导源".into() } else { source.name },
        r#type: if source.r#type.is_empty() { "bootstrap".into() } else { source.r#type },
        enabled: source.enabled,
        supports_wasm: source.supports_wasm,
        prefer_ipv6: source.prefer_ipv6,
        dnsaddr: source.dnsaddr,
        note: source.note,
        status: "待验证".into(),
        network_status: "未拨号".into(),
        reason: String::new(),
    };

    if !status.enabled {
        status.status = "已禁用".into();
        status.network_status = "未拨号".into();
        status.reason = "配置已禁用该引导源".into();
        return status;
    }

    if !status.supports_wasm {
        status.status = "不适用".into();
        status.network_status = "未拨号".into();
        status.reason = "该引导源未标记为支持 wasm 浏览器客户端".into();
        return status;
    }

    classify_bootstrap_attempt(&mut status);
    status
}

fn build_swarm() -> (PeerId, Swarm<DemaciaBehaviour>) {
    let id_keys = identity::Keypair::generate_ed25519();
    let peer_id = id_keys.public().to_peer_id();
    let transport = WebRtcTransport::new(WebRtcConfig::new(&id_keys)).boxed();
    let behaviour = DemaciaBehaviour {
        identify: IdentifyBehaviour::new(IdentifyConfig::new("demacia-rise/0.1.0".into(), id_keys.public())),
    };
    let swarm = Swarm::new(transport, behaviour, peer_id, SwarmConfig::with_wasm_executor());
    (peer_id, swarm)
}

#[wasm_bindgen]
impl P2PNode {
    pub fn start() {
        console::log_1(&"📡 P2P 节点启动成功".into());
    }

    #[wasm_bindgen(constructor)]
    pub fn new() -> P2PNode {
        P2PNode {
            bootstrap_statuses: Vec::new(),
            peer_id: "wasm-peer-pending".into(),
            swarm_ready: false,
            connected_peers: Vec::new(),
            last_event: "未初始化 swarm".into(),
            last_error: String::new(),
            swarm: None,
            pending_dial_addr: None,
        }
    }

    pub fn init_swarm(&mut self) -> JsValue {
        let (peer_id, swarm) = build_swarm();
        self.peer_id = peer_id.to_string();
        self.swarm_ready = true;
        self.last_event = "真实 libp2p Swarm 已初始化".into();
        self.last_error.clear();
        self.connected_peers.clear();
        self.pending_dial_addr = None;
        self.swarm = Some(swarm);
        empty_network_state(self)
    }

    pub fn network_state(&self) -> JsValue {
        empty_network_state(self)
    }

    pub fn broadcast_strategy(&self, json: &str) {
        console::log_1(&"🌐 广播到 P2P 网络".into());
        js_p2p_broadcast(json);
    }

    pub fn on_remote_message(&self, json: &str) {
        crate::storage::add_remote_strategy_from_json(json);
    }

    pub fn try_bootstrap(&mut self, config_json: &str) -> JsValue {
        let parsed = serde_json::from_str::<Vec<BootstrapConfigInput>>(config_json).unwrap_or_default();
        self.bootstrap_statuses = parsed.into_iter().map(validate_bootstrap_source).collect();
        serde_wasm_bindgen::to_value(&self.bootstrap_statuses).unwrap_or(JsValue::NULL)
    }

    pub fn bootstrap_status(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.bootstrap_statuses).unwrap_or(JsValue::NULL)
    }

    pub fn dial_addr(&mut self, addr: &str) -> JsValue {
        let parsed = match addr.parse::<Multiaddr>() {
            Ok(addr) => addr,
            Err(error) => {
                self.last_event = format!("拨号请求被拒绝：{addr}");
                self.last_error = format!("地址解析失败：{error}");
                return empty_network_state(self);
            }
        };

        if !is_browser_compatible(&parsed) {
            self.last_event = format!("拨号请求被拒绝：{parsed}");
            self.last_error = "该地址不是浏览器兼容的 webrtc/webtransport/wss multiaddr".into();
            return empty_network_state(self);
        }

        if !self.swarm_ready || self.swarm.is_none() {
            self.last_event = format!("收到拨号请求：{parsed}");
            self.last_error = "Swarm 尚未初始化，请先调用 init_swarm()".into();
            return empty_network_state(self);
        }

        self.pending_dial_addr = Some(parsed.clone());
        self.last_event = format!("准备拨号：{parsed}");
        self.last_error.clear();

        if let Some(swarm) = self.swarm.as_mut() {
            if let Err(error) = swarm.dial(parsed.clone()) {
                self.last_event = format!("拨号失败：{parsed}");
                self.last_error = error.to_string();
            } else {
                self.last_event = format!("已调用 swarm.dial：{parsed}");
            }
        }

        empty_network_state(self)
    }

    pub fn poll_once(&mut self) -> JsValue {
        let Some(swarm) = self.swarm.as_mut() else {
            self.last_event = "poll_once 已调用，但 Swarm 尚未初始化".into();
            return empty_network_state(self);
        };

        match swarm.poll_next_unpin(&mut std::task::Context::from_waker(libp2p::futures::task::noop_waker_ref())) {
            std::task::Poll::Ready(Some(event)) => {
                match event {
                    SwarmEvent::Dialing { peer_id, .. } => {
                        self.last_event = format!("拨号中：{}", peer_id.map(|p| p.to_string()).unwrap_or_else(|| "未知Peer".into()));
                    }
                    SwarmEvent::ConnectionEstablished { peer_id, .. } => {
                        let peer = peer_id.to_string();
                        if !self.connected_peers.iter().any(|item| item == &peer) {
                            self.connected_peers.push(peer.clone());
                        }
                        self.last_event = format!("连接已建立：{peer}");
                        self.last_error.clear();
                    }
                    SwarmEvent::OutgoingConnectionError { peer_id, error, .. } => {
                        self.last_event = format!("对外连接失败：{}", peer_id.map(|p| p.to_string()).unwrap_or_else(|| "未知Peer".into()));
                        self.last_error = error.to_string();
                    }
                    SwarmEvent::ConnectionClosed { peer_id, .. } => {
                        let peer = peer_id.to_string();
                        self.connected_peers.retain(|item| item != &peer);
                        self.last_event = format!("连接已关闭：{peer}");
                    }
                    SwarmEvent::Behaviour(DemaciaBehaviourEvent::Identify(event)) => {
                        match event {
                            IdentifyEvent::Received { peer_id, .. } => {
                                let peer = peer_id.to_string();
                                if !self.connected_peers.iter().any(|item| item == &peer) {
                                    self.connected_peers.push(peer.clone());
                                }
                                self.last_event = format!("收到 identify：{peer}");
                            }
                            other => {
                                self.last_event = format!("identify 事件：{:?}", other);
                            }
                        }
                    }
                    other => {
                        self.last_event = format!("Swarm 事件：{:?}", other);
                    }
                }
            }
            std::task::Poll::Ready(None) => {
                self.last_event = "Swarm 事件流已结束".into();
            }
            std::task::Poll::Pending => {
                self.last_event = "poll_once 已调用，当前无新事件".into();
            }
        }

        empty_network_state(self)
    }
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = js_p2p_broadcast)]
    pub fn js_p2p_broadcast(json: &str);
}