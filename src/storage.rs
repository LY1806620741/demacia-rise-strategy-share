use crate::data_model::WildStrategy;
use web_sys::console;
use serde_json;

pub static mut STRATEGIES: Vec<WildStrategy> = Vec::new();

pub fn add_local_strategy(mut s: WildStrategy) {
    s.score = crate::engine::calculate_score(&s);
    unsafe {
        STRATEGIES.retain(|exist| exist.id != s.id);
        STRATEGIES.push(s.clone());
    }
    // 索引增量更新
    crate::search::index_strategy(&s);
}


pub fn vote_strategy(id: &str, is_like: bool) {
    unsafe {
        for s in &mut STRATEGIES {
            if s.id == id {
                if is_like { s.likes += 1; } else { s.dislikes += 1; }
                s.score = crate::engine::calculate_score(s);
                // 分数变化也会影响检索排序（boost），所以更新索引
                crate::search::index_strategy(s);
                return;
            }
        }
    }
}



pub fn add_remote_strategy_from_json(json: &str) {
    match serde_json::from_str::<WildStrategy>(json) {
        Ok(s) => {
            unsafe {
                for exist in &STRATEGIES {
                    if exist.id == s.id {
                        return; // 已存在则忽略
                    }
                }
                STRATEGIES.push(s.clone());
            }
            // 增量更新索引
            crate::search::index_strategy(&s);

            console::log_1(&"✅ P2P：已同步外部策略".into());
        }
        Err(_) => console::log_1(&"❌ P2P：数据格式错误".into()),
    }
}
