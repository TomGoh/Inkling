// 全局搜索命令
// 遍历工作区目录下所有 .md/.markdown 文件，按行匹配关键词或正则，
// 返回命中结果（文件路径 + 行号 + 列号 + 预览文本）。
// 跳过隐藏目录（. 开头）和超大文件（> 5MB）。

use std::fs;
use std::path::Path;
use regex::Regex;

/// 单条命中
#[derive(serde::Serialize)]
pub struct SearchHit {
    /// 文件完整路径
    pub path: String,
    /// 行号（从 1 开始）
    pub line: usize,
    /// 列号（从 1 开始，按 UTF-8 字符计）
    pub column: usize,
    /// 该行内容（已去除行尾换行）
    pub preview: String,
}

/// 超过此大小（字节）的文件跳过
const MAX_FILE_SIZE: u64 = 5 * 1024 * 1024;

/// 递归收集目录下所有 .md/.markdown 文件路径
fn collect_md_files(dir: &Path, out: &mut Vec<String>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        // 跳过隐藏目录和文件
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            collect_md_files(&path, out);
        } else if path.is_file() {
            let lower = name.to_lowercase();
            if lower.ends_with(".md") || lower.ends_with(".markdown") {
                if let Some(p) = path.to_str() {
                    out.push(p.to_string());
                }
            }
        }
    }
}

/// 全局搜索：在工作区 root 下搜索 query
///
/// - `root`: 工作区根目录
/// - `query`: 搜索词或正则
/// - `case_sensitive`: 是否区分大小写
/// - `use_regex`: 是否作为正则匹配
#[tauri::command]
pub fn search_in_workspace(
    root: String,
    query: String,
    case_sensitive: bool,
    use_regex: bool,
) -> Result<Vec<SearchHit>, String> {
    if query.is_empty() {
        return Ok(Vec::new());
    }

    // 构建正则
    let pattern = if use_regex {
        query.clone()
    } else {
        // 转义正则元字符
        regex::escape(&query)
    };
    let flags = if case_sensitive { "" } else { "(?i)" };
    let full = format!("{}{}", flags, pattern);
    let re = Regex::new(&full).map_err(|e| format!("正则编译失败: {}", e))?;

    let root_path = Path::new(&root);
    if !root_path.exists() {
        return Err(format!("工作区不存在: {}", root));
    }

    let mut files: Vec<String> = Vec::new();
    if root_path.is_dir() {
        collect_md_files(root_path, &mut files);
    } else if root_path.is_file() {
        if let Some(p) = root_path.to_str() {
            files.push(p.to_string());
        }
    }

    let mut hits: Vec<SearchHit> = Vec::new();
    for file_path in &files {
        // 跳过超大文件
        if let Ok(meta) = fs::metadata(file_path) {
            if meta.len() > MAX_FILE_SIZE {
                continue;
            }
        }
        let content = match fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        for (i, line) in content.lines().enumerate() {
            // 对每个匹配，记录命中（同行多次命中各记一条）
            for m in re.find_iter(line) {
                // 列号按 UTF-8 字符计（前端展示更直观）
                let column = line[..m.start()].chars().count() + 1;
                hits.push(SearchHit {
                    path: file_path.clone(),
                    line: i + 1,
                    column,
                    preview: line.to_string(),
                });
                // 单文件单行最多记录 20 条，避免一个超长正则把内存撑爆
                if hits.len() > 5000 {
                    return Ok(hits);
                }
            }
        }
    }

    Ok(hits)
}
