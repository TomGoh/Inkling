// 文件系统相关命令
// 所有文件系统操作集中在这里，前端通过 invoke 调用，不允许前端直接拼路径操作 fs

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// 文件树节点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    /// 显示名（文件/目录名）
    pub name: String,
    /// 完整路径
    pub path: String,
    /// 是否目录
    pub is_dir: bool,
    /// 子节点（仅目录有）
    #[serde(default)]
    pub children: Vec<FileNode>,
}

/// 递归列出目录树。
/// - 递归深度由 max_depth 控制，防止超深目录卡死
/// - 跳过隐藏目录（以 . 开头，如 .git / .vscode），减少噪音和权限问题
/// - 文件按名称排序，目录在前
#[tauri::command]
pub fn list_dir(dir_path: String, max_depth: Option<usize>) -> Result<FileNode, String> {
    let root = Path::new(&dir_path);
    if !root.exists() {
        return Err(format!("路径不存在: {}", dir_path));
    }
    if !root.is_dir() {
        return Err(format!("不是目录: {}", dir_path));
    }
    let depth = max_depth.unwrap_or(10);
    list_dir_inner(root, depth).map_err(|e| e.to_string())
}

fn list_dir_inner(path: &Path, depth: usize) -> std::io::Result<FileNode> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());
    let is_dir = path.is_dir();
    let mut node = FileNode {
        name,
        path: path.to_string_lossy().into_owned(),
        is_dir,
        children: Vec::new(),
    };

    if is_dir && depth > 0 {
        let mut dirs: Vec<FileNode> = Vec::new();
        let mut files: Vec<FileNode> = Vec::new();
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let entry_path = entry.path();
            let entry_name = entry_path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            // 跳过隐藏文件/目录（如 .git, .vscode, .DS_Store）
            if entry_name.starts_with('.') {
                continue;
            }
            match list_dir_inner(&entry_path, depth - 1) {
                Ok(child) => {
                    if child.is_dir {
                        dirs.push(child);
                    } else {
                        files.push(child);
                    }
                }
                // 单个条目读取失败不中断整个目录
                Err(e) => eprintln!("skip {}: {}", entry_path.display(), e),
            }
        }
        dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        node.children = dirs;
        node.children.append(&mut files);
    }

    Ok(node)
}

/// 读取文本文件内容（UTF-8）
#[tauri::command]
pub fn read_text_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }
    fs::read_to_string(path).map_err(|e| format!("读取失败 {}: {}", file_path, e))
}

/// 写入文本文件（覆盖写入，不存在则创建）
#[tauri::command]
pub fn write_text_file(file_path: String, content: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
        }
    }
    fs::write(path, content).map_err(|e| format!("写入失败 {}: {}", file_path, e))
}
