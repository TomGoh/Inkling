// Pandoc 命令封装
// 通过调用本地 pandoc 二进制实现 Markdown → docx 转换
// Pandoc 未安装时返回明确错误，由前端给出引导提示
// 选用 std::process::Command 而非 tauri-plugin-shell，避免新增前端依赖
//
// 命令「参数拼装」（build_*）与「执行」（run_pandoc）分离，
// 便于单测直接断言参数、用注入的假命令覆盖各分支，无需 CI 安装 pandoc。

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static TEMP_EXPORT_SEQ: AtomicU64 = AtomicU64::new(0);

/// 生成不易冲突的临时文件路径
fn make_temp_export_path() -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = TEMP_EXPORT_SEQ.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id();
    std::env::temp_dir().join(format!(
        "inkling-export-{pid}-{nonce}-{seq}.md"
    ))
}

/// 检查系统是否安装 pandoc
#[tauri::command]
pub async fn pandoc_check() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(pandoc_check_sync)
        .await
        .map_err(|e| format!("pandoc 检查任务失败: {e}"))?
}

fn pandoc_check_sync() -> Result<bool, String> {
    let output = build_pandoc_locate_command()
        .output()
        .map_err(|e| format!("查找 pandoc 失败: {}", e))?;
    Ok(output.status.success())
}

/// 构造「定位 pandoc」的命令：Windows 用 where，类 Unix 用 which
fn build_pandoc_locate_command() -> Command {
    if cfg!(target_os = "windows") {
        let mut cmd = Command::new("where");
        cmd.arg("pandoc");
        cmd
    } else {
        let mut cmd = Command::new("which");
        cmd.arg("pandoc");
        cmd
    }
}

/// 调用 pandoc 将 markdown 内容转为 docx
/// - markdown：源内容
/// - output_path：导出文件路径（用户选择）
/// - resource_dir：可选，当前 Markdown 文件目录，用于解析图片相对路径
#[tauri::command]
pub async fn pandoc_export_docx(
    markdown: String,
    output_path: String,
    resource_dir: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        pandoc_export_docx_sync(markdown, output_path, resource_dir)
    })
    .await
    .map_err(|e| format!("pandoc 导出任务失败: {e}"))?
}

fn pandoc_export_docx_sync(
    markdown: String,
    output_path: String,
    resource_dir: Option<String>,
) -> Result<(), String> {
    // 1. 写入临时 .md 文件（唯一命名防并发冲突），写完后物理落盘防 pandoc 读到未落盘内容
    let temp_md = make_temp_export_path();
    let mut temp_file =
        fs::File::create(&temp_md).map_err(|e| format!("创建临时文件失败: {}", e))?;
    if let Err(e) = temp_file.write_all(markdown.as_bytes()) {
        let _ = fs::remove_file(&temp_md);
        return Err(format!("写入临时文件失败: {}", e));
    }
    if let Err(e) = temp_file.sync_all() {
        let _ = fs::remove_file(&temp_md);
        return Err(format!("临时文件落盘(sync_all)失败: {}", e));
    }
    drop(temp_file);

    // 2. 构造并执行 pandoc 命令
    let cmd = build_pandoc_command(&temp_md, &output_path, resource_dir.as_deref());
    let result = run_pandoc(cmd);

    // 3. 清理临时文件
    let _ = fs::remove_file(&temp_md);
    result
}

/// 构造 pandoc 导出命令（参数拼装与执行分离，便于单测断言参数，避免真正调用 pandoc）
///
/// 资源路径解析：pandoc 默认按 markdown 文件所在目录解析相对路径。
/// 这里把 resource_dir 设为当前 Markdown 文件目录，让图片相对路径能被 pandoc 找到；
/// 仅当目录真实存在时才追加 `--resource-path`，否则静默忽略（降级为 pandoc 默认行为）。
fn build_pandoc_command(
    temp_md: &Path,
    output_path: &str,
    resource_dir: Option<&str>,
) -> Command {
    let mut cmd = Command::new("pandoc");
    cmd.arg(temp_md.to_string_lossy().as_ref())
        .arg("-f")
        .arg("markdown")
        .arg("-t")
        .arg("docx")
        .arg("-o")
        .arg(output_path);

    if let Some(dir) = resource_dir {
        if Path::new(dir).is_dir() {
            cmd.arg("--resource-path").arg(dir);
        }
    }
    cmd
}

/// 执行命令并统一错误映射：
/// - IO 失败（如 pandoc 不存在）→ 「执行 pandoc 失败」
/// - 非零退出码 → 「pandoc 转换失败」+ stderr
fn run_pandoc(mut cmd: Command) -> Result<(), String> {
    let output = cmd
        .output()
        .map_err(|e| format!("执行 pandoc 失败：{}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("pandoc 转换失败：{}", stderr.trim()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};
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
                "inklingmd-pandoc-{label}-{}-{nonce}-{sequence}",
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

    fn collect_args(cmd: &Command) -> Vec<String> {
        cmd.get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect()
    }

    /// 在临时目录写一个假的 pandoc 可执行脚本：stderr 固定输出一行、按给定退出码结束。
    /// 脚本路径可直接传给 run_pandoc，避免依赖 PATH / 真实 pandoc。
    fn fake_pandoc_script(dir: &Path, exit_code: u32) -> PathBuf {
        #[cfg(windows)]
        {
            let script = dir.join("fake_pandoc.cmd");
            fs::write(
                &script,
                format!(
                    "@echo off\r\necho fake pandoc error 1>&2\r\nexit /b {}\r\n",
                    exit_code
                ),
            )
            .expect("write fake pandoc script");
            script
        }
        #[cfg(not(windows))]
        {
            use std::os::unix::fs::PermissionsExt;
            let script = dir.join("fake_pandoc.sh");
            fs::write(
                &script,
                format!("#!/bin/sh\necho 'fake pandoc error' >&2\nexit {}\n", exit_code),
            )
            .expect("write fake pandoc script");
            let mut perms = fs::metadata(&script).unwrap().permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&script, perms).unwrap();
            script
        }
    }

    #[test]
    fn locate_command_targets_pandoc() {
        let cmd = build_pandoc_locate_command();
        let program = cmd.get_program().to_string_lossy().into_owned();
        #[cfg(windows)]
        assert_eq!(program, "where");
        #[cfg(not(windows))]
        assert_eq!(program, "which");
        assert_eq!(collect_args(&cmd), ["pandoc"]);
    }

    #[test]
    fn resource_dir_valid_dir_appends_flag() {
        let temp = TestDir::new("res-valid");
        let dir = temp.path.join("assets");
        fs::create_dir(&dir).unwrap();
        let dir_str = dir.to_string_lossy().into_owned();

        let cmd = build_pandoc_command(&temp.path.join("in.md"), "out.docx", Some(dir_str.as_str()));
        let args = collect_args(&cmd);

        let flag_idx = args.iter().position(|a| a == "--resource-path");
        assert!(
            flag_idx.is_some(),
            "合法目录应追加 --resource-path，实际参数: {args:?}"
        );
        let flag_idx = flag_idx.unwrap();
        assert_eq!(
            args[flag_idx + 1].as_str(),
            dir_str.as_str(),
            "--resource-path 后应紧跟目录"
        );
        // 基础参数不变
        assert!(args.starts_with(&[
            temp.path.join("in.md").to_string_lossy().into_owned(),
            "-f".into(),
            "markdown".into(),
            "-t".into(),
            "docx".into(),
            "-o".into(),
            "out.docx".into(),
        ]));
    }

    #[test]
    fn resource_dir_non_dir_is_safely_ignored() {
        let temp = TestDir::new("res-invalid");
        // 非法 / 非目录路径：文件、不存在路径、空串
        let file_path = temp.path.join("note.md");
        fs::write(&file_path, "").unwrap();
        let missing = temp.path.join("no-such-dir");

        for bad in [
            file_path.to_string_lossy().into_owned(),
            missing.to_string_lossy().into_owned(),
            String::new(),
        ] {
            let cmd = build_pandoc_command(&temp.path.join("in.md"), "out.docx", Some(bad.as_str()));
            let args = collect_args(&cmd);
            assert!(
                !args.iter().any(|a| a == "--resource-path"),
                "非目录资源路径 {bad:?} 不应追加 --resource-path，实际参数: {args:?}"
            );
        }
    }

    #[test]
    fn missing_pandoc_returns_exec_failure() {
        // 指向一个必然不存在的可执行文件，模拟 pandoc 未安装
        let err = run_pandoc(Command::new("inkling-md-no-such-pandoc-binary")).unwrap_err();
        assert!(
            err.contains("执行 pandoc 失败"),
            "pandoc 缺失应报「执行 pandoc 失败」，实际: {err}"
        );
    }

    #[test]
    fn non_zero_exit_returns_conversion_failure() {
        let temp = TestDir::new("convert-fail");
        let script = fake_pandoc_script(&temp.path, 1);

        let err = run_pandoc(Command::new(&script)).unwrap_err();
        assert!(
            err.contains("pandoc 转换失败"),
            "非零退出码应报「pandoc 转换失败」，实际: {err}"
        );
        assert!(err.contains("fake pandoc error"), "应带上 stderr 内容");
    }

    #[test]
    fn zero_exit_returns_ok() {
        let temp = TestDir::new("convert-ok");
        let script = fake_pandoc_script(&temp.path, 0);

        let result = run_pandoc(Command::new(&script));
        assert!(result.is_ok(), "退出码为 0 时应成功，实际: {result:?}");
    }

    #[test]
    fn temp_export_paths_are_unique_and_sequential() {
        let p1 = make_temp_export_path();
        let p2 = make_temp_export_path();
        assert_ne!(p1, p2, "并发/连续生成的临时导出文件路径必须唯一");
    }
}
