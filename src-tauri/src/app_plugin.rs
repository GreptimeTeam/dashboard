use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[tauri::command]
fn is_running() -> bool {
    // Your logic here (return true if the app is running)
    true
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("app") // This must match `plugin:app|is_running`
        .invoke_handler(tauri::generate_handler![is_running])
        .build()
}
