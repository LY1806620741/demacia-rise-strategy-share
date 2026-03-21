// src/search.rs
use crate::data_model::{OfficialDataSet, WildStrategy};
use std::cmp::Ordering;
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
            self.add_doc(strategy_doc(s));
        }
    }

    pub fn add_or_update_strategy(&mut self, s: &WildStrategy) {
        // 简化处理：先删再加
        if self.meta.remove(&s.id).is_some() {
            // 从 postings & df 中移除旧项（为了简洁，此处不做“精准回收”，可在重建时清理）
        }
        self.add_doc(strategy_doc(s));
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

        hits.sort_by(|a, b| compare_rank_desc(a.1, b.1).then_with(|| a.0.cmp(&b.0)));
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

fn strategy_doc(s: &WildStrategy) -> Doc {
    Doc {
        kind: DocKind::Strategy,
        id: s.id.clone(),
        title: s.title.clone(),
        body: strategy_search_body(s),
        boost: 1.0 + s.score.max(0.0) / 50.0,
    }
}

fn strategy_search_body(s: &WildStrategy) -> String {
    format!(
        "{} {} {} {} {} {}",
        s.id,
        s.title,
        s.description,
        s.target_hero,
        s.counter_lineup,
        s.counter_tech
    )
}

fn compare_rank_desc(a: f32, b: f32) -> Ordering {
    b.partial_cmp(&a).unwrap_or(Ordering::Equal)
}

fn normalize_lineup_token(token: &str) -> Option<String> {
    let normalized = token
        .trim()
        .trim_matches(|c: char| matches!(c, '[' | ']' | '(' | ')' | '（' | '）'));
    if normalized.is_empty() {
        return None;
    }

    let lowered = normalized.to_lowercase();
    let cleaned = lowered
        .split_whitespace()
        .filter(|part| !part.is_empty() && !part.starts_with('x') && !part.chars().all(|ch| ch.is_ascii_digit()))
        .collect::<Vec<_>>()
        .join("");

    let cleaned = cleaned.trim_matches(|c: char| matches!(c, '+' | '＋' | '*' | '×' | ':' | '：')).trim().to_string();
    if cleaned.is_empty() { None } else { Some(cleaned) }
}

fn normalized_lineup_units(lineup: &str) -> HashSet<String> {
    lineup
        .split(|c: char| matches!(c, ',' | '，' | ';' | '；' | '\n' | '\t' | '|' | '/'))
        .flat_map(|segment| segment.split(['+', '＋']))
        .filter_map(normalize_lineup_token)
        .collect()
}

fn make_snippet(src: &str, q: &str, max_len: usize) -> String {
    let s = src.replace('\n', " ");
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= max_len { return s; }

    let ql = q.to_lowercase();
    let sl = s.to_lowercase();
    if let Some(byte_pos) = sl.find(&ql) {
        let pos = s[..byte_pos].chars().count();
        let q_chars = q.chars().count();
        let start = pos.saturating_sub(20);
        let end = (pos + q_chars + 20).min(chars.len());
        let snippet: String = chars[start..end].iter().collect();
        return format!("…{}…", snippet);
    }

    let snippet: String = chars[..max_len.min(chars.len())].iter().collect();
    format!("{}…", snippet)
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
    let units_a = normalized_lineup_units(lineup_a);
    let units_b = normalized_lineup_units(lineup_b);

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

    recommendations.sort_by(|a, b| compare_rank_desc(a.2, b.2).then_with(|| a.0.cmp(&b.0)));
    recommendations.truncate(limit);
    recommendations
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data_model::WildStrategy;

    fn strategy(id: &str, counter_lineup: &str, score: f32) -> WildStrategy {
        WildStrategy {
            id: id.into(),
            title: format!("strategy-{id}"),
            description: "desc".into(),
            target_hero: "enemy".into(),
            counter_lineup: counter_lineup.into(),
            counter_tech: "tech".into(),
            likes: 0,
            dislikes: 0,
            score,
        }
    }

    #[test]
    fn lineup_similarity_is_case_insensitive_and_deduplicated() {
        let score = calculate_lineup_similarity("卫兵, 弓兵, 卫兵", "卫兵,弓兵");
        assert!((score - 1.0).abs() < f32::EPSILON);
    }

    #[test]
    fn lineup_similarity_handles_empty_inputs() {
        assert!((calculate_lineup_similarity("", "") - 1.0).abs() < f32::EPSILON);
        assert!((calculate_lineup_similarity("卫兵", "") - 0.0).abs() < f32::EPSILON);
    }

    #[test]
    fn recommend_counters_uses_enemy_lineup_for_matching() {
        let strategies = vec![
            WildStrategy {
                id: "best".into(),
                title: "strategy-best".into(),
                description: "desc".into(),
                target_hero: "诺克萨斯步兵,诺克萨斯战斗法师".into(),
                counter_lineup: "卫兵 + 娑娜".into(),
                counter_tech: "战场扩增".into(),
                likes: 0,
                dislikes: 0,
                score: 10.0,
            },
            WildStrategy {
                id: "other".into(),
                title: "strategy-other".into(),
                description: "desc".into(),
                target_hero: "龙蜥".into(),
                counter_lineup: "游侠".into(),
                counter_tech: "战场扩增".into(),
                likes: 0,
                dislikes: 0,
                score: 10.0,
            },
        ];

        let hits = recommend_counters("诺克萨斯步兵, 诺克萨斯战斗法师", &strategies, 2);
        assert_eq!(hits.first().map(|hit| hit.0.as_str()), Some("best"));
    }

    #[test]
    fn recommend_counters_returns_counter_lineup() {
        let strategies = vec![strategy("best", "卫兵,弓兵", 10.0)];
        let hits = recommend_counters("enemy", &strategies, 1);
        assert_eq!(hits.first().map(|hit| hit.1.as_str()), Some("卫兵,弓兵"));
    }

    #[test]
    fn make_snippet_handles_multibyte_queries() {
        let snippet = make_snippet("前排卫兵 后排弓兵 侧翼骑兵", "弓兵", 8);
        assert!(snippet.contains("弓兵"));
    }

    #[test]
    fn lineup_similarity_supports_editor_style_counts_and_chinese_punctuation() {
        let score = calculate_lineup_similarity(
            "诺克萨斯步兵 x2，诺克萨斯战斗法师 x1",
            "诺克萨斯步兵, 诺克萨斯战斗法师",
        );
        assert!((score - 1.0).abs() < f32::EPSILON);
    }

    #[test]
    fn recommend_counters_matches_editor_input_format() {
        let strategies = vec![
            WildStrategy {
                id: "best-format".into(),
                title: "strategy-best-format".into(),
                description: "克制步兵法师组合".into(),
                target_hero: "诺克萨斯步兵, 诺克萨斯战斗法师".into(),
                counter_lineup: "卫兵, 娑娜".into(),
                counter_tech: "战场扩增".into(),
                likes: 0,
                dislikes: 0,
                score: 15.0,
            },
            WildStrategy {
                id: "other-format".into(),
                title: "strategy-other-format".into(),
                description: "针对龙蜥".into(),
                target_hero: "龙蜥".into(),
                counter_lineup: "游侠".into(),
                counter_tech: "战场扩增".into(),
                likes: 0,
                dislikes: 0,
                score: 15.0,
            },
        ];

        let recommendations = recommend_counters("诺克萨斯步兵 x2，诺克萨斯战斗法师 x1", &strategies, 5);
        assert_eq!(recommendations.first().map(|item| item.0.as_str()), Some("best-format"));
    }
}
