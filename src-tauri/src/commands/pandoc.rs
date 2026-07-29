// Pandoc 命令封装
// 通过调用本地 pandoc 二进制实现 Markdown → docx 转换
// Pandoc 未安装时返回明确错误，由前端给出引导提示
// 选用 std::process::Command 而非 tauri-plugin-shell，避免新增前端依赖

use std::fs;
use std::path::Path;
use std::process::Command;

/// 检查系统是否安装 pandoc
#[tauri::command]
pub fn pandoc_check() -> Result<bool, String> {
    let result = if cfg!(target_os = "windows") {
        Command::new("where").arg("pandoc").output()
    } else {
        Command::new("which").arg("pandoc").output()
    };
    match result {
        Ok(o) => Ok(o.status.success()),
        Err(e) => Err(format!("查找 pandoc 失败: {}", e)),
    }
}

/// 调用 pandoc 将 markdown 内容转为 docx
/// - markdown：源内容
/// - output_path：导出文件路径（用户选择）
/// - resource_dir：可选，工作区根目录，用于解析图片相对路径
#[tauri::command]
pub fn pandoc_export_docx(
    markdown: String,
    output_path: String,
    resource_dir: Option<String>,
) -> Result<(), String> {
    // 1. 写入临时 .md 文件
    let temp_dir = std::env::temp_dir();
    let temp_md = temp_dir.join(format!("inkling-export-{}.md", std::process::id()));
    fs::write(&temp_md, &markdown).map_err(|e| format!("写入临时文件失败: {}", e))?;

    // 2. 构造 pandoc 命令
    let mut cmd = Command::new("pandoc");
    cmd.arg(temp_md.to_string_lossy().as_ref())
        .arg("-f")
        .arg("markdown")
        .arg("-t")
        .arg("docx")
        .arg("-o")
        .arg(&output_path);

    // 资源路径解析：pandoc 默认按 markdown 文件所在目录解析相对路径
    // 这里把 resource_dir 设为工作区根目录，让图片相对路径能被 pandoc 找到
    if let Some(dir) = resource_dir.as_ref() {
        if Path::new(dir).is_dir() {
            cmd.arg("--resource-path").arg(dir);
        }
    }

    // 3. 执行
    let output = cmd
        .output()
        .map_err(|e| format!("执行 pandoc 失败：{}", e))?;

    // 4. 清理临时文件
    let _ = fs::remove_file(&temp_md);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("pandoc 转换失败：{}", stderr.trim()));
    }
    Ok(())
}
