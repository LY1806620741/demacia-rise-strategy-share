use crate::data_model::WildStrategy;
use wasm_bindgen::JsValue;
use idb::{Database, Factory, TransactionMode, event::VersionChangeEvent, DatabaseEvent, Error as IdBError};

const DB_NAME: &str = "demacia-db";
const DB_VERSION: u32 = 1;
const STORE_WILD: &str = "wild_strategies";

pub struct StorageManager {
    db: Database,
}

impl StorageManager {
    pub async fn init() -> Result<Self, IdBError> {
        let factory = Factory::new()?;
        let mut req = factory.open(DB_NAME, Some(DB_VERSION))?;

        req.on_upgrade_needed(|e| {
            let _ = (|| -> Result<(), IdBError> {
                let db = e.database()?;
                if !db.store_names().contains(&STORE_WILD.into()) {
                    db.create_object_store(STORE_WILD, Default::default())?;
                }
                Ok(())
            })();
        });

        let db = req.await?;
        Ok(Self { db })
    }

    pub async fn save_strategy(&self, s: &WildStrategy) -> Result<(), JsValue> {
        let tx = self.db.transaction(&[STORE_WILD], TransactionMode::ReadWrite)
            .map_err(|e| JsValue::from_str(&format!("{e}")))?;
        let store = tx.object_store(STORE_WILD).map_err(|e| JsValue::from_str(&format!("{e}")))?;
        let val = serde_wasm_bindgen::to_value(s).map_err(|e| JsValue::from_str(&format!("{e}")))?;
        let key = JsValue::from_str(&s.id);
        store.put(&val, Some(&key)).map_err(|e| JsValue::from_str(&format!("{e}")))?;
        tx.await;
        Ok(())
    }

    pub async fn get_all_strategies(&self) -> Result<Vec<WildStrategy>, JsValue> {
        let tx = self.db.transaction(&[STORE_WILD], TransactionMode::ReadOnly)
            .map_err(|e| JsValue::from_str(&format!("{e}")))?;
        let store = tx.object_store(STORE_WILD).map_err(|e| JsValue::from_str(&format!("{e}")))?;
        let req = store.get_all(None, None).map_err(|e| JsValue::from_str(&format!("{e}")))?;
        let arr = req.await.map_err(|e| JsValue::from_str(&format!("{e}")))?;
        let mut res = Vec::new();
        for item in arr.iter() {
            if let Ok(v) = serde_wasm_bindgen::from_value(item.clone()) {
                res.push(v);
            }
        }
        Ok(res)
    }

    pub async fn update_likes(&self, id: &str, dl: i64, dd: i64) -> Result<(), JsValue> {
        let mut strats = self.get_all_strategies().await?;
        for s in &mut strats {
            if s.id == id {
                s.likes = s.likes.saturating_add(dl as u64);
                s.dislikes = s.dislikes.saturating_add(dd as u64);
                break;
            }
        }
        for s in strats {
            self.save_strategy(&s).await?;
        }
        Ok(())
    }
}