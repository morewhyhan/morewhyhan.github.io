import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const toolsDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(toolsDir, "..")
const postsDir = path.join(rootDir, "source", "_posts")
const publicDir = path.join(rootDir, "public")

function decodeHtml(value) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .trim()
}

function extractFrontmatterTitle(markdown, fileName) {
  const frontmatter = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)
  const rawTitle = frontmatter?.[1].match(/^title:\s*(.+?)\s*$/m)?.[1]?.trim()
  if (!rawTitle) throw new Error(`Post is missing a frontmatter title: ${fileName}`)

  if (
    (rawTitle.startsWith('"') && rawTitle.endsWith('"')) ||
    (rawTitle.startsWith("'") && rawTitle.endsWith("'"))
  ) {
    return rawTitle.slice(1, -1)
  }

  return rawTitle
}

const postFiles = (await fs.readdir(postsDir))
  .filter((fileName) => fileName.toLowerCase().endsWith(".md"))
  .sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }))
const posts = []
for (const fileName of postFiles) {
  const markdown = await fs.readFile(path.join(postsDir, fileName), "utf8")
  posts.push({
    fileName,
    slug: path.basename(fileName, ".md").toLowerCase(),
    title: extractFrontmatterTitle(markdown, fileName),
  })
}

const homepage = await fs.readFile(path.join(publicDir, "index.html"), "utf8")
const homepageEntries = [...homepage.matchAll(/<a\s+class="article-title"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(
  ([, href, title]) => ({ href, title: decodeHtml(title) }),
)
const homepageTitles = new Set(homepageEntries.map(({ title }) => title))
const missingFromHomepage = posts.filter(({ title }) => !homepageTitles.has(title))

for (const { href, title } of homepageEntries) {
  const relative = decodeURIComponent(href).replace(/^\/+/, "").replace(/\/$/, "")
  const outputFile = path.join(publicDir, relative, "index.html")
  try {
    await fs.access(outputFile)
  } catch {
    throw new Error(`Homepage entry has no rendered page: ${title} -> ${href}`)
  }
}

const contentIndexPath = path.join(publicDir, "notes", "static", "contentIndex.json")
const contentIndex = JSON.parse(await fs.readFile(contentIndexPath, "utf8"))
const missingFromKnowledgeGarden = posts.filter(({ slug, title }) => {
  const node = contentIndex[`blog/${slug}`]
  return !node || node.title !== title
})

const failures = []
if (homepageEntries.length !== posts.length) {
  failures.push(`首页入口数 ${homepageEntries.length} 与已发布文章数 ${posts.length} 不一致`)
}
if (missingFromHomepage.length > 0) {
  failures.push(`首页缺少：${missingFromHomepage.map(({ title }) => title).join("、")}`)
}
if (missingFromKnowledgeGarden.length > 0) {
  failures.push(`知识花园缺少：${missingFromKnowledgeGarden.map(({ title }) => title).join("、")}`)
}

if (failures.length > 0) {
  throw new Error(`Site output verification failed:\n- ${failures.join("\n- ")}`)
}

console.log(
  `Verified site output: ${posts.length} published posts, ${homepageEntries.length} homepage entries, ${posts.length} knowledge-garden nodes.`,
)
