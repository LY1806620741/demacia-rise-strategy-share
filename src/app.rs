use leptos::*;
use leptos::prelude::*;
use crate::data_model::{WildStrategy, StrategyType, DisplayItem, DataSource, OfficialDataSet};
use crate::storage::StorageManager;
use crate::github_sync;
use gloo_timers::future::TimeoutFuture;
use wasm_bindgen_futures::spawn_local;

#[component]
pub fn App() -> impl IntoView {
    let (official_data, set_official_data) = signal::<Option<OfficialDataSet>>(None);
    let (wild_strategies, set_wild_strategies) = signal::<Vec<WildStrategy>>(Vec::new());
    let (loading, set_loading) = signal(true);
    let (active_tab, set_active_tab) = signal("home");

    // 初始化：加载数据
    spawn_local(async move {
        set_loading.update(|v| *v = true);
        
        // 1. 加载官方数据
        match github_sync::fetch_official_data().await {
            Ok(data) => {
                set_official_data.set(Some(data));
                // 这里可以对比 Hash 决定是否更新 LocalStorage
            },
            Err(e) => web_sys::console::error_1(&format!("Sync failed: {}", e).into()),
        }

        // 2. 加载本地野生数据
        if let Ok(db) = StorageManager::init().await {
            match db.get_all_strategies().await {
                Ok(strats) => set_wild_strategies.set(strats),
                Err(e) => web_sys::console::error_1(&format!("DB load failed: {:?}", e).into()),
            }
        }

        set_loading.update(|v| *v = false);
    });

    // 合并并排序数据供显示
    let display_items = Memo::new(move |_| {
        let mut items = Vec::new();
        
        // 添加官方英雄
        if let Some(data) = official_data.get() {
            for hero in data.heroes {
                items.push(DisplayItem {
                    source: DataSource::Hero(hero),
                    score: 1000.0,
                });
            }
            for building in data.buildings {
                items.push(DisplayItem {
                    source: DataSource::Building(building),
                    score: 1000.0,
                });
            }
        }

        // 添加野生策略
        for strat in wild_strategies.get() {
            let mut item = DisplayItem {
                source: DataSource::Strategy(strat),
                score: 0.0,
            };
            item.score = item.calculate_score();
            items.push(item);
        }

        // 排序：分数高的在前
        items.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        items
    });

    let handle_like = {
        let set_wild_strategies = set_wild_strategies.clone();
        move |id: String, is_like: bool| {
            spawn_local(async move {
                if let Ok(db) = StorageManager::init().await {
                    let delta = if is_like { 1 } else { 0 };
                    let delta_dis = if !is_like { 1 } else { 0 };
                    let _ = db.update_likes(&id, delta, delta_dis).await;
                    
                    // 重新加载本地列表以反映变化 (简化处理，实际可用 CRDT 直接更新 signal)
                    if let Ok(strats) = db.get_all_strategies().await {
                        set_wild_strategies.set(strats);
                    }
                    
                    // TODO: 在这里调用 P2P 广播函数 broadcast_vote(id, is_like)
                    web_sys::console::log_1(&format!("Voted {} for {}", if is_like {"LIKE"} else {"DISLIKE"}, id).into());
                }
            });
        }
    };

    let handle_create_strategy = {
        let set_wild_strategies = set_wild_strategies.clone();
        move |title: String, desc: String| {
            spawn_local(async move {
                let new_strat = WildStrategy::new(
                    title, 
                    desc, 
                    StrategyType::CounterComposition, 
                    Some("garen".to_string()) // 示例关联
                );
                
                if let Ok(db) = StorageManager::init().await {
                    let _ = db.save_strategy(&new_strat).await;
                    // 刷新列表
                    if let Ok(strats) = db.get_all_strategies().await {
                        set_wild_strategies.set(strats);
                    }
                    // TODO: P2P 广播新策略
                }
            });
        }
    };

    view! {
        <div class="demacia-theme">
            <header>
                <h1>🛡️ 德玛西亚的崛起</h1>
                <p>策略模拟器 | 官方基准 + 社区智慧</p>
                <nav>
                    <button on:click=move |_| set_active_tab.set("home")>首页</button>
                    <button on:click=move |_| set_active_tab.set("resource")>资源模拟</button>
                    <button on:click=move |_| set_active_tab.set("combat")>战斗模拟</button>
                </nav>
            </header>

            <main>
                {move || match active_tab.get().as_ref() {
                    "home" => view! {
                        <div class="dashboard">
                            <h2>📜 战术情报板</h2>
                            {move || {
    if loading.get() {
        Some(view! { <p>正在同步光盾数据...</p> }.into_view())
    } else {
        None
    }
}}
                            
                            <div class="strategy-list">
                                {display_items.get().into_iter().map(|item| {
                                    let title = item.title();
                                    let score = item.score;
                                    let id = match &item.source {
                                        DataSource::Strategy(s) => Some(s.id.clone()),
                                        _ => None
                                    };
                                    
                                    view! {
                                        <div class="card" style:opacity={if score < 10.0 && id.is_some() { "0.6" } else { "1" }}>
                                            <h3>{title}</h3>
                                            {match &item.source {
                                                DataSource::Strategy(s) => view! { <p>{s.description.clone()}</p> }.into_view(),
                                                DataSource::Hero(h) => view! { <p>HP: {h.hp} | ATK: {h.attack}</p> }.into_view(),
                                                DataSource::Building(b) => view! { <p>Cost: {b.cost_gold} Gold</p> }.into_view(),
                                            }}
                                            
                                            {if let Some(strat_id) = id {
                                                let sid = strat_id.clone();
                                                view! {
                                                    <div class="actions">
                                                        <button on:click=move |_| handle_like(sid.clone(), true)>👍 ({/* 计算实时点赞 */})</button>
                                                        <button on:click=move |_| handle_like(sid.clone(), false)>👎</button>
                                                        <span class="score">Score: {score}</span>
                                                    </div>
                                                }.into_view()
                                            } else {
                                                view! { <div></div> }.into_view()
                                            }}
                                        </div>
                                    }
                                }).collect::<Vec<_>>()}
                            </div>

                            <NewStrategyForm on_submit=handle_create_strategy />
                        </div>
                    }.into_view(),
                    "resource" => view! { <ResourceSimulator /> }.into_view(),
                    "combat" => view! { <CombatSimulator /> }.into_view(),
                    _ => view! { <p>Unknown Tab</p> }.into_view()
                }}
            </main>
        </div>
    }
}

#[component]
fn NewStrategyForm(on_submit: Callback<(String, String)>) -> impl IntoView {
    let (title, set_title) = signal("".to_string());
    let (desc, set_desc) = signal("".to_string());

    let submit = move |_| {
        let t = title.get_untracked();
        let d = desc.get_untracked();
        if !t.is_empty() {
            on_submit((t,d));
            set_title.set("".to_string());
            set_desc.set("".to_string());
        }
    };

    view! {
        <div class="form-box">
            <h3>➕ 提交新战术方案</h3>
            <input type="text" placeholder="战术名称 (例: 反制塞拉斯速推流)" value=title on:input=move |ev| set_title.set(event_target_value(&ev)) />
            <textarea placeholder="详细描述：需要哪些建筑？如何站位？" value=desc on:input=move |ev| set_desc.set(event_target_value(&ev))></textarea>
            <button on:click=submit>发布到社区网络</button>
        </div>
    }
}

#[component]
fn ResourceSimulator() -> impl IntoView {
    view! {
        <div>
            <h2>🏰 资源模拟系统</h2>
            <p>在此处构建你的德玛西亚经济模型...</p>
            <div class="sim-placeholder">
                [资源图表与建筑树交互组件待实现]
            </div>
        </div>
    }
}

#[component]
fn CombatSimulator() -> impl IntoView {
    view! {
        <div>
            <h2>⚔️ 战斗模拟系统</h2>
            <p>配置阵容，推演战局...</p>
            <div class="sim-placeholder">
                [战斗棋盘与 AI 推演组件待实现]
            </div>
        </div>
    }
}