// 全局搜索命令
// 遍历工作区目录下所有 .md/.markdown 文件，按行匹配关键词或正则，
// 返回命中结果（文件路径 + 行号 + 列号 + 预览文本）。
// 跳过隐藏目录（. 开头）和超大文件（> 5MB）。

use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;
use regex::Regex;

/// 单条命中
#[derive(Debug, serde::Serialize)]
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
    let entries = match std::fs::read_dir(dir) {
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
        if let Ok(meta) = std::fs::metadata(file_path) {
            if meta.len() > MAX_FILE_SIZE {
                continue;
            }
        }
        let file = match File::open(file_path) {
            Ok(f) => f,
            Err(_) => continue,
        };
        let reader = BufReader::new(file);
        for (i, line_res) in reader.lines().enumerate() {
            let line = match line_res {
                Ok(l) => l,
                Err(_) => continue,
            };
            // 对每个匹配，记录命中（同行多次命中各记一条）
            for m in re.find_iter(&line) {
                // 列号按 UTF-8 字符计（前端展示更直观）
                let column = line[..m.start()].chars().count() + 1;
                hits.push(SearchHit {
                    path: file_path.clone(),
                    line: i + 1,
                    column,
                    preview: line.clone(),
                });
                // 单次搜索最多记录 5000 条，避免一个超长正则把内存撑爆
                if hits.len() >= 5000 {
                    return Ok(hits);
                }
            }
        }
    }

    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static NEXT_TEST_DIR: AtomicUsize = AtomicUsize::new(0);

    /// 临时工作区，Drop 时自动清理
    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new(label: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock should be after Unix epoch")
                .as_nanos();
            let sequence = NEXT_TEST_DIR.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "inklingmd-search-{label}-{}-{nonce}-{sequence}",
                std::process::id()
            ));
            fs::create_dir(&path).expect("create test directory");
            Self { path }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn write(path: &Path, content: &str) {
        fs::write(path, content).expect("write test file");
    }

    fn search(root: &Path, query: &str) -> Vec<SearchHit> {
        search_in_workspace(
            root.to_string_lossy().into_owned(),
            query.to_string(),
            true,
            false,
        )
        .expect("search should succeed")
    }

    #[test]
    fn empty_query_returns_empty() {
        let temp = TestDir::new("empty-query");
        write(&temp.path.join("a.md"), "hello world\n");

        let hits = search_in_workspace(
            temp.path.to_string_lossy().into_owned(),
            String::new(),
            true,
            false,
        )
        .unwrap();
        assert!(hits.is_empty());
    }

    #[test]
    fn missing_workspace_returns_error() {
        let result = search_in_workspace(
            "C:/definitely/not/a/real/workspace/path".to_string(),
            "x".to_string(),
            true,
            false,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("工作区不存在"));
    }

    #[test]
    fn case_sensitive_toggle() {
        let temp = TestDir::new("case");
        write(&temp.path.join("a.md"), "Hello\nhello\nHELLO\n");

        let sensitive = search_in_workspace(
            temp.path.to_string_lossy().into_owned(),
            "hello".to_string(),
            true,
            false,
        )
        .unwrap();
        assert_eq!(sensitive.len(), 1, "区分大小写只命中小写 hello");
        assert_eq!(sensitive[0].line, 2);

        let insensitive = search_in_workspace(
            temp.path.to_string_lossy().into_owned(),
            "hello".to_string(),
            false,
            false,
        )
        .unwrap();
        assert_eq!(insensitive.len(), 3, "忽略大小写命中三种写法");
    }

    #[test]
    fn invalid_regex_returns_error() {
        let temp = TestDir::new("bad-regex");
        write(&temp.path.join("a.md"), "hello\n");

        let result = search_in_workspace(
            temp.path.to_string_lossy().into_owned(),
            "(".to_string(),
            true,
            true,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("正则编译失败"));
    }

    #[test]
    fn line_and_path_correctness_across_files() {
        let temp = TestDir::new("multi-file");
        write(&temp.path.join("one.md"), "line one\nneedle here\nline three\n");
        write(&temp.path.join("two.md"), "no match\nneedle on second\n");
        write(&temp.path.join("three.md"), "needle first\n");

        let hits = search(&temp.path, "needle");
        assert_eq!(hits.len(), 3);

        // 按照返回顺序：文件收集顺序不固定，按路径断言各自的行号
        for hit in &hits {
            let name = Path::new(&hit.path)
                .file_name()
                .unwrap()
                .to_string_lossy()
                .into_owned();
            match name.as_str() {
                "one.md" => assert_eq!(hit.line, 2),
                "two.md" => assert_eq!(hit.line, 2),
                "three.md" => assert_eq!(hit.line, 1),
                other => panic!("unexpected file {}", other),
            }
            // 完整路径应以工作区根为前缀
            assert!(hit.path.starts_with(&temp.path.to_string_lossy().into_owned()));
        }
    }

    #[test]
    fn hidden_directories_are_skipped() {
        let temp = TestDir::new("hidden");
        write(&temp.path.join("visible.md"), "needle\n");
        fs::create_dir(temp.path.join(".hidden")).unwrap();
        write(&temp.path.join(".hidden/a.md"), "needle\n");

        let hits = search(&temp.path, "needle");
        assert_eq!(hits.len(), 1, "隐藏目录中的文件不应被命中");
        assert!(!hits[0].path.contains(".hidden"));
    }

    #[test]
    fn non_utf8_file_is_skipped_silently() {
        let temp = TestDir::new("gbk");
        write(&temp.path.join("good.md"), "needle\n");
        // 写入一段非法 UTF-8 字节（GBK 编码的“你好世界”）
        let gbk: &[u8] = &[0xC4, 0xE3, 0xBA, 0xC3, 0xCA, 0xC0, 0xBD, 0xE7];
        fs::write(temp.path.join("gbk.md"), gbk).unwrap();

        let hits = search(&temp.path, "needle");
        assert_eq!(hits.len(), 1, "非 UTF-8 文件应被静默跳过，不计命中也不 panic");
        assert_eq!(hits[0].line, 1);
    }

    #[test]
    fn column_counts_utf8_characters() {
        let temp = TestDir::new("column");
        // 中文（3 字节/字符）+ emoji（4 字节/字符）在前，needle 从第 2 个字符后开始
        write(&temp.path.join("a.md"), "你好😀needle\n");

        let hits = search(&temp.path, "needle");
        assert_eq!(hits.len(), 1);
        // needle 前有 3 个多字节字符（你、好、😀），列号从 1 开始 → 4
        assert_eq!(hits[0].column, 4);
    }

    #[test]
    fn plain_text_query_escapes_regex_metacharacters() {
        let temp = TestDir::new("escape");
        write(&temp.path.join("a.md"), "cost is 5.99\ncost is X99\n");

        // 纯文本模式下 "." 应被转义为字面量，只匹配 5.99
        let hits = search(&temp.path, "5.99");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].line, 1);
    }

    #[test]
    fn oversized_file_is_skipped() {
        let temp = TestDir::new("oversize");
        write(&temp.path.join("small.md"), "needle\n");
        // 写入超过 MAX_FILE_SIZE 的大文件
        let big_path = temp.path.join("big.md");
        let big = vec![b'x'; (MAX_FILE_SIZE + 1) as usize];
        fs::write(&big_path, big).unwrap();

        let hits = search(&temp.path, "needle");
        assert_eq!(hits.len(), 1, "超大文件应被跳过");
    }
}
