use wasm_bindgen::prelude::*;
use serde_wasm_bindgen::to_value;
mod github_sync;


mod search;
use search as idx;

mod data_model;
mod engine;
mod storage;
mod p2p;

use data_model::*;
use storage::*;
use p2p::*;


use libp2p::{identity, Swarm};
use libp2p::swarm::{NetworkBehaviour, Config as SwarmConfig}; // ✅ 新增：Swarm 配置
use libp2p_webrtc_websys::{Transport as WebRtcTransport, Config as WebRtcConfig};

fn build_swarm<B: NetworkBehaviour>(behaviour: B) -> Swarm<B> {
    let id_keys = identity::Keypair::generate_ed25519();
    let peer_id = id_keys.public().to_peer_id();

    // ✅ 正确构造方式：new(Config::new(&id_keys)) + boxed()
    let transport = WebRtcTransport::new(WebRtcConfig::new(&id_keys)).boxed();

    // ✅ 新 API：用 Swarm::new + wasm 执行器配置
    let swarm = Swarm::new(
        transport,
        behaviour,
        peer_id,
        SwarmConfig::with_wasm_executor(), // 浏览器端用 wasm 执行器
    );

    swarm
}

#[wasm_bindgen]
pub fn load_official_heroes() -> JsValue {
    let data = vec![
        OfficialHero {
            id: "garen".into(),
            name: "盖伦".into(),
            hp: 620,
            attack: 66,
            role: "Tank/Fighter".into(),
        },
        OfficialHero {
            id: "lux".into(),
            name: "拉克丝".into(),
            hp: 520,
            attack: 58,
            role: "Mage".into(),
        },
    ];
    to_value(&data).unwrap()
}

#[wasm_bindgen]
pub fn create_strategy(
    id: &str,
    title: &str,
    desc: &str,
    target: &str,
    lineup: &str,
    tech: &str,
) {
    let mut s = WildStrategy {
        id: id.into(),
        title: title.into(),
        description: desc.into(),
        target_hero: target.into(),
        counter_lineup: lineup.into(),
        counter_tech: tech.into(),
        likes: 0,
        dislikes: 0,
        score: 0.0,
    };

    s.score = engine::calculate_score(&s);
    add_local_strategy(s.clone());

    // P2P 广播（修复版）
    let json = serde_json::to_string(&s).unwrap_or_default();
    let node = P2PNode {};
    node.broadcast_strategy(&json);
}

#[wasm_bindgen]
pub fn vote(id: &str, is_like: bool) {
    vote_strategy(id, is_like);
}

#[wasm_bindgen]
pub fn get_strategies() -> JsValue {
    unsafe { to_value(&STRATEGIES).unwrap() }
}

#[wasm_bindgen]
pub fn p2p_receive_json(json: &str) {
    let node = P2PNode {};
    node.on_remote_message(json);
}

#[wasm_bindgen]
pub fn create_p2p_node() -> P2PNode {
    P2PNode {}
}

#[wasm_bindgen]
pub async fn load_official_data() -> Result<JsValue, JsValue> {
    let data = github_sync::fetch_official_data().await
        .map_err(|e| JsValue::from_str(&e))?;

    // 重建索引：用官方数据 + 现有策略
    let strategies = unsafe { &crate::storage::STRATEGIES };
    idx::rebuild(&data, strategies);

    Ok(serde_wasm_bindgen::to_value(&data)?)
}

#[wasm_bindgen]
pub fn search(query: &str, limit: usize) -> JsValue {
    let hits = idx::query(query, limit.max(1));
    to_value(&hits).unwrap()
}

// 🆕 根据敌人阵容推荐防守策略
#[wasm_bindgen]
pub fn recommend_strategies_for_enemy(enemy_lineup: &str, limit: usize) -> JsValue {
    let strategies = unsafe { &crate::storage::STRATEGIES };
    let recommendations = idx::recommend_counters(enemy_lineup, strategies, limit.max(1));
    
    let result: Vec<_> = recommendations.into_iter()
        .map(|(id, counter, similarity)| {
            serde_json::json!({
                "strategy_id": id,
                "counter_lineup": counter,
                "similarity_score": similarity
            })
        })
        .collect();
    
    to_value(&result).unwrap()
}
