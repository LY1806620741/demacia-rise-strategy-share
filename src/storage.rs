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

pub fn add_remote_strategy(s: WildStrategy) {
    upsert_strategy(s, false);
}

pub fn add_remote_strategy_from_json(json: &str) {
    match serde_json::from_str::<WildStrategy>(json) {
        Ok(s) => {
            add_remote_strategy(s);
            console::log_1(&"✅ P2P：已同步外部策略".into());
        }
        Err(_) => console::log_1(&"❌ P2P：数据格式错误".into()),
    }
}

pub fn import_remote_strategies_from_json(json: &str) -> usize {
    match serde_json::from_str::<Vec<WildStrategy>>(json) {
        Ok(strategies) => {
            let count = strategies.len();
            for strategy in strategies {
                add_remote_strategy(strategy);
            }
            count
        }
        Err(_) => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_strategy(id: &str, title: &str) -> WildStrategy {
        WildStrategy {
            id: id.into(),
            title: title.into(),
            description: "desc".into(),
            target_hero: "敌人阵容A".into(),
            counter_lineup: "卫兵, 游侠".into(),
            counter_tech: "战场扩增".into(),
            likes: 1,
            dislikes: 0,
            score: 12.0,
        }
    }

    #[test]
    fn bulk_import_upserts_remote_history() {
        STRATEGIES.lock().unwrap().clear();

        let payload = serde_json::to_string(&vec![
            sample_strategy("sync-1", "旧标题"),
            sample_strategy("sync-2", "第二条"),
        ]).unwrap();
        assert_eq!(import_remote_strategies_from_json(&payload), 2);
        assert_eq!(get_strategies_snapshot().len(), 2);

        let updated = serde_json::to_string(&vec![sample_strategy("sync-1", "新标题")]).unwrap();
        assert_eq!(import_remote_strategies_from_json(&updated), 1);

        let strategies = get_strategies_snapshot();
        assert_eq!(strategies.len(), 2);
        assert!(strategies.iter().any(|s| s.id == "sync-1" && s.title == "新标题"));
    }
}
