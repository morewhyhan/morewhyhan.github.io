'use strict'

const fs = require('fs')
const path = require('path')

const WIKI_LINK_RE = /(!)?\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g

function escapeHtml (value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function cleanTarget (value) {
  return String(value || '').trim().replace(/\\/g, '/').split('#')[0].trim()
}

function normalizeUrl (value) {
  let url = String(value || '').trim()
  if (!url) return '/'
  try {
    if (/^https?:\/\//i.test(url)) url = new URL(url).pathname
  } catch (_) {}
  url = url.split(/[?#]/)[0].replace(/\\/g, '/')
  if (!url.startsWith('/')) url = `/${url}`
  url = url.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '/')
  url = url.replace(/\/{2,}/g, '/')
  if (!url.endsWith('/')) url += '/'
  return url
}

function listNames (collection) {
  if (!collection) return []
  if (typeof collection.toArray === 'function') {
    return collection.toArray().map(item => item.name).filter(Boolean)
  }
  if (Array.isArray(collection.data)) {
    return collection.data.map(item => item.name).filter(Boolean)
  }
  if (Array.isArray(collection)) {
    return collection.map(item => item && item.name ? item.name : String(item)).filter(Boolean)
  }
  return []
}

function sourceText (doc) {
  const source = String(doc.source || '')
  if (source) {
    const fullPath = path.join(hexo.source_dir, source)
    try {
      return fs.readFileSync(fullPath, 'utf8').replace(/^---\s*[\r\n]+[\s\S]*?[\r\n]+---\s*[\r\n]+/, '')
    } catch (_) {}
  }
  return String(doc.raw || doc._content || doc.content || '')
}

function shouldInclude (doc, isPost) {
  const data = doc
  if (data.graph === false) return false

  const source = String(data.source || '').replace(/\\/g, '/')
  if (/^book\/decision-algorithm\/\d{3}\/index\.md$/i.test(source)) return false

  if (isPost) return true
  return data.graph === true || data.type === 'mechanism'
}

function graphKind (data, categories, isPost) {
  if (data.type === 'mechanism') return '机制卡片'
  if (categories.includes('若我在场')) return '若我在场'
  if (categories.includes('读书笔记') || categories.includes('图书笔记')) return '图书笔记'
  if (categories.includes('生活随笔')) return '生活随笔'
  return isPost ? '文章' : '知识页面'
}

function aliasesOf (data) {
  const aliases = data.aliases || data.alias
  if (!aliases) return []
  return (Array.isArray(aliases) ? aliases : [aliases]).map(String).map(item => item.trim()).filter(Boolean)
}

function documentUrl (data) {
  return normalizeUrl(data.path || data.permalink || '')
}

function wikiTargets (raw) {
  const targets = []
  WIKI_LINK_RE.lastIndex = 0
  let match
  while ((match = WIKI_LINK_RE.exec(raw)) !== null) {
    if (!match[1]) targets.push(cleanTarget(match[2]))
  }
  return targets
}

function markdownTargets (raw) {
  const targets = []
  const markdownLink = /(?<!!)\[[^\]]+\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g
  const htmlLink = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = markdownLink.exec(raw)) !== null) targets.push(match[1])
  while ((match = htmlLink.exec(raw)) !== null) targets.push(match[1])
  return targets.filter(target => target.startsWith('/') || target.startsWith('./') || target.startsWith('../'))
}

hexo.extend.filter.register('before_post_render', data => {
  data.content = String(data.content || '').replace(WIKI_LINK_RE, (full, embed, targetValue, aliasValue) => {
    if (embed) return full
    const target = cleanTarget(targetValue)
    const label = String(aliasValue || targetValue).trim()
    const fallback = `/knowledge-graph/?focus=${encodeURIComponent(target)}`
    return `<a class="wiki-link" data-wiki-target="${escapeHtml(target)}" href="${escapeHtml(fallback)}">${escapeHtml(label)}</a>`
  })
  return data
})

hexo.extend.generator.register('knowledge-graph-data', locals => {
  const entries = []
  const categoriesByPost = new Map()
  const tagsByPost = new Map()

  function collectPostRelations (collection, target) {
    collection.toArray().forEach(item => {
      const posts = item.posts && typeof item.posts.toArray === 'function' ? item.posts.toArray() : []
      posts.forEach(post => {
        const key = String(post._id)
        if (!target.has(key)) target.set(key, [])
        target.get(key).push(item.name)
      })
    })
  }

  collectPostRelations(locals.categories, categoriesByPost)
  collectPostRelations(locals.tags, tagsByPost)

  locals.posts.toArray().forEach(doc => {
    if (shouldInclude(doc, true)) entries.push({ doc, isPost: true })
  })
  locals.pages.toArray().forEach(doc => {
    if (shouldInclude(doc, false)) entries.push({ doc, isPost: false })
  })

  const nodes = entries.map(({ doc, isPost }) => {
    const data = doc
    const relationKey = String(doc._id)
    const categories = isPost ? (categoriesByPost.get(relationKey) || []) : listNames(doc.categories || data.categories)
    const tags = isPost ? (tagsByPost.get(relationKey) || []) : listNames(doc.tags || data.tags)
    const title = String(data.title || data.slug || data.path || '未命名').trim()
    const url = documentUrl(data)
    return {
      id: url,
      title,
      url,
      kind: graphKind(data, categories, isPost),
      categories,
      tags,
      aliases: aliasesOf(data),
      description: String(data.description || '').trim(),
      original: data.original !== false,
      raw: sourceText(data),
      links: []
    }
  })

  const byName = new Map()
  const byUrl = new Map()
  nodes.forEach(node => {
    byUrl.set(normalizeUrl(node.url), node.id)
    ;[node.title, ...node.aliases].forEach(name => byName.set(String(name).trim().toLocaleLowerCase('zh-CN'), node.id))
  })

  function resolveTarget (target, sourceUrl) {
    const clean = cleanTarget(target)
    if (!clean) return null
    const byTitle = byName.get(clean.toLocaleLowerCase('zh-CN'))
    if (byTitle) return byTitle

    if (clean.startsWith('/')) return byUrl.get(normalizeUrl(clean)) || null
    if (clean.startsWith('./') || clean.startsWith('../')) {
      try {
        const absolute = new URL(clean, `https://graph.local${sourceUrl}`).pathname
        return byUrl.get(normalizeUrl(absolute)) || null
      } catch (_) {}
    }
    return byUrl.get(normalizeUrl(clean)) || null
  }

  nodes.forEach(node => {
    const resolved = [...wikiTargets(node.raw), ...markdownTargets(node.raw)]
      .map(target => resolveTarget(target, node.url))
      .filter(Boolean)
      .filter(target => target !== node.id)
    node.links = [...new Set(resolved)]
    delete node.raw
  })

  const payload = {
    generatedAt: new Date().toISOString(),
    nodes
  }

  return {
    path: 'knowledge-graph/data.json',
    data: JSON.stringify(payload, null, 2)
  }
})
