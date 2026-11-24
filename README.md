# GitHub Slideshow:Rainbow

一个用 [reveal.js](https://revealjs.com/) 驱动的 HTML 幻灯片项目，采用 Solarized 暗色主题。

本仓库最初是 GitHub Learning Lab 的教程模板，原本依赖 Ruby + Jekyll 构建；现已改造为**纯 Node.js 工具链**，
在 Windows / macOS / Linux 上都无需安装 Ruby 即可打包和运行。

---

## 一、项目用途

- 用若干 Markdown 文件（`_posts/`）编写幻灯片，构建成一份可通过浏览器展示的网页演示。
- 支持 reveal.js 的标准能力：左右方向键翻页、`Esc` 总览、演讲者备注、打印成 PDF。
- 适合课堂、内部分享、学习 Git/GitHub 场景。

## 二、快速开始

### 环境要求

- Node.js **18 及以上**（开发环境为 Node 24）
- npm

### 安装依赖

```bash
npm install
```

### 本地运行（构建 + 启动预览服务器）

```bash
npm start
```

然后浏览器打开：

```
http://localhost:4000/github-slideshow/
```

> 修改了幻灯片或样式后，`Ctrl+C` 停止，再重新执行 `npm start` 即可看到最新内容。

### 其他命令

| 命令 | 作用 |
| --- | --- |
| `npm run build` | 只构建，输出到 `_site/` 目录 |
| `npm run preview` | 为已构建好的 `_site/` 启动静态服务器（不重新构建） |
| `npm start` / `npm run serve` | 构建并启动预览服务器 |
| `npm run check` | 冒烟检查：确认 `_site/index.html` 存在且页面引用的本地资源都能找到 |
| `PORT=5000 npm start` | 指定端口启动（默认 4000） |

### 打包 / 部署

构建产物是完全静态的站点，位于 `./_site/`：

```bash
npm run build
```

把 `_site/` 目录整体部署到任意静态托管即可：

- **GitHub Pages**：`_config.yml` 中 `baseurl` 为 `/github-slideshow`，若发布到
  `https://<用户名>.github.io/github-slideshow/`，可直接发布 `_site/` 内容。
- **其他静态服务器**：若部署在域名根路径，需把 `_config.yml` 的 `baseurl` 改成 `""`
  （或修改为实际子路径），再重新构建。

## 三、操作方式

| 操作 | 按键 |
| --- | --- |
| 下一页 / 上一页 | `→` / `←` |
| 垂直翻页（嵌套幻灯片） | `↓` / `↑` |
| 幻灯片总览 | `Esc` 或 `O` |
| 演讲者备注窗口 | `S` |
| 全屏 | `F` |
| 导出 PDF | 在 URL 后加 `?print-pdf`，页面会自动弹出打印对话框 → 选「另存为 PDF」 |

## 四、目录结构

```
.
├── _config.yml          # 站点配置：标题、作者、baseurl、reveal.js 各项参数
├── _posts/              # 幻灯片内容（一个 .md 文件 = 一张幻灯片）
├── _layouts/            # 页面骨架
│   ├── presentation.html# 演示布局（.reveal > .slides 容器）
│   └── print.html       # 打印用布局
├── _includes/           # 可复用的页面片段
│   ├── head.html        # <head> 内容、样式/脚本引用、PDF 打印样式
│   ├── slide.html       # 单张幻灯片的 HTML 结构
│   └── script.html      # reveal.js 初始化与依赖加载
├── _sass/               # 样式源码（Solarized 主题、FontAwesome、字体声明）
├── assets/
│   ├── css/style.scss   # 样式入口（引用 npm 包中的字体）
│   ├── js/              # jQuery
│   └── fonts/           # 本地字体兜底目录（OpenSans、FontAwesome 旧文件）
├── index.html           # 入口页面：遍历 _posts 生成幻灯片
├── script/              # 构建工具（Node.js）
│   ├── build.mjs        # 核心构建脚本
│   ├── server.mjs       # 静态预览服务器
│   ├── preview.mjs      # 仅启动服务器
│   └── check.mjs        # 产物冒烟检查
├── package.json         # npm 依赖与命令
└── _site/               # 构建输出（git 忽略）
```

## 五、如何编写幻灯片

在 `_posts/` 下新建一个 Markdown 文件，命名格式为 `年-月-日-标题.md`，例如：

```
_posts/0000-01-03-my-topic.md
```

文件内容：

```markdown
---
layout: slide
title: "我的新幻灯片"
---

这里是正文，支持 **Markdown** 语法。

- 列表项一
- 列表项二
```

- `title` 会渲染为幻灯片的大标题。
- 正文支持 Markdown。
- 幻灯片顺序按**文件名排序**后**反转**（后创建的文件排在前面），可在 `index.html` 中调整排序逻辑。

### 高级：单页配置

`_includes/slide.html` 支持在 front matter 中使用：

| 字段 | 说明 |
| --- | --- |
| `slide-id` | 设置该 `<section>` 的 `id` |
| `classes` | 追加到该 section 的 class 列表（如 `classes: [dark]`） |
| `data` | 映射为 `data-*` 属性（如 `data: { autoslide: 5000 }`） |

## 六、自定义配置

主要参数集中在 `_config.yml`：

- `title` / `author` / `description`：站点信息。
- `baseurl`：站点路径前缀，需与实际部署路径一致。
- `reveal`：reveal.js 的初始化参数（控件、进度条、历史记录、转场、尺寸等）。
- `slideNumber.format`：页码格式，如 `"c/t"`（当前/总数）、`"h.v"`、`"none"`。
- `solarized.theme`：主题明暗（`dark` / `light`）。

样式修改：编辑 `_sass/solarized/solarized.scss` 中的颜色、字体等变量。

## 七、构建工具说明（重要）

为了让项目在无 Ruby 的环境下也能构建，`script/build.mjs` 用 Node.js 实现了本项目用到的
一个 **Jekyll 子集**：

1. 读取 `_config.yml`（js-yaml）。
2. 解析 `_posts/*.md` 与页面 front matter（gray-matter），Markdown 转 HTML（marked）。
3. 渲染 `_layouts/*.html`、`_includes/*.html` 中的 Liquid 标签，支持：
   `{% if %}` / `{% unless %}` / `{% elsif %}` / `{% else %}`、`{% for %}`、
   `{% assign %}`、`{% include %}`、`{{ 变量 }}`、以及 `size` / `default` / `reverse` /
   `first` / `last` / `join` / `upcase` / `downcase` / `strip` / `escape` / `relative_url` /
   `absolute_url` 等过滤器。
4. 编译 `assets/**/*.scss`（Sass）。
5. 把 npm 包中的运行时资源拷入 `_site/`：
   - `reveal.js` 3.9.2 的 `css/ js/ lib/ plugin/`
   - FontAwesome 字体、Open Sans 字体、Noto Serif（Latin 400/700）
6. 输出静态站点到 `_site/`。

> 注意：这不是完整的 Jekyll。如果你的模板用到了上述之外的 Liquid 标签或 Jekyll 插件
> （如 `jemoji`、`{% capture %}`、自定义标签），需要在 `script/build.mjs` 中扩展实现，
> 或改回使用原生 Jekyll。

### 关于字体

- **Open Sans**、**FontAwesome** 来自 npm 包，构建时自动复制到 `_site/assets/fonts/`。
- **引用/引用块字体**使用 Noto Serif（`@fontsource/noto-serif`，Droid Serif 的继任者）。
- `assets/fonts/` 下仍保留了部分旧字体文件作为兜底，新样式以 npm 包为准。

## 八、与原始模板的差异

| 项目 | 原始 | 现在 |
| --- | --- | --- |
| 构建工具 | Ruby + Jekyll + Bundler | Node.js + npm 脚本 |
| reveal.js | git 子模块（仓库中为空目录） | npm 包 `reveal.js@3.9.2` |
| 字体 | 本地 Droid Serif / Open Sans 文件 | npm 包（Noto Serif 替代 Droid Serif） |
| 预览 | `bundle exec jekyll serve` | `npm start`（内置 Node 静态服务器） |
| 部署 | GitHub Pages / 内部 staging 脚本 | 直接部署 `_site/` |

原 `Gemfile`、`circle.yml`、`script/setup|server|stage|cibuild` 等 Ruby/CI 脚本已移除。

## 九、常见问题

**Q：访问 `http://localhost:4000/` 打不开、资源 404？**
请使用带前缀的地址 `http://localhost:4000/github-slideshow/`，因为 `_config.yml` 的
`baseurl` 是 `/github-slideshow`。预览服务器同时兼容两种路径。

**Q：改了 `_posts` 里的内容，页面没变？**
构建是一次性的，重新执行 `npm start`（或 `npm run build`）即可。

**Q：部署后样式/脚本丢失？**
检查 `_config.yml` 的 `baseurl` 是否与部署路径一致，修改后重新构建。

**Q：想导出 PDF？**
访问 `http://localhost:4000/github-slideshow/?print-pdf`。页面会自动弹出浏览器的打印对话框；
如果没有弹出，按 `Ctrl+P`（macOS 为 `Cmd+P`）手动打开。打印设置中：

- 「目标 / 另存为」选择 **另存为 PDF**
- 展开「更多设置」，勾选 **背景图形 / 打印背景**（否则彩虹色带和深色背景会丢失）
- 纸张方向选 **横向**，边距选 **无**
- 页数应等于幻灯片张数（本项目为 9 页）；若出现大量空白页，说明 `.rainbow` 高度样式
  未在打印模式下失效，检查 `_sass/rainbow.scss` 中的 `.print-pdf` 覆盖规则是否被改动。

## 十、许可证

见根目录 [LICENSE](LICENSE)。
