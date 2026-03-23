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
    reason: String,
}

#[wasm_bindgen]
pub struct P2PNode {
    bootstrap_statuses: Vec<BootstrapStatus>,
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
        reason: String::new(),
    };

    if !status.enabled {
        status.status = "已禁用".into();
        status.reason = "配置已禁用该引导源".into();
        return status;
    }

    if !status.supports_wasm {
        status.status = "不适用".into();
        status.reason = "该引导源未标记为支持 wasm 浏览器客户端".into();
        return status;
    }

    if status.dnsaddr.trim().is_empty() {
        status.status = "配置错误".into();
        status.reason = "缺少 dnsaddr，无法发起 bootstrap 尝试".into();
        return status;
    }

    if !status.dnsaddr.starts_with("/dnsaddr/") {
        status.status = "配置错误".into();
        status.reason = "当前仅支持 /dnsaddr/... 形式的 bootstrap 地址".into();
        return status;
    }

    status.status = "已受理".into();
    status.reason = if status.prefer_ipv6 {
        "Rust/WASM 已接受该 bootstrap 配置；当前版本先完成配置校验与状态回传，下一步接真实拨号。".into()
    } else {
        "Rust/WASM 已接受该 bootstrap 配置；当前版本先完成配置校验与状态回传。".into()
    };
    status
}

#[wasm_bindgen]
impl P2PNode {
    pub fn start() {
        console::log_1(&"📡 P2P 节点启动成功".into());
    }

    #[wasm_bindgen(constructor)]
    pub fn new() -> P2PNode {
        P2PNode { bootstrap_statuses: Vec::new() }
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