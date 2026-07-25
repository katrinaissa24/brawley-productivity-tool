#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// Spec §3: the database lives at ~/Library/Application Support/flow/flow.db
///
/// Kept as "flow" (the app's original name) rather than renamed to "brawley"
/// so existing installs keep finding their data after the rename/update.
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

/* ------------------------------ Spaces (files) ----------------------------- */
//
// Spaces browse and edit real markdown files on disk, so the same folder can be
// opened by Claude (or any editor) at the same time. Everything is scoped to a
// folder the user picked in a native dialog — we never invent paths here.

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct FsEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
    modified_ms: Option<u64>,
}

fn modified_ms(meta: &std::fs::Metadata) -> Option<u64> {
    meta.modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as u64)
}

#[tauri::command]
fn fs_list_dir(path: String) -> Result<Vec<FsEntry>, String> {
    let mut out: Vec<FsEntry> = Vec::new();
    for entry in std::fs::read_dir(&path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        // Dotfiles and macOS bookkeeping are noise in a notes folder.
        if name.starts_with('.') {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        out.push(FsEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir: meta.is_dir(),
            size: meta.len(),
            modified_ms: modified_ms(&meta),
        });
    }
    out.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(out)
}

#[tauri::command]
fn fs_read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn fs_write_text(path: String, contents: String) -> Result<(), String> {
    if let Some(dir) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn fs_create_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn fs_rename(from: String, to: String) -> Result<(), String> {
    if std::path::Path::new(&to).exists() {
        return Err("A file with that name already exists".into());
    }
    std::fs::rename(&from, &to).map_err(|e| e.to_string())
}

#[tauri::command]
fn fs_delete(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(p).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn fs_exists(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).exists())
}

#[tauri::command]
fn fs_reveal(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
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
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            set_capture_shortcut,
            fs_list_dir,
            fs_read_text,
            fs_write_text,
            fs_create_dir,
            fs_rename,
            fs_delete,
            fs_exists,
            fs_reveal
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
        .expect("error while running Brawley")
        .run(|app, event| {
            if let RunEvent::Reopen { .. } = event {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        });
}
