mod app;
mod data_model;
mod storage;
mod github_sync;

use leptos::*;

fn main() {
    console_log::init_with_level(log::Level::Debug).expect("Initialize logger");
    mount_to_body(|| {
        view! {
            <App />
        }
    });
}