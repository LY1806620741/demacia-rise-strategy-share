use crate::data_model::{WildStrategy, OfficialDataSet};
use indexed_db_futures::prelude::*;
use serde_json;
use wasm_bindgen::JsValue;
use web_sys::{IdbDatabase, IdbTransactionMode, window}; 

const DB_NAME: &str = "demacia-db";
const STORE_WILD: &str = "wild_strategies";
const KEY_OFFICIAL_HASH: &str = "official_hash";

pub struct StorageManager {
    db: IdbDatabase,
}

impl StorageManager {
    pub async fn init() -> Result<Self, JsValue> {
        let mut db_req = IdbDatabase::open_u32(DB_NAME, 1)?;
        
        db_req.set_on_upgrade_needed(Some(|evt| -> Result<(), JsValue> {
            let db = evt.database();
            if !db.object_store_names().any(|n| n == STORE_WILD) {
                db.create_object_store(STORE_WILD)?;
            }
            Ok(())
        }));

        let db = db_req.await?;
        Ok(Self { db })
    }

    // 保存野生策略
    pub async fn save_strategy(&self, strategy: &WildStrategy) -> Result<(), JsValue> {
        let tx = self.db.transaction_on_one_with_mode(STORE_WILD, IdbTransactionMode::Readwrite)?;
        let store = tx.object_store(STORE_WILD)?;
        let key = JsValue::from_str(&strategy.id);
        let val = serde_wasm_bindgen::to_value(strategy)?;
        store.put_with_key(&val, &key)?;
        tx.await.into_result()?;
        Ok(())
    }

    // 获取所有野生策略
    pub async fn get_all_strategies(&self) -> Result<Vec<WildStrategy>, JsValue> {
        let tx = self.db.transaction_on_one_with_mode(STORE_WILD, IdbTransactionMode::Readonly)?;
        let store = tx.object_store(STORE_WILD)?;
        let all = store.get_all()?.await?;
        
        let mut strategies = Vec::new();
        for item in all.iter() {
            if let Ok(s) = serde_wasm_bindgen::from_value::<WildStrategy>(item.clone()) {
                strategies.push(s);
            }
        }
        Ok(strategies)
    }

    // 更新点赞
    pub async fn update_likes(&self, id: &str, delta_likes: i64, delta_dislikes: i64) -> Result<(), JsValue> {
        let mut strategies = self.get_all_strategies().await?;
        if let Some(s) = strategies.iter_mut().find(|s| s.id == id) {
            if delta_likes > 0 { s.likes = s.likes.saturating_add(delta_likes as u64); }
            if delta_dislikes > 0 { s.dislikes = s.dislikes.saturating_add(delta_dislikes as u64); }
            self.save_strategy(s).await?;
        }
        Ok(())
    }

    // 简单的 LocalStorage 用于存官方 Hash
    pub fn save_official_hash(&self, hash: &str) {
        if let Some(win) = window() {
            if let Ok(ls) = win.local_storage() {
                if let Some(storage) = ls {
                    let _ = storage.set_item(KEY_OFFICIAL_HASH, hash);
                }
            }
        }
    }

    pub fn get_official_hash(&self) -> Option<String> {
        if let Some(win) = window() {
            if let Ok(ls) = win.local_storage() {
                if let Some(storage) = ls {
                    return storage.get_item(KEY_OFFICIAL_HASH).ok().flatten();
                }
            }
        }
        None
    }
}