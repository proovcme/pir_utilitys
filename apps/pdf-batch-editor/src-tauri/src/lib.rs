use serde::Serialize;
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Serialize)]
struct EngineOutput {
    code: i32,
    stdout: String,
    stderr: String,
}

#[tauri::command]
fn run_engine(args: Vec<String>) -> Result<EngineOutput, String> {
    let application = std::env::current_exe().map_err(|error| error.to_string())?;
    let engine = application
        .parent()
        .ok_or_else(|| "Не удалось определить папку приложения".to_string())?
        .join("stamp-engine.exe");
    let mut command = Command::new(&engine);
    command.args(args);
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    let output = command.output().map_err(|error| {
        format!("Не удалось запустить PDF-движок {}: {error}", engine.display())
    })?;
    Ok(EngineOutput {
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|error| error.to_string())
}

fn collect_pdf_files(folder: &std::path::Path, files: &mut Vec<String>) -> Result<(), String> {
    for entry in std::fs::read_dir(folder).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        let path = entry.path();
        if file_type.is_dir() {
            collect_pdf_files(&path, files)?;
        } else if file_type.is_file()
            && path.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
        {
            files.push(path.to_string_lossy().into_owned());
        }
    }
    Ok(())
}

#[tauri::command]
fn list_pdf_files(folder: String) -> Result<Vec<String>, String> {
    let root = std::path::PathBuf::from(folder);
    if !root.is_dir() {
        return Err("Выбранный путь не является папкой".to_string());
    }
    let mut files = Vec::new();
    collect_pdf_files(&root, &mut files)?;
    files.sort_by_key(|path| path.to_lowercase());
    Ok(files)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![run_engine, read_text_file, write_text_file, list_pdf_files])
        .run(tauri::generate_context!())
        .expect("error while running Stamp Studio");
}
