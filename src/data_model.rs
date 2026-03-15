use serde::{Deserialize, Serialize};
use uuid::Uuid;
use wasm_bindgen::prelude::*;

// --- 官方数据 (来自 GitHub) ---
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct OfficialHero {
    pub id: String,
    pub name: String,
    pub hp: u32,
    pub attack: u32,
    pub role: String,
}

#[derive(Debug, PartialEq, Clone, Serialize, Deserialize)]
pub struct OfficialBuilding {
    pub id: String,
    pub name: String,
    pub cost_gold: u32,
    pub cost_petricite: u32,
    pub effect: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfficialDataSet {
    pub version_hash: String,
    pub heroes: Vec<OfficialHero>,
    pub buildings: Vec<OfficialBuilding>,
}

// --- 野生数据 (用户生成) ---
#[derive(Debug, PartialEq, Clone, Serialize, Deserialize)]
pub enum StrategyType {
    CounterComposition,   // 针对阵容
    RushBuild,            // 速冲建筑
    ResourceOptimization, // 资源优化
}

#[derive(Debug, PartialEq, Clone, Serialize, Deserialize)]
pub struct WildStrategy {
    pub id: String,
    pub title: String,
    pub description: String,
    pub strategy_type: StrategyType,
    pub creator_peer_id: String,            // 模拟 Peer ID
    pub target_official_id: Option<String>, // 关联的官方对象 ID
    pub likes: u64,
    pub dislikes: u64,
    pub created_at: u64, // Timestamp
    pub is_synced: bool, // 是否已广播
}

impl WildStrategy {
    pub fn new(
        title: String,
        description: String,
        s_type: StrategyType,
        target: Option<String>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            title,
            description,
            strategy_type: s_type,
            creator_peer_id: "local-user".to_string(), // 实际应从 libp2p 获取
            target_official_id: target,
            likes: 0,
            dislikes: 0,
            created_at: js_sys::Date::now() as u64,
            is_synced: false,
        }
    }
}

// --- 合并视图 (用于渲染) ---
#[derive(Debug, PartialEq, Clone)]
pub struct DisplayItem {
    pub source: DataSource,
    pub score: f64,
}

#[derive(Debug, PartialEq, Clone)]
pub enum DataSource {
    Hero(OfficialHero),
    Building(OfficialBuilding),
    Strategy(WildStrategy),
}

impl DisplayItem {
    pub fn calculate_score(&self) -> f64 {
        match &self.source {
            DataSource::Hero(_) | DataSource::Building(_) => 1000.0, // 官方基础分
            DataSource::Strategy(s) => {
                let like_score = s.likes as f64 * 1.0;
                let dislike_penalty = s.dislikes as f64 * 2.0;
                // 简单的时间衰减 (可选)
                like_score - dislike_penalty
            }
        }
    }

    pub fn title(&self) -> String {
        match &self.source {
            DataSource::Hero(h) => format!("🛡️ [官方] {}", h.name),
            DataSource::Building(b) => format!("🏰 [官方] {}", b.name),
            DataSource::Strategy(s) => {
                let badge = if s.likes > 50 {
                    "🔥 [社区推荐] "
                } else {
                    "📝 [社区] "
                };
                format!("{}{}", badge, s.title)
            }
        }
    }
}
