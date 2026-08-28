import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inputDir = path.resolve(process.argv[2] || '')
const outputDir = path.join(projectRoot, 'source', 'book', 'decision-algorithm')
const obsoleteDir = path.join(projectRoot, 'source', 'book', 'original')
const collectionPostPath = path.join(projectRoot, 'source', '_posts', 'decision-algorithm.md')
const libraryIndexPath = path.join(projectRoot, 'source', 'book', 'index.md')

if (!process.argv[2]) {
  throw new Error('Usage: node tools/import-decision-algorithm.mjs <markdown-directory>')
}

const filenames = (await readdir(inputDir))
  .filter(name => /^\d{3}[a-z]?__.+\.md$/iu.test(name))
  .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))

const groups = new Map()
for (const filename of filenames) {
  const match = filename.match(/^(\d{3})([a-z]?)__(.+)\.md$/iu)
  if (!match) continue
  const [, sequence, part, title] = match
  const entry = { filename, part, title }
  groups.set(sequence, [...(groups.get(sequence) || []), entry])
}

const lessons = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
if (lessons.length !== 100) {
  throw new Error(`Expected 100 numbered lessons, found ${lessons.length}.`)
}

function yamlString(value) {
  return JSON.stringify(value)
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function prepareBody(markdown) {
  const withoutBom = markdown.replace(/^\uFEFF/, '')
  const withoutTitle = withoutBom.replace(/^#\s+.+(?:\r?\n)+/u, '')

  return withoutTitle.replace(
    /!\[([^\]]*)\]\((?:原图配图：[^)]*|\.\.\/visual_[^)]*)\)/gu,
    (_, alt) => `> **配图说明：** ${alt}（原资料未附图片文件）`
  ).trim()
}

await rm(outputDir, { recursive: true, force: true })
await rm(obsoleteDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })

const indexItems = []

for (let lessonIndex = 0; lessonIndex < lessons.length; lessonIndex += 1) {
  const [sequence, parts] = lessons[lessonIndex]
  const primaryTitle = parts[0].title.replace(/\(1\)$/u, '')
  const pageTitle = `${sequence}｜${primaryTitle}`
  const pageDir = path.join(outputDir, sequence)
  await mkdir(pageDir, { recursive: true })

  const sections = []
  for (const [partIndex, part] of parts.entries()) {
    const markdown = await readFile(path.join(inputDir, part.filename), 'utf8')
    const body = prepareBody(markdown)
    if (parts.length === 1) {
      sections.push(body)
    } else {
      const partLabel = part.part ? part.part.toUpperCase() : String(partIndex + 1)
      sections.push(`## ${partLabel}｜${part.title.replace(/\(1\)$/u, '')}\n\n${body}`)
    }
  }

  const previous = lessons[lessonIndex - 1]
  const next = lessons[lessonIndex + 1]
  const navigation = [
    previous ? `[← ${previous[0]}｜${previous[1][0].title.replace(/\(1\)$/u, '')}](/book/decision-algorithm/${previous[0]}/)` : '',
    `[返回《决策算法100讲》目录](/book/decision-algorithm/)`,
    next ? `[${next[0]}｜${next[1][0].title.replace(/\(1\)$/u, '')} →](/book/decision-algorithm/${next[0]}/)` : ''
  ].filter(Boolean).join(' · ')

  const page = `---
title: ${yamlString(pageTitle)}
date: 2026-08-28 00:00:00
type: page
comments: false
aside: true
top_img: false
graph: false
description: ${yamlString(`《老喻·决策算法100讲》${sequence}：${primaryTitle}`)}
---

> **资料说明**：本文为《老喻·决策算法100讲》的外部原文资料，非本站原创。相关著作权归原作者及原发布方所有。

${sections.join('\n\n---\n\n')}

---

${navigation}
`

  await writeFile(path.join(pageDir, 'index.md'), page, 'utf8')
  indexItems.push(`  <li><a href="/book/decision-algorithm/${sequence}/"><span>${sequence}</span>${escapeHtml(primaryTitle)}</a></li>`)
}

const collectionIndex = `---
title: 决策算法100讲
date: 2026-08-28 00:00:00
permalink: book/decision-algorithm/
categories:
  - 图书笔记
tags:
  - 决策
  - 概率
  - 博弈
description: 老喻关于概率、风险、博弈与人生选择的系统课程资料；全套资料在本站按一个专题收录。
cover: /img/hua.png
original: false
copyright: false
comments: false
graph: true
aliases:
  - 决策算法
  - 老喻决策算法100讲
---

[← 返回图书笔记](/book/)

## 全部章节

以下是《老喻·决策算法100讲》的外部原文资料，共 100 个编号页面。资料按原始编号排列，同一编号的拆分文件已合并渲染；原资料没有编号 018。

> **版权说明**：这些内容不是我的原创文章，相关著作权归原作者及原发布方所有。后续会在原文之外，逐步补充我自己的摘要、批注与方法论整理。

这套资料在首页、时间轴、文章统计与知识图谱中只作为**一个专题**计算；下面的 100 个章节只是专题内部的阅读页。

这套资料与本站的 [[有限信息下的决策]]、[[机会成本]] 和 [[复盘]] 等机制卡片相互关联。

<!-- more -->

<ol class="book-note-list">
${indexItems.join('\n')}
</ol>
`

const libraryIndex = `---
title: 图书笔记
date: 2026-08-24 00:00:00
type: page
comments: false
---

这里集中存放值得长期保留的图书资料，以及我在阅读、整理和研究过程中形成的笔记。每一本书或每一套资料都有自己的独立目录，不会彼此混在一起。

## 专题书目

<div id="recent-posts" class="recent-posts nc">
  <div class="recent-post-items">
    <div class="recent-post-item">
      <div class="post_cover left">
        <a href="/book/decision-algorithm/" title="决策算法100讲">
          <img class="post-bg" src="/img/hua.png" alt="决策算法100讲">
        </a>
      </div>
      <div class="recent-post-info">
        <a class="article-title" href="/book/decision-algorithm/" title="决策算法100讲">决策算法100讲</a>
        <div class="article-meta-wrap">
          <span class="article-meta">
            <i class="fas fa-inbox"></i>
            <span class="article-meta__categories">图书笔记</span>
            <span class="article-meta-separator">|</span>
            <i class="fas fa-book-open"></i>
            <span>100 讲</span>
          </span>
        </div>
        <div class="content">老喻关于概率、风险、博弈与人生选择的系统课程资料。点击进入专题目录，阅读全部 100 讲。</div>
      </div>
    </div>
  </div>
</div>

以后加入的其他书籍与资料，会作为新的专题继续排列在这里。
`

await mkdir(path.dirname(collectionPostPath), { recursive: true })
await writeFile(collectionPostPath, collectionIndex, 'utf8')
await writeFile(libraryIndexPath, libraryIndex, 'utf8')
console.log(`Generated ${lessons.length} rendered lesson pages from ${filenames.length} numbered Markdown files.`)
