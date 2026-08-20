// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;

use commands::{
    allow_asset_dir, create_dir, create_file, delete_path, file_mtime, list_dir, pandoc_check,
    pandoc_export_docx, read_text_file, rename_path, search_in_workspace, write_binary_file,
    write_text_file,
};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// 待打开文件：首次启动时从 argv 提取，前端就绪后通过 take_pending_file 拉取。
/// 用 Mutex<Option> 让命令能 take 走值，避免重复打开。
struct PendingFile(Mutex<Option<String>>);

#[tauri::command]
fn take_pending_file(state: tauri::State<PendingFile>) -> Option<String> {
    state.0.lock().ok().and_then(|mut g| g.take())
}

/// 从启动参数中提取首个 Markdown 文件路径（文件关联双击打开场景）。
/// 跳过选项参数（以 `-` 开头）；程序自身路径因不以 .md 结尾会被后缀过滤排除。
fn md_file_from_args(args: &[String]) -> Option<String> {
    args.iter()
        .filter(|a| !a.starts_with('-'))
        .find(|a| {
            let l = a.to_lowercase();
            l.ends_with(".md") || l.ends_with(".markdown")
        })
        .cloned()
}

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

    let mut builder = tauri::Builder::default();

    // 单实例：程序已运行时，双击 .md 文件启动的第二个进程会把 argv 转发到主实例，
    // 由前端监听 open-file 事件打开文件，避免开出多个实例。
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(path) = md_file_from_args(&argv[1..]) {
                // 定向到主窗口，避免派生窗口重复打开
                let _ = app.emit_to("main", "open-file", path);
            }
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 首次启动：从 argv 提取待打开的 .md 文件路径存入 state。
            // 前端就绪后调用 take_pending_file 拉取（避免事件在监听器注册前发出而丢失）。
            let args: Vec<String> = std::env::args().collect();
            let pending = md_file_from_args(&args);
            app.manage(PendingFile(Mutex::new(pending)));
            Ok(())
        })
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
            search_in_workspace,
            allow_asset_dir,
            take_pending_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
