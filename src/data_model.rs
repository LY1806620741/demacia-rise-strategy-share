use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OfficialHero {
    pub id: String,
    pub name: String,
    pub hp: u32,
    pub attack: u32,
    pub role: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OfficialBuilding {
    pub id: String,
    pub name: String,
    pub cost_gold: u32,
    pub cost_petricite: u32,
    pub effect: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OfficialDataSet {
    pub version_hash: String,
    pub heroes: Vec<OfficialHero>,
    pub buildings: Vec<OfficialBuilding>,
}

// 你原来的策略结构 👇 完全保留
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WildStrategy {
    pub id: String,
    pub title: String,
    pub description: String,
    pub target_hero: String,
    pub likes: i32,
    pub dislikes: i32,
    pub score: f32,
}