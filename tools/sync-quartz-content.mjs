import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { jiangSections, jiangXueqinTitles } from "./jiang-xueqin-titles.mjs"

const toolsDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(toolsDir, "..")
const sourceDir = path.join(rootDir, "source")
const quartzContentDir = path.join(rootDir, "apps", "quartz", "content")
const generatedDirs = [path.join(quartzContentDir, "blog"), path.join(quartzContentDir, "books")]

function assertInside(parent, child) {
  const relative = path.relative(parent, child)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to touch a path outside ${parent}: ${child}`)
  }
}

function toPosixPath(value) {
  return value.split(path.sep).join("/")
}

function toWikiPath(value) {
  return toPosixPath(value).replace(/\.md$/i, "")
}

function extractTitle(markdown, fallback) {
  const frontmatter = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)
  const title = frontmatter?.[1].match(/^title:\s*["']?(.*?)["']?\s*$/m)?.[1]?.trim()
  if (title) return title

  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim()
  return heading || fallback
}

function stripTerminalNavigation(markdown, pathFragment) {
  const normalized = markdown.replace(/\r\n/g, "\n").trimEnd()
  const marker = normalized.lastIndexOf("\n---\n")
  if (marker === -1) return normalized

  const tail = normalized.slice(marker)
  if (tail.length <= 1200 && tail.includes(pathFragment)) {
    return normalized.slice(0, marker).trimEnd()
  }

  return normalized
}

function setChineseTitle(markdown, title) {
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
  const frontmatter = normalized.match(/^---\n([\s\S]*?)\n---\n?/)
  let body = normalized
  let metadata = ""

  if (frontmatter) {
    metadata = frontmatter[1]
    body = normalized.slice(frontmatter[0].length)
    if (/^title:/m.test(metadata)) {
      metadata = metadata.replace(/^title:.*$/m, `title: ${JSON.stringify(title)}`)
    } else {
      metadata = `title: ${JSON.stringify(title)}\n${metadata}`
    }
  } else {
    metadata = `title: ${JSON.stringify(title)}`
  }

  body = body.replace(/^\s*#\s+[^\n]+\n+/, "").trimStart()
  return `---\n${metadata}\n---\n\n${body.trimEnd()}\n`
}

function addAdjacentLinks(markdown, previous, next) {
  const links = []
  if (previous) links.push(`上一讲：[[${previous.target}|${previous.title}]]`)
  if (next) links.push(`下一讲：[[${next.target}|${next.title}]]`)
  if (links.length === 0) return `${markdown.trimEnd()}\n`
  return `${markdown.trimEnd()}\n\n---\n\n${links.join(" · ")}\n`
}

async function markdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await markdownFiles(fullPath)))
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(fullPath)
  }

  return files.sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }))
}

async function writeMarkdown(destination, markdown) {
  assertInside(quartzContentDir, destination)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.writeFile(destination, markdown, "utf8")
}

for (const generatedDir of generatedDirs) {
  assertInside(quartzContentDir, generatedDir)
  await fs.rm(generatedDir, { recursive: true, force: true })
  await fs.mkdir(generatedDir, { recursive: true })
}

const blogSourceDir = path.join(sourceDir, "_posts")
const blogFiles = await markdownFiles(blogSourceDir)
for (const sourceFile of blogFiles) {
  const markdown = await fs.readFile(sourceFile, "utf8")
  await writeMarkdown(path.join(quartzContentDir, "blog", path.basename(sourceFile)), markdown)
}

const decisionSourceDir = path.join(sourceDir, "book", "decision-algorithm")
const decisionEntries = []
for (const sourceFile of await markdownFiles(decisionSourceDir)) {
  const relative = path.relative(decisionSourceDir, sourceFile)
  const [number, fileName] = relative.split(path.sep)
  if (!/^\d{3}$/.test(number ?? "") || fileName !== "index.md") continue

  const markdown = await fs.readFile(sourceFile, "utf8")
  decisionEntries.push({
    number,
    markdown,
    title: extractTitle(markdown, `第 ${number} 讲`),
    target: `books/decision-algorithm/${number}`,
  })
}
decisionEntries.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))

for (const [index, entry] of decisionEntries.entries()) {
  const clean = stripTerminalNavigation(entry.markdown, "/book/decision-algorithm/")
  await writeMarkdown(
    path.join(quartzContentDir, "books", "decision-algorithm", `${entry.number}.md`),
    addAdjacentLinks(clean, decisionEntries[index - 1], decisionEntries[index + 1]),
  )
}

const jiangSourceDir = path.join(sourceDir, "book", "psychohistory")
const jiangFiles = (await markdownFiles(jiangSourceDir)).filter((file) => {
  const relative = path.relative(jiangSourceDir, file)
  return path.basename(file).toLowerCase() !== "readme.md" && relative !== "index.md"
})
const jiangCourseSections = new Map()

for (const sourceFile of jiangFiles) {
  const relative = toPosixPath(path.relative(jiangSourceDir, sourceFile))
  const section = relative.split("/")[0]
  const title = jiangXueqinTitles[relative]
  if (!title) throw new Error(`Missing Chinese title for Jiang Xueqin lecture: ${relative}`)

  const entries = jiangCourseSections.get(section) ?? []
  entries.push({
    relative,
    sourceFile,
    title,
    target: `books/psychohistory/${toWikiPath(relative)}`,
  })
  jiangCourseSections.set(section, entries)
}

for (const [section, entries] of jiangCourseSections) {
  entries.sort((a, b) => a.relative.localeCompare(b.relative, "en", { numeric: true }))
  for (const [index, entry] of entries.entries()) {
    const markdown = await fs.readFile(entry.sourceFile, "utf8")
    const titled = setChineseTitle(markdown, entry.title)
    await writeMarkdown(
      path.join(quartzContentDir, "books", "psychohistory", entry.relative),
      addAdjacentLinks(titled, entries[index - 1], entries[index + 1]),
    )
  }

  const sectionMeta = jiangSections[section]
  if (!sectionMeta) throw new Error(`Missing Jiang Xueqin section metadata: ${section}`)
  const first = entries[0]
  const sectionIndex = `---
title: ${JSON.stringify(sectionMeta.title)}
description: ${JSON.stringify(sectionMeta.description)}
---

${sectionMeta.description}

[[${first.target}|从第一讲开始：${first.title}]]
`
  await writeMarkdown(
    path.join(quartzContentDir, "books", "psychohistory", section, "index.md"),
    sectionIndex,
  )
}

const blogIndex = `---
title: 博客文章
description: 虚船向远发布的文章。
---

这里保留「虚船向远」发布的文章。可以从左侧目录进入具体文章，也可以使用搜索查找内容。
`
await writeMarkdown(path.join(quartzContentDir, "blog", "index.md"), blogIndex)

const firstDecision = decisionEntries[0]
const decisionIndex = `---
title: 决策算法100讲
description: 关于判断、选择与行动的一百讲连续课程。
---

这是一套按顺序展开的连续课程。每一讲只连接相邻课程，避免目录节点挤占真实的知识关系。

[[${firstDecision.target}|从第一讲开始：${firstDecision.title}]]
`
await writeMarkdown(path.join(quartzContentDir, "books", "decision-algorithm", "index.md"), decisionIndex)

const jiangSectionLinks = Object.entries(jiangSections)
  .map(([section, meta]) => `- [[books/psychohistory/${section}/index|${meta.title}]] — ${meta.description}`)
  .join("\n")
const jiangIndex = `---
title: 姜学勤心理史学
description: 姜学勤老师从经典、文明、博弈、地缘与隐秘历史展开的系列课程。
---

这套课程尝试从人的心理结构重新理解文明、历史与现实世界。五组课程各自形成连续路径，不再把 154 篇讲稿全部堆到同一个中心节点上。

${jiangSectionLinks}
`
await writeMarkdown(path.join(quartzContentDir, "books", "psychohistory", "index.md"), jiangIndex)

const booksIndex = `---
title: 图书与课程
description: 可以连续阅读的图书笔记与系统课程。
---

- [[books/decision-algorithm/index|决策算法100讲]]
- [[books/psychohistory/index|姜学勤心理史学]]
`
await writeMarkdown(path.join(quartzContentDir, "books", "index.md"), booksIndex)

const home = `---
title: 知识花园
description: 虚船向远的文章、图书与课程索引。
---

这里是「虚船向远」内容的另一种阅读入口。它不负责制造关系，只呈现文章与课程中真实存在的路径。

## 从这里进入

- [[blog/index|博客文章]]
- [[books/decision-algorithm/index|决策算法100讲]]
- [[books/psychohistory/index|姜学勤心理史学]]
`
await writeMarkdown(path.join(quartzContentDir, "index.md"), home)

console.log(
  `Quartz content synced: ${blogFiles.length} posts, ${decisionEntries.length} decision notes, ${jiangFiles.length} Jiang Xueqin lectures.`,
)
