use crate::data_model::WildStrategy;
use once_cell::sync::Lazy;
use serde_json;
use std::sync::Mutex;
use web_sys::console;

pub static STRATEGIES: Lazy<Mutex<Vec<WildStrategy>>> = Lazy::new(|| Mutex::new(Vec::new()));

fn upsert_strategy(mut s: WildStrategy, recalculate_score: bool) {
    if recalculate_score {
        s.score = crate::engine::calculate_score(&s);
    }

    let mut strategies = STRATEGIES.lock().unwrap();
    strategies.retain(|exist| exist.id != s.id);
    strategies.push(s.clone());
    drop(strategies);

    crate::search::index_strategy(&s);
}

pub fn get_strategies_snapshot() -> Vec<WildStrategy> {
    STRATEGIES.lock().unwrap().clone()
}

pub fn add_local_strategy(s: WildStrategy) {
    upsert_strategy(s, true);
}

pub fn vote_strategy(id: &str, is_like: bool) {
    let mut strategies = STRATEGIES.lock().unwrap();
    if let Some(s) = strategies.iter_mut().find(|s| s.id == id) {
        if is_like { s.likes += 1; } else { s.dislikes += 1; }
        s.score = crate::engine::calculate_score(s);
        let updated = s.clone();
        drop(strategies);
        crate::search::index_strategy(&updated);
    }
}

pub fn add_remote_strategy_from_json(json: &str) {
    match serde_json::from_str::<WildStrategy>(json) {
        Ok(s) => {
            let already_exists = STRATEGIES.lock().unwrap().iter().any(|exist| exist.id == s.id);
            if already_exists {
                return;
            }

            upsert_strategy(s, true);
            console::log_1(&"✅ P2P：已同步外部策略".into());
        }
        Err(_) => console::log_1(&"❌ P2P：数据格式错误".into()),
    }
}
