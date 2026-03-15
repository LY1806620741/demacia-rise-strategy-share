use crate::data_model::*;

pub fn calculate_score(s: &WildStrategy) -> f32 {
    (s.likes as f32 * 1.0) - (s.dislikes as f32 * 2.0)
}