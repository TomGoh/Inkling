// 工作区文件索引命令（#227）
//
// 递归列出工作区内全部 Markdown 文件，供 Quick Open 的实时过滤使用。
// 忽略规则（隐藏项 / 默认黑名单 / .gitignore）、符号链接处理与深度上限
// 全部由 ignore_rules 模块提供，本模块只负责「代次 + 上限 + IPC 边界」。

use super::ignore_rules::{self, WalkError};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

/// 单次索引最多返回的文件数，超出截断并置 truncated
///
/// 50_000 条绝对路径约 6MB 量级，属可接受上限；再大说明工作区不适合整体索引。
pub const MAX_INDEX_FILES: usize = 50_000;

/// 索引代次：每次新索引登记自己的代次，在途旧任务发现代次推进后提前退出
///
/// 刻意**不复用** `SEARCH_GENERATION`：两者共用一个计数器会让「打开 Quick Open」
/// 把在途的全局搜索取消掉（搜索结果突然报「已被更新的搜索取消」），属可观察的行为耦合。
/// 复用是「机制」（代次推进 + 检查点提前退出），不是变量。
pub static INDEX_GENERATION: AtomicU64 = AtomicU64::new(0);

/// 工作区文件索引结果
#[derive(Debug, serde::Serialize)]
pub struct WorkspaceFileList {
    /// 工作区内全部 Markdown 文件的完整路径，按路径字节序升序
    pub files: Vec<String>,
    /// 文件数达到上限被截断时为 true（与搜索结果的 truncated 语义一致）
    pub truncated: bool,
}

/// 索引被更新的索引取消
fn cancelled_error() -> String {
    "索引已被更新的请求取消".to_string()
}

/// 当前代次是否已被更新的索引推进
fn is_stale(generation: u64) -> bool {
    INDEX_GENERATION.load(Ordering::Relaxed) > generation
}

/// 列出工作区内全部 Markdown 文件
///
/// - `root`: 工作区根目录
/// - `generation`: 索引代次，前端每次发起递增；代次推进后在途旧任务提前退出
#[tauri::command]
pub async fn list_workspace_files(
    root: String,
    generation: u64,
) -> Result<WorkspaceFileList, String> {
    INDEX_GENERATION.fetch_max(generation, Ordering::Relaxed);
    tauri::async_runtime::spawn_blocking(move || {
        list_workspace_files_sync(root, generation, MAX_INDEX_FILES)
    })
    .await
    .map_err(|e| format!("索引任务执行失败: {e}"))?
}

fn list_workspace_files_sync(
    root: String,
    generation: u64,
    max_files: usize,
) -> Result<WorkspaceFileList, String> {
    let root_path = Path::new(&root);

    // 单文件模式不建索引（前端在该模式下直接使用标签页与最近文件列表）。
    // 此处对直接调用做防御性处理：是文件则返回自身（仅当为 Markdown），不报错。
    if root_path.is_file() {
        let is_markdown = root_path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(ignore_rules::is_markdown_name);
        let files = match (is_markdown, root_path.to_str()) {
            (true, Some(path)) => vec![path.to_string()],
            _ => Vec::new(),
        };
        return Ok(WorkspaceFileList {
            files,
            truncated: false,
        });
    }

    let (files, truncated) = ignore_rules::walk_markdown_files(
        root_path,
        ignore_rules::MAX_SCAN_DIR_DEPTH,
        max_files,
        &|| is_stale(generation),
    )
    .map_err(|error| match error {
        WalkError::Cancelled => cancelled_error(),
        other => other.message(),
    })?;

    Ok(WorkspaceFileList { files, truncated })
}

#[cfg(test)]
mod tests {
    use super::super::search::SEARCH_GENERATION;
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicUsize, Ordering as AtomicOrdering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static NEXT_TEST_DIR: AtomicUsize = AtomicUsize::new(0);

    /// 测试用代次：足够大，保证不受其它测试写入全局代次的影响
    const TEST_GENERATION: u64 = u64::MAX;

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new(label: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock should be after Unix epoch")
                .as_nanos();
            let sequence = NEXT_TEST_DIR.fetch_add(1, AtomicOrdering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "inklingmd-index-{label}-{}-{nonce}-{sequence}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create test directory");
            Self { path }
        }

        fn child(&self, relative: &str) -> PathBuf {
            self.path.join(relative)
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn write(path: &PathBuf, content: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent directory");
        }
        fs::write(path, content).expect("write test file");
    }

    /// 把绝对路径列表转成相对 root 的 POSIX 相对路径并排序，便于断言
    fn relative(root: &Path, files: &[String]) -> Vec<String> {
        let mut out: Vec<String> = files
            .iter()
            .map(|p| {
                Path::new(p)
                    .strip_prefix(root)
                    .expect("indexed file should live under root")
                    .to_string_lossy()
                    .replace('\\', "/")
            })
            .collect();
        out.sort();
        out
    }

    fn index(root: &Path) -> WorkspaceFileList {
        list_workspace_files_sync(
            root.to_string_lossy().into_owned(),
            TEST_GENERATION,
            MAX_INDEX_FILES,
        )
        .expect("index should succeed")
    }

    #[test]
    fn lists_markdown_files_recursively_and_skips_other_files() {
        let temp = TestDir::new("recursive");
        write(&temp.child("root.md"), "root");
        write(&temp.child("notes/deep/todo.markdown"), "todo");
        write(&temp.child("notes/image.png"), "binary");
        write(&temp.child("notes/data.txt"), "text");

        let result = index(&temp.path);
        assert_eq!(
            relative(&temp.path, &result.files),
            vec!["notes/deep/todo.markdown", "root.md"]
        );
        assert!(!result.truncated);
    }

    #[test]
    fn gitignore_is_applied_through_the_index_command() {
        let temp = TestDir::new("gitignore");
        // 非 git 目录也必须生效（require_git(false)）
        write(&temp.child(".gitignore"), "artifacts/\n");
        write(&temp.child("artifacts/generated.md"), "ignored");
        write(&temp.child("note.md"), "kept");

        let result = index(&temp.path);
        assert_eq!(relative(&temp.path, &result.files), vec!["note.md"]);
    }

    #[test]
    fn index_is_truncated_at_max_files_with_visible_flag() {
        let temp = TestDir::new("truncate");
        for i in 0..5 {
            write(&temp.child(&format!("f{i}.md")), "x");
        }

        let result =
            list_workspace_files_sync(temp.path.to_string_lossy().into_owned(), TEST_GENERATION, 2)
                .expect("index should succeed");
        assert_eq!(result.files.len(), 2);
        assert!(result.truncated, "截断必须对调用方可见");
    }

    #[test]
    fn file_root_returns_itself_only_when_markdown() {
        let temp = TestDir::new("file-root");
        let md = temp.child("single.md");
        write(&md, "# single");
        let txt = temp.child("single.txt");
        write(&txt, "text");

        let md_result = index(&md);
        assert_eq!(md_result.files.len(), 1);
        assert!(md_result.files[0].ends_with("single.md"));

        let txt_result = index(&txt);
        assert!(txt_result.files.is_empty());
    }

    #[test]
    fn nonexistent_root_reports_workspace_missing() {
        let temp = TestDir::new("missing");
        let err = list_workspace_files_sync(
            temp.child("nope").to_string_lossy().into_owned(),
            TEST_GENERATION,
            MAX_INDEX_FILES,
        )
        .unwrap_err();
        assert!(
            err.contains("工作区不存在"),
            "错误应为工作区不存在，实际: {err}"
        );
    }

    #[test]
    fn stale_generation_cancels_in_flight_index() {
        let temp = TestDir::new("cancel");
        write(&temp.child("a.md"), "a");

        // 更新的索引（代次更大）已登记，旧任务必须立刻退出
        INDEX_GENERATION.store(7, Ordering::Relaxed);
        let err =
            list_workspace_files_sync(temp.path.to_string_lossy().into_owned(), 6, MAX_INDEX_FILES)
                .unwrap_err();
        assert!(err.contains("取消"), "落后代次的索引应被取消，实际: {err}");

        // 代次相等不算过期
        INDEX_GENERATION.store(3, Ordering::Relaxed);
        let result =
            list_workspace_files_sync(temp.path.to_string_lossy().into_owned(), 3, MAX_INDEX_FILES)
                .unwrap();
        assert_eq!(result.files.len(), 1);
    }

    #[test]
    fn index_generation_is_independent_from_search_generation() {
        // 推进搜索代次不得影响索引：共用计数器会让打开 Quick Open 取消在途全局搜索
        let temp = TestDir::new("independent-generation");
        write(&temp.child("a.md"), "a");

        INDEX_GENERATION.store(10, Ordering::Relaxed);
        SEARCH_GENERATION.store(u64::MAX, Ordering::Relaxed);

        let result = list_workspace_files_sync(
            temp.path.to_string_lossy().into_owned(),
            10,
            MAX_INDEX_FILES,
        )
        .expect("搜索代次推进不应影响索引");
        assert_eq!(result.files.len(), 1);
    }
}
