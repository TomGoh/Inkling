// 统一的工作区忽略规则与递归遍历
//
// 本模块是忽略规则的**唯一真值源**，三个消费方共用：
//   1. 全局搜索（search.rs 的 collect_md_files 已改为本模块的薄封装）
//   2. 工作区文件索引（file_index.rs）
//   3. 文件树（mod.rs 的单层列目录）
//
// 忽略规则 = 一份默认目录黑名单（DEFAULT_IGNORED_DIRS）+ 工作区内的 .gitignore。
// 黑名单集合与历史上 search.rs / searchIgnore.ts 的 14 项**逐项一致**，不新增硬编码目录，
// 避免静默改变用户可见的搜索与索引结果；venv/vendor/Pods/__pycache__ 等由项目自带的
// .gitignore 生效解决（这才是根因）。

use std::path::Path;

/// 默认忽略目录清单（唯一真值源）
///
/// 其中以 `.` 开头的条目同时被遍历器的 `hidden(true)` 覆盖，此处保留是为了
/// 让「文件树单层列目录」这一不经过遍历器的路径也能获得同一份判定结果。
pub const DEFAULT_IGNORED_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    "coverage",
    ".next",
    ".nuxt",
    ".cache",
    ".codegraph",
    ".obsidian",
    ".git",
    ".svn",
    ".hg",
];

/// 工作区扫描的最大目录深度（搜索与文件索引共用同一上限，防异常深树）
pub const MAX_SCAN_DIR_DEPTH: usize = 64;

/// 目录名是否属于默认忽略清单（大小写不敏感）
pub fn is_ignored_dir(name: &str) -> bool {
    DEFAULT_IGNORED_DIRS
        .iter()
        .any(|ignored| name.eq_ignore_ascii_case(ignored))
}

/// 文件名是否是 Markdown（大小写不敏感）
pub fn is_markdown_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

/// 遍历失败原因
///
/// 刻意不使用 String：取消与「路径不存在」需要由调用方映射成各自的文案
/// （搜索结果与文件索引的历史文案不同，直接返回 String 会改变既有错误信息）。
#[derive(Debug, PartialEq, Eq)]
pub enum WalkError {
    /// 被更新的请求取消（代次推进）
    Cancelled,
    /// 工作区路径不存在
    NotFound(String),
}

impl WalkError {
    /// 默认文案；调用方可覆盖（如搜索保留自己既有的取消文案）
    pub fn message(&self) -> String {
        match self {
            WalkError::Cancelled => "扫描已被更新的请求取消".to_string(),
            WalkError::NotFound(path) => format!("工作区不存在: {path}"),
        }
    }
}

/// 构造工作区遍历器（本模块是唯一配置点，改配置只改这里）
///
/// `max_dir_depth` 的语义与既有 `search.rs::MAX_SEARCH_DEPTH` 一致：
/// 「包含文件的目录相对 root 的层数」，root 自身为 0 层。
/// ignore 的 `max_depth` 以「root = 0、直接子项 = 1」计数，位于 `d` 层目录内的文件
/// 处于 `d + 1` 层，故此处 +1 换算，从而保持既有深度边界不变。
fn build_walker(root: &Path, max_dir_depth: usize) -> ignore::Walk {
    let mut builder = ignore::WalkBuilder::new(root);
    builder
        // 跳过 `.` 开头的项（与历史两处实现一致）
        .hidden(true)
        // 不跟随符号链接：目录链接不成环，无需 visited 集合
        .follow_links(false)
        .max_depth(Some(max_dir_depth + 1))
        // 读取工作区内的 .gitignore
        .git_ignore(true)
        // 关键：ignore 默认只在检测到 .git 目录时才应用 .gitignore。
        // 本产品的用户大量在**非 git 目录**下写 Markdown，不设为 false 则该功能形同未做。
        .require_git(false)
        // 只认工作区内的 .gitignore，不向上读祖先目录的规则：
        // 祖先规则会随机器/临时目录环境变化，属不可复现的结果来源
        // （测试用 std::env::temp_dir()，用户主目录也可能存在规则）。
        .parents(false)
        // 关闭机器相关的 git 全局排除与 .git/info/exclude，保证跨机器可复现
        .git_global(false)
        .git_exclude(false)
        // 保留工作区内的 .ignore 文件（用户显式书写，属预期行为）
        .ignore(true)
        // 默认黑名单剪枝：只对目录生效（不误伤同名文件）
        .filter_entry(|entry| {
            // root 自身不参与名字判定：否则把名为 target/out 的目录当作工作区打开时会全空
            if entry.depth() == 0 {
                return true;
            }
            if entry.file_type().is_some_and(|ft| ft.is_dir()) {
                if let Some(name) = entry.file_name().to_str() {
                    return !is_ignored_dir(name);
                }
            }
            true
        })
        .build()
}

/// 递归收集工作区内的 Markdown 文件
///
/// - `root`：工作区根目录（调用方负责保证是目录；若传入文件，遍历器会产出该文件自身）
/// - `max_dir_depth`：目录层数上限，语义见 `build_walker`
/// - `max_files`：产出上限，达到后停止并置 `truncated`
/// - `is_cancelled`：取消判定钩子。由调用方注入，从而让搜索与索引各自持有独立代次，
///   不会出现「打开 Quick Open 把在途全局搜索取消掉」的耦合
///
/// 返回 `(files, truncated)`，`files` 按路径字节序升序（与历史 `files.sort()` 一致，
/// 保证分片并行扫描的合并顺序确定）。读取失败与非 UTF-8 路径静默跳过，不中断整个遍历。
pub fn walk_markdown_files(
    root: &Path,
    max_dir_depth: usize,
    max_files: usize,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(Vec<String>, bool), WalkError> {
    if !root.exists() {
        return Err(WalkError::NotFound(root.to_string_lossy().into_owned()));
    }

    let mut files: Vec<String> = Vec::new();
    let mut truncated = false;

    for entry in build_walker(root, max_dir_depth) {
        if is_cancelled() {
            return Err(WalkError::Cancelled);
        }
        // 权限错误等条目静默跳过（与历史 collect_md_files 的 Err(_) => return Ok(()) 一致）
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let Some(file_type) = entry.file_type() else {
            continue;
        };
        // 文件符号链接按文件处理（与历史实现一致：只跳过目录链接）
        let is_file = if file_type.is_symlink() {
            std::fs::metadata(entry.path()).is_ok_and(|meta| meta.is_file())
        } else {
            file_type.is_file()
        };
        if !is_file {
            continue;
        }
        if !is_markdown_name(&entry.file_name().to_string_lossy()) {
            continue;
        }
        if files.len() >= max_files {
            truncated = true;
            break;
        }
        if let Some(path) = entry.path().to_str() {
            files.push(path.to_string());
        }
    }

    files.sort();
    Ok((files, truncated))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static NEXT_TEST_DIR: AtomicUsize = AtomicUsize::new(0);

    /// 临时目录，Drop 时自动清理
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
                "inklingmd-ignore-{label}-{}-{nonce}-{sequence}",
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

    fn walk(root: &Path) -> Vec<String> {
        walk_with(root, 64, usize::MAX, &|| false).0
    }

    fn walk_with(
        root: &Path,
        max_depth: usize,
        max_files: usize,
        is_cancelled: &dyn Fn() -> bool,
    ) -> (Vec<String>, bool) {
        walk_markdown_files(root, max_depth, max_files, is_cancelled).expect("walk should succeed")
    }

    /// 把绝对路径列表转成相对 root 的 POSIX 风格相对路径，便于断言
    fn relative(root: &Path, files: &[String]) -> Vec<String> {
        let mut out: Vec<String> = files
            .iter()
            .map(|p| {
                Path::new(p)
                    .strip_prefix(root)
                    .expect("walked file should live under root")
                    .to_string_lossy()
                    .replace('\\', "/")
            })
            .collect();
        out.sort();
        out
    }

    #[test]
    fn only_markdown_files_are_returned_with_case_insensitive_extension() {
        let temp = TestDir::new("markdown-only");
        write(&temp.child("a.md"), "# a");
        write(&temp.child("b.markdown"), "# b");
        write(&temp.child("c.MD"), "# c");
        write(&temp.child("d.txt"), "d");
        write(&temp.child("e.mdx"), "e");

        let (files, truncated) = walk_with(&temp.path, 64, usize::MAX, &|| false);
        assert_eq!(
            relative(&temp.path, &files),
            vec!["a.md", "b.markdown", "c.MD"]
        );
        assert!(!truncated);
    }

    #[test]
    fn hidden_files_and_directories_are_skipped() {
        let temp = TestDir::new("hidden");
        write(&temp.child("visible.md"), "visible");
        write(&temp.child(".hidden.md"), "hidden file");
        write(&temp.child(".hidden/inside.md"), "hidden dir");

        let files = walk(&temp.path);
        assert_eq!(relative(&temp.path, &files), vec!["visible.md"]);
    }

    #[test]
    fn files_are_returned_in_deterministic_path_order() {
        let temp = TestDir::new("order");
        write(&temp.child("z.md"), "z");
        write(&temp.child("a.md"), "a");
        write(&temp.child("nested/m.md"), "m");

        let files = walk(&temp.path);
        let mut expected = files.clone();
        expected.sort();
        assert_eq!(
            files, expected,
            "遍历结果必须按路径字节序升序，保证分片合并顺序确定"
        );
    }

    #[test]
    fn directory_depth_boundary_matches_legacy_semantics() {
        // 既有 search.rs 的边界：位于 64 层目录内的文件收录，65 层的丢弃
        const DIR_DEPTH: usize = 64;
        let temp = TestDir::new("depth");
        let mut current = temp.path.clone();
        for depth in 1..=DIR_DEPTH + 1 {
            current = current.join(format!("level-{depth}"));
            fs::create_dir(&current).unwrap();
            if depth == DIR_DEPTH {
                write(&current.join("included.md"), "needle");
            }
            if depth == DIR_DEPTH + 1 {
                write(&current.join("excluded.md"), "needle");
            }
        }

        let files = walk(&temp.path);
        assert_eq!(files.len(), 1, "只有 64 层的文件应被收录");
        assert!(files[0].ends_with("included.md"));
    }

    #[test]
    fn gitignore_skips_listed_directory_even_without_git_dir() {
        let temp = TestDir::new("gitignore-dir");
        // 刻意不创建 .git：锁定 require_git(false)
        write(&temp.child(".gitignore"), "artifacts/\n");
        write(&temp.child("artifacts/report.md"), "ignored");
        write(&temp.child("keep.md"), "kept");

        let files = walk(&temp.path);
        assert_eq!(relative(&temp.path, &files), vec!["keep.md"]);
    }

    #[test]
    fn gitignore_wildcard_pattern_is_respected() {
        let temp = TestDir::new("gitignore-wildcard");
        write(&temp.child(".gitignore"), "*.draft.md\n");
        write(&temp.child("a.draft.md"), "ignored");
        write(&temp.child("b.md"), "kept");

        let files = walk(&temp.path);
        assert_eq!(relative(&temp.path, &files), vec!["b.md"]);
    }

    #[test]
    fn gitignore_negation_rule_keeps_the_file() {
        let temp = TestDir::new("gitignore-negation");
        // 同目录的文件级取反：避开 git「父目录被排除后无法反选子项」的语义陷阱
        write(&temp.child(".gitignore"), "*.tmp.md\n!keep.tmp.md\n");
        write(&temp.child("a.tmp.md"), "ignored");
        write(&temp.child("keep.tmp.md"), "kept");

        let files = walk(&temp.path);
        assert_eq!(relative(&temp.path, &files), vec!["keep.tmp.md"]);
    }

    #[test]
    fn nested_gitignore_applies_only_to_its_subtree() {
        let temp = TestDir::new("gitignore-nested");
        write(&temp.child("sub/.gitignore"), "secret.md\n");
        write(&temp.child("sub/secret.md"), "ignored");
        write(&temp.child("sub/other.md"), "kept");
        // 同名文件在别处不受子目录规则影响
        write(&temp.child("secret.md"), "kept");

        let files = walk(&temp.path);
        assert_eq!(
            relative(&temp.path, &files),
            vec!["secret.md", "sub/other.md"]
        );
    }

    #[test]
    fn ancestor_gitignore_outside_workspace_is_not_applied() {
        let temp = TestDir::new("gitignore-ancestor");
        // 祖先目录的规则必须被忽略（parents(false)）：否则结果会随机器环境变化
        write(&temp.child(".gitignore"), "workspace.md\n");
        let workspace = temp.child("workspace");
        fs::create_dir_all(&workspace).unwrap();
        write(&workspace.join("workspace.md"), "kept");

        let files = walk(&workspace);
        assert_eq!(relative(&workspace, &files), vec!["workspace.md"]);
    }

    #[test]
    fn default_blacklist_directories_are_skipped() {
        let temp = TestDir::new("blacklist");
        for dir in DEFAULT_IGNORED_DIRS {
            write(&temp.child(&format!("{dir}/inside.md")), "ignored");
        }
        write(&temp.child("src/main.md"), "kept");

        let files = walk(&temp.path);
        assert_eq!(relative(&temp.path, &files), vec!["src/main.md"]);
    }

    #[test]
    fn workspace_root_named_like_a_blacklist_entry_is_still_scanned() {
        // 目录名恰好是 out/target 时，root 自身不得被剪枝（否则整个工作区全空）
        let temp = TestDir::new("root-named-out");
        let workspace = temp.child("out");
        fs::create_dir_all(&workspace).unwrap();
        write(&workspace.join("note.md"), "kept");

        let files = walk(&workspace);
        assert_eq!(relative(&workspace, &files), vec!["note.md"]);
    }

    #[test]
    fn exceeding_max_files_sets_truncated_flag() {
        let temp = TestDir::new("max-files");
        for index in 0..5 {
            write(&temp.child(&format!("f{index}.md")), "x");
        }

        let (files, truncated) = walk_with(&temp.path, 64, 2, &|| false);
        assert_eq!(files.len(), 2);
        assert!(truncated, "达到上限必须对调用方可见");
    }

    #[test]
    fn cancelled_walk_returns_cancelled_error() {
        let temp = TestDir::new("cancel");
        write(&temp.child("a.md"), "a");

        let result = walk_markdown_files(&temp.path, 64, usize::MAX, &|| true);
        assert_eq!(result, Err(WalkError::Cancelled));
    }

    #[test]
    fn nonexistent_root_reports_not_found() {
        let temp = TestDir::new("missing");
        let missing = temp.child("does-not-exist");

        let result = walk_markdown_files(&missing, 64, usize::MAX, &|| false);
        assert_eq!(
            result,
            Err(WalkError::NotFound(missing.to_string_lossy().into_owned()))
        );
    }

    #[test]
    fn empty_workspace_returns_empty_list() {
        let temp = TestDir::new("empty");
        let (files, truncated) = walk_with(&temp.path, 64, usize::MAX, &|| false);
        assert!(files.is_empty());
        assert!(!truncated);
    }

    #[test]
    fn is_ignored_dir_is_case_insensitive() {
        assert!(is_ignored_dir("node_modules"));
        assert!(is_ignored_dir("NODE_MODULES"));
        assert!(is_ignored_dir("dist"));
        assert!(!is_ignored_dir("src"));
        assert!(!is_ignored_dir("docs"));
    }

    #[test]
    fn is_markdown_name_handles_compound_extensions() {
        assert!(is_markdown_name("a.md"));
        assert!(is_markdown_name("a.MARKDOWN"));
        assert!(!is_markdown_name("a.md.txt"));
        assert!(!is_markdown_name("a.txt"));
    }
}
