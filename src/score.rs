use wasm_bindgen::prelude::*;
use super::data_model::Strategy;

#[wasm_bindgen]
pub fn calculate_score(strategy: &Strategy) -> f32 {
    let mut score = 0.0;

    if strategy.is_official {
        score += 1000.0;
    }
    if strategy.is_important {
        score += 50.0;
    }

    score += strategy.likes as f32 * 2.0;
    score -= strategy.dislikes as f32 * 3.0;

    let age_days = (js_sys::Date::now() - strategy.timestamp) / (1000.0 * 86400.0);
    let recency = (7.0 - age_days.max(0.0)).max(0.0);
    score += recency * 10.0;

    score
}