use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct OfficialHero {
    pub id: String,
    pub name: String,
    pub hp: u32,
    pub attack: u32,
    pub role: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct WildStrategy {
    pub id: String,
    pub title: String,
    pub description: String,
    pub target_hero: String,
    pub likes: i32,
    pub dislikes: i32,
    pub score: f32,
}