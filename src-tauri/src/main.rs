#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// Spec §3: the database lives at ~/Library/Application Support/flow/flow.db
fn db_dir() -> std::path::PathBuf {
    dirs::home_dir()
        .expect("no home directory")
        .join("Library/Application Support/flow")
}

#[tauri::command]
fn db_path() -> Result<String, String> {
    let dir = db_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("flow.db").to_string_lossy().to_string())
}

#[tauri::command]
fn reveal_db() -> Result<(), String> {
    let path = db_dir().join("flow.db");
    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn export_db(dest: String) -> Result<(), String> {
    let src = db_dir().join("flow.db");
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn import_db(src: String) -> Result<(), String> {
    let dest_dir = db_dir();
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let dest = dest_dir.join("flow.db");
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    // Drop stale WAL/SHM so SQLite doesn't replay old state over the import.
    let _ = std::fs::remove_file(dest_dir.join("flow.db-wal"));
    let _ = std::fs::remove_file(dest_dir.join("flow.db-shm"));
    Ok(())
}

#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

fn toggle_capture(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("capture") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
            let _ = win.emit("capture:show", ());
        }
    }
}

#[tauri::command]
fn set_capture_shortcut(app: tauri::AppHandle, accel: String) -> Result<(), String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    gs.on_shortcut(accel.as_str(), move |handle, _shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            toggle_capture(handle);
        }
    })
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            db_path,
            reveal_db,
            export_db,
            import_db,
            restart_app,
            set_capture_shortcut
        ])
        .setup(|app| {
            // Default registration; the frontend re-registers with the user's
            // configured combo on boot (Settings → Shortcuts).
            let _ = set_capture_shortcut(app.handle().clone(), "CmdOrCtrl+Shift+Space".into());
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
                // macOS convention: the red button hides; ⌘Q quits.
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::Focused(false) if window.label() == "capture" => {
                let _ = window.hide();
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("error while running Flow")
        .run(|app, event| {
            if let RunEvent::Reopen { .. } = event {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        });
}
