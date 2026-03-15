use crate::data_model::{DataSource, DisplayItem, OfficialDataSet, StrategyType, WildStrategy};
use crate::github_sync;
use crate::storage::StorageManager;
use leptos::prelude::*;
use leptos::*;
use std::cell::RefCell;
use std::cmp::Ordering;
use wasm_bindgen_futures::spawn_local;

thread_local! {
    static DB: RefCell<Option<StorageManager>> = RefCell::new(None);
}

#[component]
pub fn App() -> impl IntoView {
    let (official_data, set_official_data) = signal(None::<OfficialDataSet>);
    let (wild_strategies, set_wild_strategies) = signal(Vec::new());
    let (loading, set_loading) = signal(true);
    let (active_tab, set_active_tab) = signal("home");
    let (error_msg, set_error_msg) = signal(None::<String>);

    Effect::new(move |_| {
        spawn_local(async move {
            set_loading.set(true);
            set_error_msg.set(None);

            match StorageManager::init().await {
                Ok(db) => {
                    DB.with(|d| *d.borrow_mut() = Some(db));
                    DB.with(|d| {
                        if let Some(db) = d.borrow().as_ref() {
                            spawn_local(async move {
                                match db.get_all_strategies().await {
                                    Ok(strats) => set_wild_strategies.set(strats),
                                    Err(e) => set_error_msg.set(Some(format!("{e:?}"))),
                                }
                            });
                        }
                    });
                }
                Err(e) => set_error_msg.set(Some(format!("{e:?}"))),
            }

            match github_sync::fetch_official_data().await {
                Ok(data) => set_official_data.set(Some(data)),
                Err(e) => web_sys::console::error_1(&format!("{e}").into()),
            }

            set_loading.set(false);
        });
    });

    let display_items = Memo::new(move |_| {
        let mut items = Vec::new();
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
        for strat in wild_strategies.get() {
            let mut item = DisplayItem {
                source: DataSource::Strategy(strat),
                score: 0.0,
            };
            item.score = item.calculate_score();
            items.push(item);
        }
        items.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(Ordering::Equal));
        items
    });

    let handle_like = move |id: String, is_like: bool| {
        DB.with(|d| {
            if let Some(db) = d.borrow().as_ref() {
                spawn_local(async move {
                    let _ = db
                        .update_likes(
                            &id,
                            if is_like { 1 } else { 0 },
                            if !is_like { 1 } else { 0 },
                        )
                        .await;
                    let Ok(strats) = db.get_all_strategies().await else {
                        return;
                    };
                    set_wild_strategies.set(strats);
                });
            }
        });
    };

    let handle_create_strategy = Callback::new(move |(title, desc)| {
        DB.with(|d| {
            if let Some(db) = d.borrow().as_ref() {
                spawn_local(async move {
                    let new_strat = WildStrategy::new(
                        title,
                        desc,
                        StrategyType::CounterComposition,
                        Some("garen".into()),
                    );
                    let _ = db.save_strategy(&new_strat).await;
                    let Ok(strats) = db.get_all_strategies().await else {
                        return;
                    };
                    set_wild_strategies.set(strats);
                });
            }
        });
    });

    view! {
                <div class="demacia-theme">
                    <header>
                        <h1>"德玛西亚的崛起"</h1>
                        <nav>
                            <button onclick=move || set_active_tab.set("home")>"首页"</button>
                            <button onclick=move || set_active_tab.set("resource")>"资源"</button>
                            <button onclick=move || set_active_tab.set("combat")>"战斗"</button>
                        </nav>
                    </header>
                    <main>
        {move || {
            view! {
                <div>
                    {move || {
                        if loading.get() {
                            view! { <div class="loader">"加载中..."</div> }.into_view()
                        } else if error_msg.get().is_some() {
                            view! { <div class="error-box">"出错了"</div> }.into_view()
                        } else {
                            match active_tab.get().as_ref() {
    "home" => {
        view! {
            <div class="dashboard">
                <h2>"战术板"</h2>
                <div class="strategy-list">
                    {display_items.get().into_iter().map(|item| {
                        let id = match &item.source {
                            DataSource::Strategy(s) => Some(s.id.clone()),
                            _ => None,
                        };
                        view! {
                            <div class="card">
                                <h3>{item.title()}</h3>
                                {match &item.source {
                                    DataSource::Strategy(s) => view! { <p>{s.description.clone()}</p> }.into_view(),
                                    DataSource::Hero(h) => view! { <p>{format!("HP:{} ATK:{}", h.hp, h.attack)}</p> }.into_view(),
                                    DataSource::Building(b) => view! { <p>{format!("Cost:{} Gold", b.cost_gold)}</p> }.into_view(),
                                }}
                                {
                                    let sid = id.unwrap_or_default();
                                    view! {
                                        <div class="actions">
                                            <button onclick=move || handle_like(sid.clone(), true)>"👍"</button>
                                            <button onclick=move || handle_like(sid.clone(), false)>"👎"</button>
                                        </div>
                                    }.into_view()
                                }
                            </div>
                        }
                    }).collect_view()}
                </div>
                <NewStrategyForm on_submit=handle_create_strategy/>
            </div>
        }.into_view()
    },
    _ => {
        view! {
            <div class="dashboard">
                <h2>"未知页面"</h2>
                <div class="strategy-list">
                    {display_items.get().into_iter().map(|item| {
                        let id = match &item.source {
                            DataSource::Strategy(s) => Some(s.id.clone()),
                            _ => None,
                        };
                        view! {
                            <div class="card">
                                <h3>{item.title()}</h3>
                                {match &item.source {
                                    DataSource::Strategy(s) => view! { <p>{s.description.clone()}</p> }.into_view(),
                                    DataSource::Hero(h) => view! { <p>{format!("HP:{} ATK:{}", h.hp, h.attack)}</p> }.into_view(),
                                    DataSource::Building(b) => view! { <p>{format!("Cost:{} Gold", b.cost_gold)}</p> }.into_view(),
                                }}
                                {
                                    let sid = id.unwrap_or_default();
                                    view! {
                                        <div class="actions">
                                            <button onclick=move || handle_like(sid.clone(), true)>"👍"</button>
                                            <button onclick=move || handle_like(sid.clone(), false)>"👎"</button>
                                        </div>
                                    }.into_view()
                                }
                            </div>
                        }
                    }).collect_view()}
                </div>
                <NewStrategyForm on_submit=handle_create_strategy/>
            </div>
        }.into_view()
    }
                            }
                        }
                    }}
                </div>
            }.into_view()
        }}
    </main>
                </div>
            }
}

#[component]
fn NewStrategyForm(on_submit: Callback<(String, String)>) -> impl IntoView {
    let (title, set_title) = signal(String::new());
    let (desc, set_desc) = signal(String::new());

    let submit = move |_| {
        on_submit.run((title.get_untracked(), desc.get_untracked()));
        set_title.set(String::new());
        set_desc.set(String::new());
    };

    view! {
        <div class="form-box">
            <input
                type="text"
                prop:value=title
                on:input=move |e| set_title.set(event_target_value(&e))
            />
            <textarea
                prop:value=desc
                on:input=move |e| set_desc.set(event_target_value(&e))
            />
            <button on:click=submit>"发布"</button>
        </div>
    }
}

#[component]
fn ResourceSimulator() -> impl IntoView {
    view! { <div>"资源"</div> }
}
#[component]
fn CombatSimulator() -> impl IntoView {
    view! { <div>"战斗"</div> }
}
