'use strict'

const fs = require('fs')
const path = require('path')

const sourceDir = process.argv[2]
if (!sourceDir) {
  console.error('Usage: node tools/import-life-notes.js <markdown-directory>')
  process.exit(1)
}

const slugs = new Map([
  ['我们不是不孤独，只是不想从“你好”重新开始', 'life-notes-not-lonely'],
  ['十年后的我', 'life-notes-ten-years-later'],
  ['墓地上的文明', 'life-notes-civilization-on-graves'],
  ['棋盘外有妖之命', 'life-notes-demon-outside-the-board'],
  ['给春稗以秋实', 'life-notes-autumn-fruit'],
  ['武藏之死在天下无双', 'life-notes-musashi'],
  ['再挤挤', 'life-notes-make-room'],
  ['奥德赛意识流', 'life-notes-odyssey']
])
const excludedTitles = new Set(['话剧'])

function stripFrontMatter (text) {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/^---\s*[\r\n]+[\s\S]*?[\r\n]+---\s*(?:[\r\n]+|$)/, '')
    .trimStart()
}

function formatDate (date) {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function descriptionOf (body) {
  const paragraph = body
    .split(/\r?\n\s*\r?\n/)
    .map(item => item.trim())
    .find(item => item && !/^(#|>|```|<!--)/.test(item)) || ''

  const plain = paragraph
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return plain.length > 120 ? `${plain.slice(0, 117)}…` : plain
}

fs.mkdirSync(path.join(process.cwd(), 'source', '_posts'), { recursive: true })

const files = fs.readdirSync(sourceDir)
  .filter(name => name.toLowerCase().endsWith('.md'))
  .sort((left, right) => fs.statSync(path.join(sourceDir, left)).mtimeMs - fs.statSync(path.join(sourceDir, right)).mtimeMs)

const imported = []
const excluded = []
for (const filename of files) {
  const title = path.basename(filename, path.extname(filename))
  if (excludedTitles.has(title)) {
    excluded.push(title)
    continue
  }
  const slug = slugs.get(title)
  if (!slug) throw new Error(`No stable slug configured for: ${title}`)

  const inputPath = path.join(sourceDir, filename)
  const body = stripFrontMatter(fs.readFileSync(inputPath, 'utf8'))
  const date = formatDate(fs.statSync(inputPath).mtime)
  const description = descriptionOf(body)
  const frontMatter = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `date: ${JSON.stringify(date)}`,
    'categories:',
    '  - 生活随笔',
    `description: ${JSON.stringify(description)}`,
    'graph_parent: 生活随笔',
    '---',
    ''
  ].join('\n')

  const outputPath = path.join(process.cwd(), 'source', '_posts', `${slug}.md`)
  fs.writeFileSync(outputPath, `${frontMatter}${body.trimEnd()}\n`, 'utf8')
  imported.push({ title, output: path.relative(process.cwd(), outputPath), date })
}

console.log(JSON.stringify({ count: imported.length, imported, excluded }, null, 2))
