# 虚船向远｜Hexo 博客源码

这是 `https://morewhyhan.github.io/` 的可编辑源码。

本项目使用 **Node.js + Hexo + Butterfly**，不使用 Python。

## 只需要认识两个分支

| 分支 | 用途 | 是否手动编辑 |
| --- | --- | --- |
| `source` | 博客源码、Markdown、配置、图片和脚本 | 是 |
| `gh-pages` | Hexo 自动生成的网站成品，供 GitHub Pages 发布 | 否 |

正常流程是：

```text
在 source 写文章 → Hexo 生成网页 → 部署到 gh-pages → 网站更新
```

不要删除 `gh-pages`，也不要直接在里面修改 HTML。

## 换电脑后恢复项目

在 WSL 中运行：

```bash
git clone --recurse-submodules https://github.com/morewhyhan/morewhyhan.github.io.git
cd morewhyhan.github.io
npm install
npm run server
```

浏览器打开 `http://localhost:4000/` 即可预览。

## 发布一篇普通文章

创建文章：

```bash
npx hexo new post "文章标题"
```

随后编辑 `source/_posts/文章标题.md`。文章开头的基本信息可以写成：

```yaml
---
title: 文章标题
date: 2026-08-28 12:00:00
categories:
  - 分类名称
tags:
  - 标签名称
---
```

保存后运行：

```bash
npm run server
```

普通文章会自动出现在首页、时间轴、分类和标签页面，并使用 Butterfly 的原生文章卡片。

## 保存源码并发布网站

先把源码保存到 `source`：

```bash
git add .
git commit -m "Add new article"
git push origin source
```

再生成并发布网站：

```bash
npm run clean
npm run build
npm run deploy
```

## 常用目录

| 路径 | 内容 |
| --- | --- |
| `source/_posts/` | 自己写的普通文章 |
| `source/book/` | 图书笔记与专题资料 |
| `source/knowledge/cards/` | 机制卡片（进入图谱，不计入文章数） |
| `source/img/` | 图片 |
| `source/media/` | 首页视频等媒体 |
| `_config.yml` | Hexo 主配置 |
| `_config.butterfly.yml` | Butterfly 主题配置 |
| `source/css/custom.css` | 自定义样式 |
| `source/js/` | 首页等自定义功能 |
| `themes/butterfly/` | Butterfly 主题子模块，通常不要直接修改 |

## 知识图谱与双向链接

在任何公开 Markdown 里写 `[[另一篇文章标题]]`，或者写 `[[另一篇文章标题|显示文字]]`，就会建立一条双向可发现的关系。

构建时，`scripts/knowledge-graph.js` 会扫描普通文章、图书专题与机制卡片，生成全局图谱、当前文章的局部图谱和反向链接。普通文章默认进入图谱；机制卡片使用 `graph: true`；不希望进入图谱的页面可以使用 `graph: false`。

图书资料采用“一个专题文章 + 多个内部阅读页”的结构。这样整套资料在首页、时间轴和文章统计中只计算一次。

## 四个最常用的 Git 词

- `clone`：第一次把 GitHub 仓库完整下载到电脑。
- `pull`：把 GitHub 上的新修改同步到当前电脑。
- `commit`：在本地保存一个有说明的版本快照。
- `push`：把本地快照上传到 GitHub。

如果只是写博客，不需要学习复杂的 Git 分支操作；始终在 `source` 分支工作即可。
