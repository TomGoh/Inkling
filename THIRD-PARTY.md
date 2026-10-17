# 第三方组件与主题署名（THIRD-PARTY）

> 本文件是**第三方作品**的署名与许可清单，与项目贡献者名单分列、不合并。
> 生成：`npm run gen:theme-notice`；校验：`npm run check:theme-licenses`。
> 登记对象是**安装包内的只读源副本** `src-tauri/resources/themes/`（不查用户机器上的运行时副本）。
> 安装包内随附的许可文本：`$RESOURCE/themes/NOTICE`。

## 预装主题（Typora 生态）

### drake

- 预装主题 id：`bundled:drake`、`bundled:drake-dark`（明暗成对，同一上游作品）
- 上游：https://github.com/liangjingkanji/DrakeTyporaTheme（版本 `2.9.6`，commit `93187ff893a51177fc33421d3810acd37a5a7890`）
- 许可：**MIT**，归档全文见 `docs/licenses/drake-LICENSE`；**安装包内副本见 `$RESOURCE/themes/NOTICE`**
- Copyright (c) 2023 劉強東
- 随包文件：drake.css（上游 `drake-light.css`，**仅重命名，内容逐字节未改**，25734 字节，sha256 `ca49fc1c10b47522…`）
- 随包文件：drake-dark.css（上游 `drake-dark.css`，**上游同名，内容未改动**，27003 字节，sha256 `88df57d0125441c6…`）
- **未随包资源**：上游 `drake/font.css`（字体声明文件，其内 `@font-face` 引用的字体文件亦未随包）——本应用字体策略为**默认降级系统字体、不内嵌**（尤其中文大字体），故不随包分发；相应 `@font-face` 失效后由系统字体接管。

### lapis

- 预装主题 id：`bundled:lapis`、`bundled:lapis-dark`（明暗成对，同一上游作品）
- 上游：https://github.com/YiNNx/typora-theme-lapis（版本 `v1.2.1`，commit `697a9c4f53e6f3653bec0395b2a6da984e41a0c4`）
- 许可：**MIT**，归档全文见 `docs/licenses/lapis-LICENSE`；**安装包内副本见 `$RESOURCE/themes/NOTICE`**
- Copyright (c) 2024 YiNN
- 随包文件：lapis.css（上游 `lapis.css`，**上游同名，内容未改动**，16638 字节，sha256 `fea96d3541e14797…`）
- 随包文件：lapis-dark.css（上游 `lapis-dark.css`，**上游同名，内容未改动**，6926 字节，sha256 `6d0c9498ebcbfe71…`）
- **未随包资源**：上游 4 个字体文件（`Cantarell-VF-fixed.otf` 0.1 MB、`JetBrainsMono-Regular.ttf` 0.3 MB、`SourceHanSerifCN-Medium.ttf` 13.4 MB、`SourceHanSerifCN-Bold.ttf` 13.5 MB，合计 28.5 MB）——本应用字体策略为**默认降级系统字体、不内嵌**（尤其中文大字体），故不随包分发；相应 `@font-face` 失效后由系统字体接管。

### notion

- 预装主题 id：`bundled:notion`、`bundled:notion-dark`（明暗成对，同一上游作品）
- 上游：https://github.com/adrian-fuertes/typora-notion-theme（版本 `v1.2.1`，commit `e3d9a50524378a401df7bde792773e71f2a90cd6`）
- 许可：**MIT**，归档全文见 `docs/licenses/notion-LICENSE`；**安装包内副本见 `$RESOURCE/themes/NOTICE`**
- Copyright (c) 2022 adrian-fuertes
- 随包文件：notion.css（上游 `themes/classic/notion-light-classic.css`，**仅重命名，内容逐字节未改**，17088 字节，sha256 `57632cb39bf6a1fa…`）
- 随包文件：notion-dark.css（上游 `themes/classic/notion-dark-classic.css`，**仅重命名，内容逐字节未改**，17152 字节，sha256 `2110082e05d5815f…`）

## 运行时依赖

- KaTeX / Mermaid / CodeMirror 等运行时依赖按其自身许可（MIT 等）分发；按同一条「副本须附版权与许可」的条件，**其声明也应随包提供**。
  当前只在仓库内登记（`package.json` 与各自仓库），**尚未随包产出** → 已登记为后续项。
