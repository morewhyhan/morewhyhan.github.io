/*
 * Obsidian-style knowledge graph for this Hexo site.
 * Rendering and interaction are adapted from Quartz Community Graph (MIT):
 * https://github.com/quartz-community/graph
 */
(() => {
  'use strict'

  const DATA_URL = '/knowledge-graph/data.json'
  const LIBRARIES = [
    ['d3', 'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js'],
    ['PIXI', 'https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.js']
  ]
  const COLORS = {
    '若我在场': '#d29b58',
    '读书笔记': '#9b87d7',
    '生活随笔': '#67a6c9',
    '机制卡片': '#77ad88',
    '文章': '#7f9fbd',
    '知识页面': '#8d929d'
  }

  let dataPromise
  let libraryPromise
  let cleanups = []
  let resizeTimer

  function normalizePath (value) {
    let pathname = String(value || '/').split(/[?#]/)[0]
    try {
      if (/^https?:\/\//i.test(pathname)) pathname = new URL(pathname).pathname
    } catch (_) {}
    pathname = pathname.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '/')
    if (!pathname.startsWith('/')) pathname = `/${pathname}`
    pathname = pathname.replace(/\/{2,}/g, '/')
    if (!pathname.endsWith('/')) pathname += '/'
    return pathname
  }

  function loadScript (globalName, src) {
    if (window[globalName]) return Promise.resolve()
    const existing = document.querySelector(`script[data-knowledge-graph-lib="${globalName}"]`)
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', resolve, { once: true })
        existing.addEventListener('error', reject, { once: true })
      })
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = src
      script.async = true
      script.crossOrigin = 'anonymous'
      script.dataset.knowledgeGraphLib = globalName
      script.addEventListener('load', resolve, { once: true })
      script.addEventListener('error', reject, { once: true })
      document.head.appendChild(script)
    })
  }

  function loadLibraries () {
    if (!libraryPromise) {
      libraryPromise = Promise.all(LIBRARIES.map(([name, src]) => loadScript(name, src)))
    }
    return libraryPromise
  }

  function getData () {
    if (!dataPromise) {
      dataPromise = fetch(DATA_URL, { credentials: 'same-origin' })
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.json()
        })
    }
    return dataPromise
  }

  function byNames (nodes) {
    const map = new Map()
    nodes.forEach(node => {
      ;[node.title, ...(node.aliases || [])].forEach(name => {
        map.set(String(name).trim().toLocaleLowerCase('zh-CN'), node)
      })
    })
    return map
  }

  function resolveWikiLinks (nodes) {
    const names = byNames(nodes)
    document.querySelectorAll('a.wiki-link[data-wiki-target]').forEach(link => {
      const target = link.dataset.wikiTarget.trim().toLocaleLowerCase('zh-CN')
      const node = names.get(target)
      if (!node) {
        link.classList.add('is-unresolved')
        return
      }
      link.href = node.url
      link.classList.remove('is-unresolved')
    })
  }

  function graphLinks (nodes) {
    const valid = new Set(nodes.map(node => node.id))
    const links = []
    nodes.forEach(node => {
      ;(node.links || []).forEach(target => {
        if (valid.has(target)) links.push({ source: node.id, target })
      })
    })
    return links
  }

  function neighbourhood (nodes, links, focusId, depth) {
    if (!focusId || depth < 0) return nodes
    const included = new Set([focusId])
    let frontier = [focusId]
    for (let level = 0; level < depth; level += 1) {
      const next = []
      links.forEach(link => {
        const source = typeof link.source === 'string' ? link.source : link.source.id
        const target = typeof link.target === 'string' ? link.target : link.target.id
        if (frontier.includes(source) && !included.has(target)) {
          included.add(target)
          next.push(target)
        }
        if (frontier.includes(target) && !included.has(source)) {
          included.add(source)
          next.push(source)
        }
      })
      frontier = next
    }
    return nodes.filter(node => included.has(node.id))
  }

  function stableAngle (text) {
    let hash = 2166136261
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    return ((hash >>> 0) % 360) * Math.PI / 180
  }

  async function renderGraph (container, allNodes, options = {}) {
    const d3 = window.d3
    const PIXI = window.PIXI
    const width = Math.max(container.clientWidth, 280)
    const height = Math.max(container.clientHeight, options.local ? 280 : 520)
    const allLinks = graphLinks(allNodes)
    let visibleNodes = neighbourhood(allNodes, allLinks, options.focusId, options.depth ?? -1)
    let visibleIds = new Set(visibleNodes.map(node => node.id))
    let visibleLinks = allLinks.filter(link => visibleIds.has(link.source) && visibleIds.has(link.target))

    if (options.showOrphans === false) {
      const connected = new Set(visibleLinks.flatMap(link => [link.source, link.target]))
      if (options.focusId) connected.add(options.focusId)
      visibleNodes = visibleNodes.filter(node => connected.has(node.id))
      visibleIds = new Set(visibleNodes.map(node => node.id))
      visibleLinks = visibleLinks.filter(link => visibleIds.has(link.source) && visibleIds.has(link.target))
    }

    container.replaceChildren()
    if (!visibleNodes.length) {
      container.innerHTML = '<div class="knowledge-graph-empty">还没有形成可显示的连接。</div>'
      return { destroy () {}, focus () {} }
    }

    const degrees = new Map(visibleNodes.map(node => [node.id, 0]))
    visibleLinks.forEach(link => {
      degrees.set(link.source, (degrees.get(link.source) || 0) + 1)
      degrees.set(link.target, (degrees.get(link.target) || 0) + 1)
    })

    const radiusBase = Math.min(width, height) * (options.local ? 0.18 : 0.3)
    const nodes = visibleNodes.map((node, index) => {
      const angle = stableAngle(node.id)
      const radius = radiusBase * (0.35 + ((index % 9) / 10))
      return { ...node, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
    })
    const links = visibleLinks.map(link => ({ ...link }))
    const nodeMap = new Map(nodes.map(node => [node.id, node]))

    const app = new PIXI.Application()
    await app.init({
      width,
      height,
      antialias: true,
      backgroundAlpha: 0,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true
    })
    app.canvas.className = 'knowledge-graph-pixi'
    container.appendChild(app.canvas)

    const stage = new PIXI.Container()
    const edgeLayer = new PIXI.Graphics()
    const nodeLayer = new PIXI.Container()
    const labelLayer = new PIXI.Container()
    stage.addChild(edgeLayer, nodeLayer, labelLayer)
    app.stage.addChild(stage)

    const config = {
      repel: Number(options.repel ?? 105),
      center: Number(options.center ?? 28) / 100,
      distance: Number(options.distance ?? (options.local ? 55 : 62))
    }
    const simulation = d3.forceSimulation(nodes)
      .velocityDecay(0.36)
      .alphaDecay(0.022)
      .force('charge', d3.forceManyBody().strength(-config.repel))
      .force('center', d3.forceCenter(0, 0).strength(config.center))
      .force('link', d3.forceLink(links).id(node => node.id).distance(config.distance).strength(0.56))
      .force('collide', d3.forceCollide(node => 10 + Math.sqrt(degrees.get(node.id) || 0) * 2).iterations(2))

    const nodeViews = new Map()
    let hoveredId = null
    let selectedId = options.focusId || null
    let transform = d3.zoomIdentity.translate(width / 2, height / 2).scale(options.local ? 1.05 : 0.92)
    let moved = false
    let stopped = false

    function nodeRadius (node) {
      return 4.3 + Math.sqrt(degrees.get(node.id) || 0) * 1.75 + (node.id === options.focusId ? 1.8 : 0)
    }

    function neighboursOf (id) {
      const set = new Set([id])
      links.forEach(link => {
        const source = typeof link.source === 'string' ? link.source : link.source.id
        const target = typeof link.target === 'string' ? link.target : link.target.id
        if (source === id) set.add(target)
        if (target === id) set.add(source)
      })
      return set
    }

    function redrawStyle () {
      const active = hoveredId ? neighboursOf(hoveredId) : null
      nodeViews.forEach((view, id) => {
        const dimmed = active && !active.has(id)
        view.dot.alpha = dimmed ? 0.15 : 1
        const important = id === hoveredId || id === selectedId || id === options.focusId
        view.label.alpha = dimmed ? 0.05 : (important ? 1 : Math.max(0, Math.min(0.9, (transform.k - 0.52) / 1.5)))
        view.label.scale.set(important ? 1.08 : 1)
      })
    }

    nodes.forEach(node => {
      const dot = new PIXI.Graphics()
      const radius = nodeRadius(node)
      const color = COLORS[node.kind] || COLORS['知识页面']
      dot.circle(0, 0, radius).fill({ color })
      if (node.id === options.focusId) dot.circle(0, 0, radius + 3).stroke({ color: '#f1d4a4', width: 1.5, alpha: 0.85 })
      dot.eventMode = 'static'
      dot.cursor = 'pointer'
      dot.on('pointerover', () => { hoveredId = node.id; redrawStyle() })
      dot.on('pointerout', () => { hoveredId = null; redrawStyle() })
      dot.on('pointerdown', () => { moved = false })
      dot.on('pointerup', () => {
        if (!moved) window.location.href = node.url
      })
      nodeLayer.addChild(dot)

      const label = new PIXI.Text({
        text: node.title,
        style: {
          fontFamily: '"LXGW WenKai Screen", system-ui, sans-serif',
          fontSize: options.local ? 11 : 12,
          fill: document.documentElement.getAttribute('data-theme') === 'dark' ? '#e6e7eb' : '#343842',
          align: 'center'
        },
        resolution: Math.min((window.devicePixelRatio || 1) * 2, 4)
      })
      label.anchor.set(0.5, 1.45)
      label.alpha = node.id === options.focusId ? 1 : 0.2
      labelLayer.addChild(label)
      nodeViews.set(node.id, { dot, label, node })
    })

    function draw () {
      if (stopped) return
      edgeLayer.clear()
      links.forEach(link => {
        const source = typeof link.source === 'string' ? nodeMap.get(link.source) : link.source
        const target = typeof link.target === 'string' ? nodeMap.get(link.target) : link.target
        if (!source || !target) return
        const active = hoveredId && (source.id === hoveredId || target.id === hoveredId)
        const alpha = hoveredId ? (active ? 0.9 : 0.07) : 0.3
        edgeLayer.moveTo(source.x, source.y).lineTo(target.x, target.y).stroke({ color: active ? '#b9a071' : '#8a909c', width: active ? 1.4 : 0.7, alpha })
      })
      nodeViews.forEach(view => {
        view.dot.position.set(view.node.x, view.node.y)
        view.label.position.set(view.node.x, view.node.y)
      })
      requestAnimationFrame(draw)
    }

    const drag = d3.drag()
      .container(app.canvas)
      .subject(event => {
        const x = (event.x - transform.x) / transform.k
        const y = (event.y - transform.y) / transform.k
        return nodes.find(node => Math.hypot(x - node.x, y - node.y) <= nodeRadius(node) + 8)
      })
      .on('start', event => {
        if (!event.active) simulation.alphaTarget(0.28).restart()
        event.subject.fx = event.subject.x
        event.subject.fy = event.subject.y
      })
      .on('drag', event => {
        moved = true
        event.subject.fx = (event.x - transform.x) / transform.k
        event.subject.fy = (event.y - transform.y) / transform.k
      })
      .on('end', event => {
        if (!event.active) simulation.alphaTarget(0)
        event.subject.fx = null
        event.subject.fy = null
      })

    const zoom = d3.zoom()
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.22, 4])
      .on('zoom', event => {
        transform = event.transform
        stage.position.set(transform.x, transform.y)
        stage.scale.set(transform.k)
        redrawStyle()
      })

    d3.select(app.canvas).call(zoom).call(zoom.transform, transform).call(drag)
    simulation.on('tick', () => {})
    redrawStyle()
    draw()

    return {
      destroy () {
        stopped = true
        simulation.stop()
        d3.select(app.canvas).on('.zoom', null).on('.drag', null)
        try { app.destroy(true) } catch (_) {}
      },
      focus (id) {
        const node = nodeMap.get(id)
        if (!node) return
        selectedId = id
        const next = d3.zoomIdentity.translate(width / 2 - node.x * 1.55, height / 2 - node.y * 1.55).scale(1.55)
        d3.select(app.canvas).transition().duration(520).call(zoom.transform, next)
        redrawStyle()
      },
      reheat (next) {
        if (next.repel != null) simulation.force('charge').strength(-Number(next.repel))
        if (next.center != null) simulation.force('center').strength(Number(next.center) / 100)
        if (next.distance != null) simulation.force('link').distance(Number(next.distance))
        simulation.alpha(0.9).restart()
      }
    }
  }

  function currentNode (nodes) {
    const current = normalizePath(window.location.pathname)
    return nodes.find(node => normalizePath(node.url) === current)
  }

  function makeLegend (element, nodes) {
    if (!element) return
    const kinds = [...new Set(nodes.map(node => node.kind))]
    element.innerHTML = kinds.map(kind => `<span><i style="--legend-color:${COLORS[kind] || COLORS['知识页面']}"></i>${kind}</span>`).join('')
  }

  async function mountGlobal (root, nodes) {
    const canvas = root.querySelector('[data-graph-canvas]')
    const status = root.querySelector('[data-graph-status]')
    const settingsPanel = root.querySelector('[data-graph-settings-panel]')
    const controls = {
      repel: root.querySelector('[data-force="repel"]'),
      center: root.querySelector('[data-force="center"]'),
      distance: root.querySelector('[data-force="distance"]'),
      orphans: root.querySelector('[data-graph-orphans]')
    }
    makeLegend(root.querySelector('[data-graph-legend]'), nodes)
    status.textContent = `${nodes.length} 个节点 · ${graphLinks(nodes).length} 条连接`

    let graph
    const graphOptions = () => ({
      repel: controls.repel.value,
      center: controls.center.value,
      distance: controls.distance.value,
      showOrphans: controls.orphans.checked,
      depth: -1
    })
    const rerender = async () => {
      if (graph) graph.destroy()
      graph = await renderGraph(canvas, nodes, graphOptions())
    }
    await rerender()

    root.querySelector('[data-graph-reset]').addEventListener('click', rerender)
    root.querySelector('[data-graph-settings]').addEventListener('click', () => {
      settingsPanel.hidden = !settingsPanel.hidden
    })
    root.querySelector('[data-graph-fullscreen]').addEventListener('click', () => {
      root.classList.toggle('is-fullscreen')
      document.body.classList.toggle('knowledge-graph-fullscreen', root.classList.contains('is-fullscreen'))
      setTimeout(rerender, 80)
    })
    ;[controls.repel, controls.center, controls.distance].forEach(control => {
      control.addEventListener('input', () => graph && graph.reheat({ [control.dataset.force]: control.value }))
    })
    controls.orphans.addEventListener('change', rerender)

    const names = byNames(nodes)
    const input = root.querySelector('[data-graph-search]')
    input.addEventListener('input', () => {
      const query = input.value.trim().toLocaleLowerCase('zh-CN')
      if (!query) return
      const exact = names.get(query)
      const match = exact || nodes.find(node => node.title.toLocaleLowerCase('zh-CN').includes(query))
      if (match && graph) graph.focus(match.id)
    })

    const focusQuery = new URLSearchParams(window.location.search).get('focus')
    if (focusQuery) {
      const focus = names.get(focusQuery.trim().toLocaleLowerCase('zh-CN'))
      if (focus) setTimeout(() => graph.focus(focus.id), 550)
    }

    return () => {
      if (graph) graph.destroy()
      root.classList.remove('is-fullscreen')
      document.body.classList.remove('knowledge-graph-fullscreen')
    }
  }

  function mountBacklinks (container, node, nodes) {
    const backlinks = nodes.filter(candidate => (candidate.links || []).includes(node.id))
    const list = backlinks.length
      ? `<ul>${backlinks.map(item => `<li><a href="${item.url}">${item.title}</a><span>${item.kind}</span></li>`).join('')}</ul>`
      : '<p class="knowledge-backlinks-empty">还没有其他内容链接到这里。</p>'
    container.innerHTML = `<h3>反向链接 <small>${backlinks.length}</small></h3>${list}`
  }

  async function mountLocal (node, nodes) {
    const article = document.querySelector('#article-container')
    if (!article || document.querySelector('[data-local-knowledge-graph]')) return () => {}

    const section = document.createElement('section')
    section.className = 'local-knowledge-panel'
    section.dataset.localKnowledgeGraph = ''
    section.innerHTML = `
      <div class="local-knowledge-graph-card">
        <div class="local-knowledge-heading"><h3>关联图谱</h3><a href="/knowledge-graph/?focus=${encodeURIComponent(node.title)}">打开全局图谱</a></div>
        <div class="local-knowledge-canvas" data-local-graph-canvas></div>
      </div>
      <div class="knowledge-backlinks" data-knowledge-backlinks></div>`
    article.insertAdjacentElement('afterend', section)
    mountBacklinks(section.querySelector('[data-knowledge-backlinks]'), node, nodes)
    const graph = await renderGraph(section.querySelector('[data-local-graph-canvas]'), nodes, {
      local: true,
      focusId: node.id,
      depth: 1,
      repel: 78,
      center: 36,
      distance: 52,
      showOrphans: true
    })
    return () => {
      graph.destroy()
      section.remove()
    }
  }

  async function boot () {
    cleanups.forEach(cleanup => cleanup())
    cleanups = []
    try {
      const payload = await getData()
      const nodes = payload.nodes || []
      resolveWikiLinks(nodes)
      const globalRoot = document.querySelector('#knowledge-graph-app')
      const node = currentNode(nodes)
      if (!globalRoot && !node) return
      await loadLibraries()
      if (globalRoot) cleanups.push(await mountGlobal(globalRoot, nodes))
      if (node && !globalRoot) cleanups.push(await mountLocal(node, nodes))
    } catch (error) {
      console.error('[Knowledge graph]', error)
      document.querySelectorAll('[data-graph-canvas]').forEach(canvas => {
        canvas.innerHTML = '<div class="knowledge-graph-empty">图谱暂时无法载入，请刷新后重试。</div>'
      })
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
  else boot()
  document.addEventListener('pjax:complete', boot)
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(boot, 260)
  })
})()
