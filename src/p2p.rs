use libp2p::Multiaddr;
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

#[wasm_bindgen]
pub struct P2PNode {
    bootstrap_statuses: Vec<BootstrapStatus>,
    peer_id: String,
    swarm_ready: bool,
    connected_peers: Vec<String>,
    last_event: String,
    last_error: String,
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
            let rendered = addr.to_string();
            let browser_compatible = rendered.contains("/webrtc") || rendered.contains("/webtransport") || rendered.contains("/wss/") || rendered.ends_with("/wss");
            status.status = "拨号预检完成".into();
            if browser_compatible {
                status.network_status = "可尝试拨号".into();
                status.reason = format!("已完成真实地址解析：{rendered}。该地址看起来包含浏览器可能可用的传输协议，下一步需要把它接入真正的 libp2p swarm 拨号循环。", rendered = rendered);
            } else {
                status.network_status = "协议不兼容".into();
                status.reason = format!("已完成真实地址解析：{rendered}。但该地址未体现浏览器 wasm 常用的 webrtc/webtransport/wss 传输，当前客户端大概率无法直接拨通。", rendered = rendered);
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
        }
    }

    pub fn init_swarm(&mut self) -> JsValue {
        self.swarm_ready = false;
        self.last_event = "当前版本尚未接入真实 libp2p swarm 事件循环".into();
        self.last_error = "下一步需要在 Rust 侧持有 Swarm，并提供 poll_once/dial_addr 生命周期接口。".into();
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
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = js_p2p_broadcast)]
    pub fn js_p2p_broadcast(json: &str);
}