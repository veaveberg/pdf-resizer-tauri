#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::path::Path;

#[tauri::command]
fn check_file_existence(file_paths: Vec<String>) -> Vec<bool> {
    file_paths.into_iter().map(|path| Path::new(&path).exists()).collect()
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet, check_file_existence])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
