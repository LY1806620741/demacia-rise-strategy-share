use wasm_bindgen::prelude::*;
use web_sys::console;

#[wasm_bindgen]
pub struct P2PNode;

#[wasm_bindgen]
impl P2PNode {
    pub fn start() {
        console::log_1(&"📡 P2P 节点启动成功".into());
    }

    pub fn broadcast_strategy(&self, json: &str) {
        console::log_1(&"🌐 广播到 P2P 网络".into());
        js_p2p_broadcast(json);
    }

    // ✅ 修复：把名字改回你代码在用的 on_remote_message
    pub fn on_remote_message(&self, json: &str) {
        crate::storage::add_remote_strategy_from_json(json);
    }
}

#[wasm_bindgen(module = "/app.js")]
extern "C" {
    pub fn js_p2p_broadcast(json: &str);
}