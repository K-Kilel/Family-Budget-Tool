#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_sql::Builder as SqlBuilder;

fn main() {
  tauri::Builder::default()
    .plugin(SqlBuilder::new().build()) // v2 plugin init
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
