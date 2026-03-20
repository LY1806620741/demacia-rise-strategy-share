// src/search.rs
use crate::data_model::{OfficialDataSet, WildStrategy};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug)]
pub enum DocKind { Hero, Building, Strategy }

#[derive(Clone, Debug)]
pub struct Doc {
    pub kind: DocKind,
    pub id: String,         // hero.id / building.id / strategy.id
    pub title: String,      // 展示标题
    pub body: String,       // 用于全文检索的合并文本
    pub boost: f32,         // 额外加权：Strategy 用 s.score 做加权
}

#[derive(Default)]
pub struct Inverted {
    // term -> (doc_id -> tf)
    postings: HashMap<String, HashMap<String, f32>>,
    // doc_id -> (length, boost, kind, title, snippet source)
    meta: HashMap<String, (usize, f32, DocKind, String, String)>,
    // df(term)
    df: HashMap<String, usize>,
    // 总文档数
    n_docs: usize,
}

impl Inverted {
    pub fn new() -> Self { Self::default() }

    fn tokenize(s: &str) -> Vec<String> {
        // 极简分词：小写、按非字母数字切分（中英文混合时可按需要扩展）
        let mut out = Vec::new();
        let mut buf = String::new();
        for ch in s.chars() {
            if ch.is_alphanumeric() {
                buf.push(ch.to_ascii_lowercase());
            } else if !buf.is_empty() {
                out.push(buf.clone()); buf.clear();
            }
        }
        if !buf.is_empty() { out.push(buf); }
        out
    }

    fn add_doc(&mut self, d: Doc) {
        let tokens = Self::tokenize(&d.body);
        let len = tokens.len();
        if len == 0 { return; }

        let mut tf: HashMap<String, f32> = HashMap::new();
        for t in tokens {
            *tf.entry(t).or_insert(0.0) += 1.0;
        }
        // 归一化 tf
        for v in tf.values_mut() { *v /= len as f32; }

        // 写入倒排
        for (term, w) in tf.iter() {
            self.postings.entry(term.clone())
                .or_default()
                .insert(d.id.clone(), *w);
        }
        // 更新 df
        for term in tf.keys() {
            *self.df.entry(term.clone()).or_insert(0) += 1;
        }

        // meta
        self.meta.insert(
            d.id.clone(),
            (len, d.boost, d.kind.clone(), d.title.clone(), d.body.clone())
        );
        self.n_docs += 1;
    }

    pub fn rebuild(&mut self, official: &OfficialDataSet, strategies: &[WildStrategy]) {
        *self = Self::default();

        for h in &official.heroes {
            let body = format!("{} {} {} {}", h.id, h.name, h.role, h.hp);
            self.add_doc(Doc {
                kind: DocKind::Hero,
                id: h.id.clone(),
                title: h.name.clone(),
                body,
                boost: 1.0,
            });
        }
        for b in &official.buildings {
            let body = format!("{} {} {} {} {}", b.id, b.name, b.cost_gold, b.cost_petricite, b.effect);
            self.add_doc(Doc {
                kind: DocKind::Building,
                id: b.id.clone(),
                title: b.name.clone(),
                body,
                boost: 1.0,
            });
        }
        for s in strategies {
            let body = format!(
                "{} {} {} {} {} {}",
                s.id,
                s.title,
                s.description,
                s.target_hero,
                s.counter_lineup,
                s.counter_tech
            );
            self.add_doc(Doc {
                kind: DocKind::Strategy,
                id: s.id.clone(),
                title: s.title.clone(),
                body,
                boost: (1.0 + s.score.max(0.0) / 50.0), // 用你的评分做轻量加权
            });
        }
    }

    pub fn add_or_update_strategy(&mut self, s: &WildStrategy) {
        // 简化处理：先删再加
        if self.meta.remove(&s.id).is_some() {
            // 从 postings & df 中移除旧项（为了简洁，此处不做“精准回收”，可在重建时清理）
        }
        let body = format!(
            "{} {} {} {} {} {}",
            s.id,
            s.title,
            s.description,
            s.target_hero,
            s.counter_lineup,
            s.counter_tech
        );
        self.add_doc(Doc {
            kind: DocKind::Strategy,
            id: s.id.clone(),
            title: s.title.clone(),
            body,
            boost: (1.0 + s.score.max(0.0) / 50.0),
        });
    }

    pub fn search(&self, q: &str, limit: usize) -> Vec<SearchHit> {
        if self.n_docs == 0 { return vec![]; }
        let terms = Self::tokenize(q);
        if terms.is_empty() { return vec![]; }

        // 计算简化 BM25-like：score = Σ ( (tf * idf) ) * boost
        let mut acc: HashMap<String, f32> = HashMap::new();
        let n = self.n_docs as f32;
        let mut seen: HashSet<String> = HashSet::new();

        for term in terms {
            if let Some(post) = self.postings.get(&term) {
                let df = *self.df.get(&term).unwrap_or(&1) as f32;
                let idf = ( (n - df + 0.5) / (df + 0.5) ).ln().max(0.0) + 1.0; // 稳定化
                for (doc_id, tf) in post {
                    let entry = acc.entry(doc_id.clone()).or_insert(0.0);
                    *entry += tf * idf;
                    seen.insert(doc_id.clone());
                }
            }
        }

        let mut hits: Vec<(String, f32)> = seen.into_iter()
            .map(|id| {
                let base = *acc.get(&id).unwrap_or(&0.0);
                let (_, boost, _, _, _) = self.meta.get(&id).unwrap();
                (id, base * *boost)
            })
            .collect();

        hits.sort_by(|a,b| b.1.partial_cmp(&a.1).unwrap());
        hits.truncate(limit);

        // 构造返回
        hits.into_iter().map(|(id, rank)| {
            let (_, _, kind, title, body) = self.meta.get(&id).unwrap();
            SearchHit {
                doc_type: match kind {
                    DocKind::Hero => "hero".into(),
                    DocKind::Building => "building".into(),
                    DocKind::Strategy => "strategy".into(),
                },
                id,
                title: title.clone(),
                snippet: make_snippet(body, q, 96),
                rank,
            }
        }).collect()
    }
}

fn make_snippet(src: &str, q: &str, max_len: usize) -> String {
    let s = src.replace('\n', " ");
    if s.len() <= max_len { return s; }
    let ql = q.to_lowercase();
    if let Some(pos) = s.to_lowercase().find(&ql) {
        let start = pos.saturating_sub(20);
        let end = (pos + q.len() + 20).min(s.len());
        return format!("…{}…", &s[start..end]);
    }
    format!("{}…", &s[..max_len.min(s.len())])
}

#[derive(serde::Serialize)]
pub struct SearchHit {
    pub doc_type: String,
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub rank: f32,
}

// —— 全局索引（WASM 进程内） ——
use std::sync::Mutex;
use once_cell::sync::Lazy;

pub static INDEX: Lazy<Mutex<Inverted>> = Lazy::new(|| Mutex::new(Inverted::new()));

pub fn rebuild(official: &OfficialDataSet, strategies: &[WildStrategy]) {
    let mut idx = INDEX.lock().unwrap();
    idx.rebuild(official, strategies);
}

pub fn index_strategy(s: &WildStrategy) {
    let mut idx = INDEX.lock().unwrap();
    idx.add_or_update_strategy(s);
}

pub fn query(q: &str, limit: usize) -> Vec<SearchHit> {
    let idx = INDEX.lock().unwrap();
    idx.search(q, limit)
}
// 🆕 阵容相似度计算：比对两个阵容的单位组成
pub fn calculate_lineup_similarity(lineup_a: &str, lineup_b: &str) -> f32 {
    let units_a: HashSet<&str> = lineup_a.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
    let units_b: HashSet<&str> = lineup_b.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
    
    if units_a.is_empty() && units_b.is_empty() {
        return 1.0;
    }
    if units_a.is_empty() || units_b.is_empty() {
        return 0.0;
    }
    
    let intersection = units_a.intersection(&units_b).count();
    let union = units_a.union(&units_b).count();
    
    intersection as f32 / union as f32
}

// 🆕 根据敌人阵容推荐应对策略
pub fn recommend_counters(enemy_lineup: &str, strategies: &[WildStrategy], limit: usize) -> Vec<(String, String, f32)> {
    let mut recommendations: Vec<(String, String, f32)> = strategies
        .iter()
        .map(|s| {
            let similarity = calculate_lineup_similarity(&s.target_hero, enemy_lineup);
            let score_boost = (s.score.max(0.0) / 50.0).min(1.0);
            let combined_score = similarity * 0.6 + score_boost * 0.4;
            (s.id.clone(), s.counter_lineup.clone(), combined_score)
        })
        .filter(|(_, _, score)| *score > 0.0)
        .collect();
    
    recommendations.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap());
    recommendations.truncate(limit);
    recommendations
}