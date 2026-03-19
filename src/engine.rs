use crate::data_model::WildStrategy;

pub fn calculate_score(s: &WildStrategy) -> f32 {
    let mut score = 0.0;

    // 点赞权重
    score += s.likes as f32 * 2.0;
    score -= s.dislikes as f32 * 3.0;

    // 重要英雄策略权重加成（可扩展）
    if s.target_hero == "garen" {
        score += 10.0;
    }

    score.max(0.0)
}