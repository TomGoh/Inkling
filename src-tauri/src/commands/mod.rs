// 文件系统相关命令
// 所有文件系统操作集中在这里，前端通过 invoke 调用，不允许前端直接拼路径操作 fs

pub mod pandoc;
pub use pandoc::{pandoc_check, pandoc_export_docx};

pub mod search;
pub use search::search_in_workspace;

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

const IGNORED_DIR_NAMES: &[&str] = &["node_modules", "target", "dist", "build", "out"];

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

/// 列出目录的直接子项
/// - 文件系统操作在线程池执行，避免阻塞 Tauri 异步运行时
/// - 跳过隐藏项、常见依赖/构建目录和目录符号链接
/// - 仅返回目录和 Markdown 文件，目录在前并按名称排序
///
/// `max_depth` 仅为兼容旧版前端调用保留；目录树现在由前端按需逐层加载
#[tauri::command]
pub async fn list_dir(dir_path: String, max_depth: Option<usize>) -> Result<FileNode, String> {
    let _ = max_depth;
    tauri::async_runtime::spawn_blocking(move || list_dir_shallow(Path::new(&dir_path)))
        .await
        .map_err(|e| format!("目录扫描任务失败: {e}"))?
}

fn list_dir_shallow(path: &Path) -> Result<FileNode, String> {
    if !path.exists() {
        return Err(format!("路径不存在: {}", path.display()));
    }
    if !path.is_dir() {
        return Err(format!("不是目录: {}", path.display()));
    }

    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());
    let mut node = FileNode {
        name,
        path: path.to_string_lossy().into_owned(),
        is_dir: true,
        children: Vec::new(),
    };

    // 排序键在收集条目时只计算一次，避免比较器反复分配 lowercase 字符串
    let mut dirs: Vec<(String, FileNode)> = Vec::new();
    let mut files: Vec<(String, FileNode)> = Vec::new();
    let entries =
        fs::read_dir(path).map_err(|e| format!("读取目录失败 {}: {e}", path.display()))?;

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(e) => {
                eprintln!("skip entry in {}: {e}", path.display());
                continue;
            }
        };
        let entry_name = entry.file_name().to_string_lossy().into_owned();
        if entry_name.starts_with('.') {
            continue;
        }

        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(e) => {
                eprintln!("skip {}: {e}", entry.path().display());
                continue;
            }
        };
        // DirEntry::file_type 不跟随链接；目录链接必须跳过，普通文件链接仍可打开
        let (is_dir, is_file) = if file_type.is_symlink() {
            match fs::metadata(entry.path()) {
                Ok(metadata) if metadata.is_dir() => continue,
                Ok(metadata) => (false, metadata.is_file()),
                Err(e) => {
                    eprintln!("skip {}: {e}", entry.path().display());
                    continue;
                }
            }
        } else {
            (file_type.is_dir(), file_type.is_file())
        };
        if is_dir && is_ignored_dir(&entry_name) {
            continue;
        }
        if !is_dir && (!is_file || !is_markdown_file(&entry.path())) {
            continue;
        }

        let child = FileNode {
            name: entry_name.clone(),
            path: entry.path().to_string_lossy().into_owned(),
            is_dir,
            children: Vec::new(),
        };
        let sortable = (entry_name.to_lowercase(), child);
        if is_dir {
            dirs.push(sortable);
        } else {
            files.push(sortable);
        }
    }

    let compare = |a: &(String, FileNode), b: &(String, FileNode)| {
        a.0.cmp(&b.0).then_with(|| a.1.name.cmp(&b.1.name))
    };
    dirs.sort_by(compare);
    files.sort_by(compare);
    node.children = dirs.into_iter().map(|(_, child)| child).collect();
    node.children
        .extend(files.into_iter().map(|(_, child)| child));

    Ok(node)
}

fn is_ignored_dir(name: &str) -> bool {
    IGNORED_DIR_NAMES
        .iter()
        .any(|ignored| name.eq_ignore_ascii_case(ignored))
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static NEXT_TEST_DIR: AtomicUsize = AtomicUsize::new(0);

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
                "inklingmd-list-dir-{label}-{}-{nonce}-{sequence}",
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

    fn touch(path: &Path) {
        fs::write(path, "").expect("create test file");
    }

    #[test]
    fn lists_only_direct_children() {
        let temp = TestDir::new("shallow");
        let nested = temp.path.join("nested");
        fs::create_dir(&nested).unwrap();
        touch(&temp.path.join("root.md"));
        touch(&nested.join("deep.md"));

        let root = list_dir_shallow(&temp.path).unwrap();

        assert!(root.is_dir);
        assert_eq!(root.children.len(), 2);
        assert_eq!(root.children[0].name, "nested");
        assert!(root.children[0].is_dir);
        assert!(root.children[0].children.is_empty());
        assert_eq!(root.children[1].name, "root.md");
        assert!(!root.children[1].is_dir);
    }

    #[test]
    fn sorts_directories_before_files_case_insensitively() {
        let temp = TestDir::new("sorting");
        fs::create_dir(temp.path.join("zebra")).unwrap();
        fs::create_dir(temp.path.join("Alpha")).unwrap();
        touch(&temp.path.join("Zeta.md"));
        touch(&temp.path.join("beta.MD"));
        touch(&temp.path.join("alpha.markdown"));

        let root = list_dir_shallow(&temp.path).unwrap();
        let names: Vec<_> = root
            .children
            .iter()
            .map(|child| child.name.as_str())
            .collect();

        assert_eq!(
            names,
            ["Alpha", "zebra", "alpha.markdown", "beta.MD", "Zeta.md"]
        );
    }

    #[test]
    fn filters_hidden_build_and_non_markdown_entries() {
        let temp = TestDir::new("filtering");
        for name in [".git", "node_modules", "target", "dist", "build", "out"] {
            fs::create_dir(temp.path.join(name)).unwrap();
        }
        fs::create_dir(temp.path.join("notes")).unwrap();
        touch(&temp.path.join(".hidden.md"));
        touch(&temp.path.join("draft.txt"));
        touch(&temp.path.join("draft.md.bak"));
        touch(&temp.path.join("README.md"));
        touch(&temp.path.join("guide.markdown"));
        for index in 0..2_000 {
            touch(&temp.path.join(format!("unrelated-{index}.txt")));
        }

        let root = list_dir_shallow(&temp.path).unwrap();
        let names: Vec<_> = root
            .children
            .iter()
            .map(|child| child.name.as_str())
            .collect();

        assert_eq!(names, ["notes", "guide.markdown", "README.md"]);
    }

    #[test]
    fn rejects_missing_and_non_directory_paths() {
        let temp = TestDir::new("invalid");
        let file_path = temp.path.join("note.md");
        touch(&file_path);

        let missing = list_dir_shallow(&temp.path.join("missing")).unwrap_err();
        let not_directory = list_dir_shallow(&file_path).unwrap_err();

        assert!(missing.contains("路径不存在"));
        assert!(not_directory.contains("不是目录"));
    }

    #[cfg(unix)]
    #[test]
    fn does_not_follow_directory_symlinks() {
        use std::os::unix::fs::symlink;

        let temp = TestDir::new("symlink");
        let target = TestDir::new("symlink-target");
        let real_dir = temp.path.join("real");
        fs::create_dir(&real_dir).unwrap();
        touch(&real_dir.join("inside.md"));
        let target_file = target.path.join("source.md");
        touch(&target_file);
        symlink(&real_dir, temp.path.join("linked")).unwrap();
        symlink(&temp.path, temp.path.join("loop")).unwrap();
        symlink(&target_file, temp.path.join("linked.md")).unwrap();

        let root = list_dir_shallow(&temp.path).unwrap();
        let names: Vec<_> = root
            .children
            .iter()
            .map(|child| child.name.as_str())
            .collect();

        assert_eq!(names, ["real", "linked.md"]);
        assert!(root.children[0].children.is_empty());
        assert!(!root.children[1].is_dir);
    }

    #[test]
    fn test_file_operations_crud() {
        let temp = TestDir::new("file_ops");
        let test_file = temp.path.join("nested/folder/test.md");
        let test_file_str = test_file.to_string_lossy().to_string();

        // 1. 测试 create_file 自动创建父目录
        create_file(test_file_str.clone()).unwrap();
        assert!(test_file.exists());
        assert_eq!(read_text_file(test_file_str.clone()).unwrap(), "");

        // 2. 测试 create_file 重复创建报错
        assert!(create_file(test_file_str.clone()).is_err());

        // 3. 测试 write_text_file 覆盖写入
        write_text_file(test_file_str.clone(), "# Hello World\nLine 2".into()).unwrap();
        assert_eq!(
            read_text_file(test_file_str.clone()).unwrap(),
            "# Hello World\nLine 2"
        );

        // 4. 测试 file_mtime 获取时间戳
        let mtime = file_mtime(test_file_str.clone()).unwrap();
        assert!(mtime > 0.0);

        // 5. 测试 write_binary_file
        let bin_file = temp.path.join("nested/folder/image.png");
        let bin_file_str = bin_file.to_string_lossy().to_string();
        let bin_data = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        write_binary_file(bin_file_str.clone(), bin_data.clone()).unwrap();
        let read_bin = fs::read(&bin_file).unwrap();
        assert_eq!(read_bin, bin_data);

        // 6. 测试 rename_path
        let renamed_file = temp.path.join("nested/folder/renamed.md");
        let renamed_str = renamed_file.to_string_lossy().to_string();
        rename_path(test_file_str.clone(), renamed_str.clone()).unwrap();
        assert!(!test_file.exists());
        assert!(renamed_file.exists());
        assert_eq!(
            read_text_file(renamed_str.clone()).unwrap(),
            "# Hello World\nLine 2"
        );

        // 7. 测试 delete_path (文件和目录)
        delete_path(renamed_str).unwrap();
        assert!(!renamed_file.exists());

        let nested_dir = temp.path.join("nested");
        assert!(nested_dir.exists());
        delete_path(nested_dir.to_string_lossy().to_string()).unwrap();
        assert!(!nested_dir.exists());
    }

    #[test]
    fn test_create_dir_and_errors() {
        let temp = TestDir::new("create_dir");
        let dir = temp.path.join("a/b/c");
        let dir_str = dir.to_string_lossy().to_string();

        create_dir(dir_str.clone()).unwrap();
        assert!(dir.is_dir());

        // 重复创建应报错
        let err = create_dir(dir_str).unwrap_err();
        assert!(err.contains("目录已存在"));

        // 读取不存在文件应报错
        let not_found_err =
            read_text_file(temp.path.join("nonexistent.md").to_string_lossy().to_string())
                .unwrap_err();
        assert!(not_found_err.contains("文件不存在"));

        // 获取不存在文件 mtime 应报错
        let mtime_err =
            file_mtime(temp.path.join("nonexistent.md").to_string_lossy().to_string()).unwrap_err();
        assert!(mtime_err.contains("文件不存在"));
    }
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

/// 写入二进制文件（图片等），覆盖写入，不存在则创建
#[tauri::command]
pub fn write_binary_file(file_path: String, data: Vec<u8>) -> Result<(), String> {
    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
        }
    }
    fs::write(path, data).map_err(|e| format!("写入失败 {}: {}", file_path, e))
}

/// 读取文件的最后修改时间（Unix 秒，浮点）
/// 用于前端轮询检测外部修改，提示用户重新加载
#[tauri::command]
pub fn file_mtime(file_path: String) -> Result<f64, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }
    let meta = fs::metadata(path).map_err(|e| format!("读取元数据失败: {}", e))?;
    let mtime = meta
        .modified()
        .map_err(|e| format!("读取修改时间失败: {}", e))?;
    let secs = mtime
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .map_err(|e| e.to_string())?;
    Ok(secs)
}

/// 重命名/移动文件或目录
#[tauri::command]
pub fn rename_path(from: String, to: String) -> Result<(), String> {
    let from_path = Path::new(&from);
    let to_path = Path::new(&to);
    if !from_path.exists() {
        return Err(format!("源路径不存在: {}", from));
    }
    if to_path.exists() {
        return Err(format!("目标已存在: {}", to));
    }
    fs::rename(from_path, to_path).map_err(|e| format!("重命名失败: {}", e))
}

/// 删除文件或目录（目录时递归删除）
#[tauri::command]
pub fn delete_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| format!("删除目录失败: {}", e))
    } else {
        fs::remove_file(p).map_err(|e| format!("删除文件失败: {}", e))
    }
}

/// 创建空文件（如果父目录不存在则创建）
#[tauri::command]
pub fn create_file(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    if path.exists() {
        return Err(format!("文件已存在: {}", file_path));
    }
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
        }
    }
    fs::write(path, "").map_err(|e| format!("创建文件失败: {}", e))
}

/// 创建目录（含父目录）
#[tauri::command]
pub fn create_dir(dir_path: String) -> Result<(), String> {
    let path = Path::new(&dir_path);
    if path.exists() {
        return Err(format!("目录已存在: {}", dir_path));
    }
    fs::create_dir_all(path).map_err(|e| format!("创建目录失败: {}", e))
}

/// 把目录加入 asset 协议运行时白名单（递归）
/// tauri.conf.json 的静态 scope 只覆盖用户目录；工作区/文档位于其他磁盘分区
/// （如 Windows 的 E:\code\...）时，图片经 convertFileSrc 加载会被 asset 协议拒绝。
/// 前端在解析图片路径时对文档所在目录调用本命令动态放行，仅放行用户实际打开的目录。
#[tauri::command]
pub fn allow_asset_dir(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri::Manager;
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("不是目录: {}", path));
    }
    app.asset_protocol_scope()
        .allow_directory(dir, true)
        .map_err(|e| format!("放行目录失败: {}", e))
}
