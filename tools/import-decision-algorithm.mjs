import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inputDir = path.resolve(process.argv[2] || '')
const outputDir = path.join(projectRoot, 'source', 'book', 'decision-algorithm')
const obsoleteDir = path.join(projectRoot, 'source', 'book', 'original')
const indexPath = path.join(projectRoot, 'source', 'book', 'index.md')

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
    `[返回目录](/book/)`,
    next ? `[${next[0]}｜${next[1][0].title.replace(/\(1\)$/u, '')} →](/book/decision-algorithm/${next[0]}/)` : ''
  ].filter(Boolean).join(' · ')

  const page = `---
title: ${yamlString(pageTitle)}
date: 2026-08-28 00:00:00
type: page
comments: false
aside: true
top_img: false
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

const index = `---
title: 图书笔记
date: 2026-08-24 00:00:00
type: page
comments: false
---

这里集中存放值得长期保留的图书资料，以及我在阅读、整理和研究过程中形成的笔记。

## 决策算法100讲

以下是《老喻·决策算法100讲》的外部原文资料，共 100 个编号页面。资料按原始编号排列，同一编号的拆分文件已合并渲染；原资料没有编号 018。

> **版权说明**：这些内容不是我的原创文章，相关著作权归原作者及原发布方所有。后续会在原文之外，逐步补充我自己的摘要、批注与方法论整理。

<ol class="book-note-list">
${indexItems.join('\n')}
</ol>
`

await writeFile(indexPath, index, 'utf8')
console.log(`Generated ${lessons.length} rendered lesson pages from ${filenames.length} numbered Markdown files.`)
