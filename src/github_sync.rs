use crate::data_model::OfficialDataSet;
use reqwest_wasm::Client;
use serde_json;

// 替换为你的 GitHub Raw URL
const OFFICIAL_DATA_URL: &str = "https://raw.githubusercontent.com/LY1806620741/demacia-rise-strategy-share/main/data/official_data.json";

pub async fn fetch_official_data() -> Result<OfficialDataSet, String> {
    let client = Client::new();
    
    // 在实际生产中，这里应该先检查 ETag 或 If-None-Match
    let resp = client.get(OFFICIAL_DATA_URL)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Failed to fetch: {}", resp.status()));
    }

    let text = resp.text().await.map_err(|e| e.to_string())?;
    
    // 如果是开发测试，且 URL 不可达，返回 Mock 数据
    if text.is_empty() || text.contains("404") {
        return Ok(get_mock_data());
    }

    serde_json::from_str(&text).map_err(|e| e.to_string())
}

fn get_mock_data() -> OfficialDataSet {
    OfficialDataSet {
        version_hash: "mock-v1".to_string(),
        heroes: vec![
            crate::data_model::OfficialHero { id: "garen".into(), name: "盖伦".into(), hp: 620, attack: 66, role: "Fighter".into() },
            crate::data_model::OfficialHero { id: "lux".into(), name: "拉克丝".into(), hp: 490, attack: 54, role: "Mage".into() },
        ],
        buildings: vec![
            crate::data_model::OfficialBuilding { id: "barracks".into(), name: "兵营".into(), cost_gold: 100, cost_petricite: 0, effect: "训练士兵".into() },
        ],
    }
}