use leptos::mount::mount_to_body;
use League_of_Legends_demacia_rise_sim::App;

fn main() {
    console_log::init_with_level(log::Level::Debug).expect("Initialize logger");
    console_error_panic_hook::set_once();
    mount_to_body(App);
}