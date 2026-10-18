//! 导航兜底（#298）：把「应用内的 WebView 永远不会被导航走」变成 Rust 侧的可执行约束。
//!
//! 落点必须是插件级 `on_navigation`，不能是 `WebviewWindowBuilder`：
//! - 主窗口来自 `tauri.conf.json`，Rust 侧没有 builder 可挂；
//! - 子窗口由前端 `new WebviewWindow` 创建（`src/lib/newWindow.ts`），Rust 同样摸不到；
//! - 插件级钩子在 `manager/webview.rs` 对所有 webview 统一分发，是唯一能覆盖全部窗口的入口。
//!
//! 注意：该钩子对**首次加载**同样生效，所以 `tauri://localhost` /
//! `http://tauri.localhost` / dev 的 localhost 必须在白名单里，否则应用起不来。
//!
//! 行为边界：被拒绝的导航**不**在 Rust 侧转交 opener。前端 Ctrl+点击已经负责
//! 「用系统浏览器打开」，这里再转交会一次点击开两个窗口；而且产品语义是
//! 「裸点击不跟随」，静默拒绝才是正确结果。

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime, Url,
};

/// 导航白名单判定（纯函数，便于表驱动单测）。
///
/// 放行：
/// - `tauri` / `asset` / `about` 协议（应用自身页面、资源协议、空白页）；
/// - `http(s)://tauri.localhost`、`http(s)://asset.localhost`（Windows 上的等价形态）；
/// - dev 下的 `localhost` / `127.0.0.1`（vite dev server，端口可自定义）。
///
/// 拒绝：外站 http(s)、`file:`、`mailto:`、`javascript:`、`data:` 等一切其它协议。
pub fn is_allowed_navigation(url: &Url, is_dev: bool) -> bool {
    match url.scheme() {
        "tauri" | "asset" | "about" => true,
        "http" | "https" => match url.host_str() {
            Some("tauri.localhost") | Some("asset.localhost") => true,
            Some("localhost") | Some("127.0.0.1") => is_dev,
            _ => false,
        },
        _ => false,
    }
}

/// 注册导航守卫插件（app 级，对所有 webview 生效）。
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("inkling-nav-guard")
        .on_navigation(|_webview, url| is_allowed_navigation(url, cfg!(dev)))
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(raw: &str) -> Url {
        Url::parse(raw).expect("测试 URL 必须可解析")
    }

    #[test]
    fn allows_app_origins_and_asset_protocol() {
        for raw in [
            "tauri://localhost",
            "http://tauri.localhost",
            "https://tauri.localhost",
            "asset://localhost/x.png",
            "http://asset.localhost/C%3A/themes/a.png",
            "about:blank",
        ] {
            assert!(
                is_allowed_navigation(&parse(raw), false),
                "{raw} 应放行（否则首次加载/图片资源会挂）"
            );
        }
    }

    #[test]
    fn rejects_external_and_scripting_schemes() {
        for raw in [
            "https://example.com",
            "http://example.com/a",
            "file:///C:/tmp/x.md",
            "mailto:a@b.com",
            "javascript:alert(1)",
            "data:text/html,hi",
            "ftp://example.com/x",
        ] {
            assert!(
                !is_allowed_navigation(&parse(raw), false),
                "{raw} 必须拒绝（否则点击链接会把应用导航走）"
            );
        }
    }

    #[test]
    fn dev_server_is_only_allowed_in_dev() {
        let localhost = parse("http://localhost:1420/");
        assert!(is_allowed_navigation(&localhost, true));
        assert!(!is_allowed_navigation(&localhost, false));

        let loopback = parse("http://127.0.0.1:3000/");
        assert!(is_allowed_navigation(&loopback, true));
        assert!(!is_allowed_navigation(&loopback, false));
    }
}
