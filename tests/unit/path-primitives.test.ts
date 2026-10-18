// #298：路径原语的单一实现（判定 + 链接归算）
//
// 这些用例锁定两件事：
// 1) 判定口径（isAbsolutePath / isUntitledPath）只有一份，theme 侧只是 re-export；
// 2) resolvePath 必须真正折叠 `.`/`..` 并按基准目录决定分隔符 —— 链接分类器
//    依赖它算出「目标是否在工作区内」，不折叠就会把 `../docs/a.md` 判错。

import { describe, it, expect } from "vitest";
import {
  isAbsolutePath,
  isUntitledPath,
  resolvePath,
} from "../../src/lib/path-utils";
import { isAbsolutePath as isAbsolutePathFromTheme } from "../../src/theme/typora/path";

describe("#298 路径原语：isAbsolutePath", () => {
  const cases: Array<[string, string, boolean]> = [
    ["Windows 反斜杠盘符", "C:\\ws\\x.md", true],
    ["Windows 正斜杠盘符", "C:/ws/x.md", true],
    ["小写盘符", "c:\\ws\\x.md", true],
    ["UNC 共享路径", "\\\\srv\\share\\x.md", true],
    ["POSIX 根", "/ws/x.md", true],
    ["盘符相对（c:notes）不是绝对路径", "c:notes", false],
    ["普通相对路径", "docs/a.md", false],
    ["点号相对路径", "./x.md", false],
    ["空串", "", false],
  ];

  it.each(cases)("%s", (_label, input, expected) => {
    expect(isAbsolutePath(input)).toBe(expected);
  });

  it("theme 侧 re-export 与 lib 判定同源", () => {
    for (const [, input, expected] of cases) {
      expect(isAbsolutePathFromTheme(input)).toBe(expected);
    }
  });
});

describe("#298 路径原语：isUntitledPath", () => {
  const cases: Array<[string, string, boolean]> = [
    ["空串（未命名）", "", true],
    ["空白串", "   ", true],
    ["草稿虚拟路径", "untitled-1", true],
    ["名字里带 untitled 的真实文件", "untitled.md", false],
    ["Windows 绝对路径", "C:\\ws\\a.md", false],
  ];

  it.each(cases)("%s", (_label, input, expected) => {
    expect(isUntitledPath(input)).toBe(expected);
  });
});

describe("#298 路径原语：resolvePath", () => {
  const cases: Array<[string, string, string, string]> = [
    ["POSIX 越级折叠", "/ws/notes", "../docs/a.md", "/ws/docs/a.md"],
    ["POSIX 当前目录", "/ws/notes", "./a.md", "/ws/notes/a.md"],
    ["POSIX 绝对目标不依赖基准", "/ws/notes", "/other/b.md", "/other/b.md"],
    ["POSIX 绝对目标折叠 ..", "/ws/notes", "/ws/notes/../b.md", "/ws/b.md"],
    ["Windows 越级折叠且分隔符跟随基准", "C:\\ws\\notes", "..\\docs\\a.md", "C:\\ws\\docs\\a.md"],
    ["Windows 正斜杠基准保持正斜杠", "C:/ws/notes", "../docs/a.md", "C:/ws/docs/a.md"],
    ["Windows 绝对目标", "C:\\ws\\notes", "D:\\other\\b.md", "D:\\other\\b.md"],
    ["盘符根基准", "C:\\", "a.md", "C:\\a.md"],
    ["UNC 根保留双前导斜杠", "\\\\srv\\share", "a.md", "\\\\srv\\share\\a.md"],
    ["空基准保留前导 ..", "", "../x.md", "../x.md"],
  ];

  it.each(cases)("%s", (_label, base, target, expected) => {
    expect(resolvePath(base, target)).toBe(expected);
  });
});
