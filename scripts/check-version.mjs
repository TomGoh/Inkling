#!/usr/bin/env node
// 版本号一致性校验（仅 CI 发版时强制执行，本地可手动运行自查）
// 校验 4 处版本号完全一致：
//   1. package.json                → version
//   2. src-tauri/tauri.conf.json   → version
//   3. src-tauri/Cargo.toml        → [package] version
//   4. src-tauri/Cargo.lock        → inklingmd 包 version
// 可选 --tag vX.Y.Z：同时校验 tag 名与版本一致。
// 任一不一致 exit 1（CI 拦截 release）。

import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname
  // Windows 下 URL.pathname 以 / 开头（file:///E:/...），去掉前导斜盘符
  .replace(/^\/([A-Za-z]:)/, "$1");

function fail(messages) {
  console.error("✗ 版本号校验失败：");
  for (const m of messages) console.error(`  - ${m}`);
  console.error("请同步以下 4 处版本号后重新提交/打 tag：");
  console.error("  package.json / src-tauri/tauri.conf.json / src-tauri/Cargo.toml / src-tauri/Cargo.lock");
  process.exit(1);
}

const read = (p) => readFileSync(new URL(p, `file://${root}`), "utf8");

const versions = {};
const errors = [];

// 1. package.json
try {
  versions["package.json"] = JSON.parse(read("package.json")).version;
} catch (e) {
  errors.push(`读取 package.json 失败: ${e.message}`);
}

// 2. tauri.conf.json
try {
  versions["src-tauri/tauri.conf.json"] = JSON.parse(
    read("src-tauri/tauri.conf.json"),
  ).version;
} catch (e) {
  errors.push(`读取 src-tauri/tauri.conf.json 失败: ${e.message}`);
}

// 3. Cargo.toml（[package] 段第一个 version）
try {
  const m = read("src-tauri/Cargo.toml").match(/^version\s*=\s*"([^"]+)"/m);
  if (m) versions["src-tauri/Cargo.toml"] = m[1];
  else errors.push("src-tauri/Cargo.toml 中未找到 version 字段");
} catch (e) {
  errors.push(`读取 src-tauri/Cargo.toml 失败: ${e.message}`);
}

// 4. Cargo.lock（inklingmd 包块）
try {
  const lock = read("src-tauri/Cargo.lock");
  const m = lock.match(/name\s*=\s*"inklingmd"\s*\nversion\s*=\s*"([^"]+)"/);
  if (m) versions["src-tauri/Cargo.lock"] = m[1];
  else errors.push("src-tauri/Cargo.lock 中未找到 inklingmd 包的 version");
} catch (e) {
  errors.push(`读取 src-tauri/Cargo.lock 失败: ${e.message}`);
}

if (errors.length) fail(errors);

const unique = new Set(Object.values(versions));
if (unique.size !== 1) {
  fail(
    Object.entries(versions).map(([f, v]) => `${f} = ${v}`),
  );
}

const version = Object.values(versions)[0];

// 可选：校验 tag 名与版本一致
const tagArg = process.argv.find((a) => a.startsWith("--tag="));
if (tagArg) {
  const tag = tagArg.slice("--tag=".length);
  if (tag !== `v${version}`) {
    fail([`tag 名 ${tag} 与代码版本 v${version} 不一致`]);
  }
}

console.log(`✓ 版本号一致：v${version}（4 处已同步）`);
