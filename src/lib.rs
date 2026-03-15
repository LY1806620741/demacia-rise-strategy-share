use wasm_bindgen::prelude::*;
use serde_wasm_bindgen::to_value;

mod data_model;
mod engine;
mod storage;

use data_model::*;
use storage::*;

#[wasm_bindgen]
pub fn load_official_heroes() -> JsValue {
    let data = vec![
        OfficialHero {
            id: "garen".into(),
            name: "盖伦".into(),
            hp: 620,
            attack: 66,
            role: "Tank/Fighter".into(),
        },
        OfficialHero {
            id: "lux".into(),
            name: "拉克丝".into(),
            hp: 520,
            attack: 58,
            role: "Mage".into(),
        },
    ];
    to_value(&data).unwrap()
}

#[wasm_bindgen]
pub fn create_strategy(id: &str, title: &str, desc: &str, target: &str) {
    let s = WildStrategy {
        id: id.into(),
        title: title.into(),
        description: desc.into(),
        target_hero: target.into(),
        likes: 0,
        dislikes: 0,
        score: 0.0,
    };
    add_local_strategy(s);
}

#[wasm_bindgen]
pub fn vote(id: &str, is_like: bool) {
    vote_strategy(id, is_like);
}

#[wasm_bindgen]
pub fn get_strategies() -> JsValue {
    unsafe {
        to_value(&STRATEGIES).unwrap()
    }
}