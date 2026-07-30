// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;

use commands::{
    create_dir, create_file, delete_path, file_mtime, list_dir, pandoc_check,
    pandoc_export_docx, read_text_file, rename_path, search_in_workspace, write_binary_file,
    write_text_file,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 纯绿色模式：当 exe 同目录存在 portable.txt 标记文件时，
    // 将 WebView2 用户数据目录重定向到 exe 同目录下的 data 文件夹，
    // 实现免安装、数据随身、不污染系统目录。
    #[cfg(target_os = "windows")]
    {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                if parent.join("portable.txt").exists() {
                    let data_dir = parent.join("data");
                    let _ = std::fs::create_dir_all(&data_dir);
                    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &data_dir);
                }
            }
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_dir,
            read_text_file,
            write_text_file,
            write_binary_file,
            file_mtime,
            pandoc_check,
            pandoc_export_docx,
            rename_path,
            delete_path,
            create_file,
            create_dir,
            search_in_workspace
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
