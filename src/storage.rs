use crate::data_model::*;
use web_sys::console;

pub static mut STRATEGIES: Vec<WildStrategy> = Vec::new();

pub fn add_local_strategy(mut s: WildStrategy) {
    s.score = crate::engine::calculate_score(&s);
    unsafe {
        STRATEGIES.push(s);
    }
    console::log_1(&"策略已保存到本地".into());
}

pub fn vote_strategy(id: &str, like: bool) {
    unsafe {
        for s in &mut STRATEGIES {
            if s.id == id {
                if like { s.likes += 1; } else { s.dislikes +=1; }
                s.score = crate::engine::calculate_score(s);
                console::log_1(&"投票成功".into());
                return;
            }
        }
    }
}