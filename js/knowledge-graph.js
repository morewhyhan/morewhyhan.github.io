/*
 * Quartz Graph View adapted for Hexo.
 *
 * D3 owns the force simulation and zoom transform; PixiJS owns the canvas
 * rendering. Hexo only supplies a small, already-generated JSON index.
 * Rendering approach based on @quartz-community/graph (MIT):
 * https://github.com/quartz-community/graph
 */
(() => {
  'use strict'

  const DATA_URL = '/knowledge-graph/data.json'
  const LIBRARIES = [
    ['d3', 'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js', 'd3'],
    ['pixi', 'https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.js', 'PIXI']
  ]
  const COLORS = {
    '分类': '#e5b56d',
    '若我在场': '#d59b64',
    '图书笔记': '#bc9bea',
    '生活随笔': '#82b8de',
    '机制卡片': '#84c49c',
    '文章': '#8ba4bf',
    '知识页面': '#a9afb9'
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

  function loadScript (key, src, globalName) {
    if (globalName && window[globalName]) return Promise.resolve()
    const existing = document.querySelector(`script[data-knowledge-graph-lib="${key}"]`)
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', resolve, { once: true })
        existing.addEventListener('error', reject, { once: true })
      })
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = src
      script.async = false
      script.crossOrigin = 'anonymous'
      script.dataset.knowledgeGraphLib = key
      script.addEventListener('load', resolve, { once: true })
      script.addEventListener('error', reject, { once: true })
      document.head.appendChild(script)
    })
  }

  function loadLibraries () {
    if (!libraryPromise) {
      libraryPromise = LIBRARIES.reduce(
        (promise, [key, src, globalName]) => promise.then(() => loadScript(key, src, globalName)),
        Promise.resolve()
      )
    }
    return libraryPromise
  }

  function getData () {
    if (!dataPromise) {
      dataPromise = fetch(DATA_URL, { credentials: 'same-origin' }).then(response => {
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
      const node = names.get(link.dataset.wikiTarget.trim().toLocaleLowerCase('zh-CN'))
      link.classList.toggle('is-unresolved', !node)
      if (node) link.href = node.url
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
        if (frontier.includes(link.source) && !included.has(link.target)) {
          included.add(link.target)
          next.push(link.target)
        }
        if (frontier.includes(link.target) && !included.has(link.source)) {
          included.add(link.source)
          next.push(link.source)
        }
      })
      frontier = next
    }
    return nodes.filter(node => included.has(node.id))
  }

  function visibleGraph (allNodes, options) {
    const allLinks = graphLinks(allNodes)
    let nodes = neighbourhood(allNodes, allLinks, options.focusId, options.depth ?? -1)
    if (options.showCategories === false) nodes = nodes.filter(node => node.kind !== '分类')
    let ids = new Set(nodes.map(node => node.id))
    let links = allLinks.filter(link => ids.has(link.source) && ids.has(link.target))
    if (options.showOrphans === false) {
      const connected = new Set(links.flatMap(link => [link.source, link.target]))
      if (options.focusId) connected.add(options.focusId)
      nodes = nodes.filter(node => connected.has(node.id))
      ids = new Set(nodes.map(node => node.id))
      links = links.filter(link => ids.has(link.source) && ids.has(link.target))
    }
    return { nodes, links }
  }

  function resolveColor (value, fallback) {
    if (!value) return fallback
    const element = document.createElement('div')
    element.style.color = value
    element.style.position = 'absolute'
    element.style.visibility = 'hidden'
    document.body.appendChild(element)
    const color = getComputedStyle(element).color
    element.remove()
    return color || fallback
  }

  function toHex (value, fallback) {
    const text = String(value || '').trim()
    if (/^#[\da-f]{6}$/i.test(text)) return Number.parseInt(text.slice(1), 16)
    const match = text.match(/\d+/g)
    if (!match || match.length < 3) return fallback
    return (Number(match[0]) << 16) + (Number(match[1]) << 8) + Number(match[2])
  }

  async function renderGraph (container, allNodes, options = {}) {
    const { nodes, links } = visibleGraph(allNodes, options)
    container.replaceChildren()
    if (!nodes.length) {
      container.innerHTML = '<div class="knowledge-graph-empty">还没有形成可显示的连接。</div>'
      return { destroy () {}, focus () {}, reset () {}, fit () {}, zoomBy () {} }
    }

    const width = Math.max(container.clientWidth, 320)
    const height = Math.max(container.clientHeight, options.local ? 250 : 560)
    const degree = new Map(nodes.map(node => [node.id, 0]))
    links.forEach(link => {
      degree.set(link.source, degree.get(link.source) + 1)
      degree.set(link.target, degree.get(link.target) + 1)
    })
    const nodeScale = Number(options.nodeScale || 100) / 100
    const simulationNodes = nodes.map((node, index) => ({
      ...node,
      text: node.title,
      radius: ((node.kind === '分类' ? 5 : 2.7) + Math.sqrt(degree.get(node.id) || 0) * (node.kind === '分类' ? 1.6 : 1.05)) * nodeScale,
      x: (Math.random() - 0.5) * width * 0.6,
      y: (Math.random() - 0.5) * height * 0.55,
      index
    }))
    const nodeMap = new Map(simulationNodes.map(node => [node.id, node]))
    const simulationLinks = links.map(link => ({ source: nodeMap.get(link.source), target: nodeMap.get(link.target) }))
    const styles = getComputedStyle(document.documentElement)
    const bodyFont = styles.getPropertyValue('--bodyFont').trim() || 'system-ui, sans-serif'
    const dark = document.documentElement.getAttribute('data-theme') === 'dark'
    const primary = resolveColor(styles.getPropertyValue('--secondary').trim(), '#bc9bea')
    const light = resolveColor(styles.getPropertyValue('--light').trim(), '#f4f1eb')
    const gray = resolveColor(styles.getPropertyValue('--gray').trim(), '#858b98')
    const current = normalizePath(window.location.pathname)
    const visited = new Set(JSON.parse(window.localStorage.getItem('knowledge-graph-visited') || '[]'))
    const app = new window.PIXI.Application()
    await app.init({ width, height, antialias: true, backgroundAlpha: 0, resolution: window.devicePixelRatio || 1, autoDensity: true, eventMode: 'static' })
    container.appendChild(app.canvas)

    const world = new window.PIXI.Container()
    const linksLayer = new window.PIXI.Container()
    const nodesLayer = new window.PIXI.Container()
    const labelsLayer = new window.PIXI.Container()
    world.addChild(linksLayer, nodesLayer, labelsLayer)
    app.stage.addChild(world)
    app.stage.eventMode = 'static'
    app.stage.hitArea = app.screen

    let transform = window.d3.zoomIdentity.translate(width / 2, height / 2)
    let hoveredId = null
    let dragStart = 0
    let moved = false
    let draggedNode = null
    let stopped = false
    const nodeGraphics = []
    const linkGraphics = []

    function nodeColor (node) {
      if (normalizePath(node.url) === current) return toHex(primary, 0xbc9bea)
      if (node.kind === '分类') return toHex(COLORS['分类'], 0xe5b56d)
      if (visited.has(node.id)) return toHex(COLORS[node.kind], 0x82b8de)
      return toHex(COLORS[node.kind], toHex(gray, 0x858b98))
    }

    function activeNeighbours (id) {
      const set = new Set(id ? [id] : [])
      simulationLinks.forEach(link => {
        if (link.source.id === id || link.target.id === id) {
          set.add(link.source.id)
          set.add(link.target.id)
        }
      })
      return set
    }

    function applyTransform () {
      world.position.set(transform.x, transform.y)
      world.scale.set(transform.k, transform.k)
      const labelsOpacity = Math.max(0.18, Math.min(1, (transform.k - 0.28) / 1.45))
      nodeGraphics.forEach(item => {
        const isActive = !hoveredId || activeNeighbours(hoveredId).has(item.node.id)
        item.gfx.alpha = hoveredId && !isActive ? 0.16 : 1
        item.label.alpha = options.showLabels === false ? 0 : item.node.kind === '分类'
          ? Math.max(0.65, labelsOpacity)
          : (hoveredId === item.node.id ? 1 : labelsOpacity)
        item.label.scale.set(1 / transform.k * (hoveredId === item.node.id ? 1.08 : 1))
      })
      linkGraphics.forEach(item => {
        const isActive = !hoveredId || item.link.source.id === hoveredId || item.link.target.id === hoveredId
        item.gfx.alpha = hoveredId && !isActive ? 0.08 : (isActive && hoveredId ? 0.95 : 0.46)
        item.gfx.tint = hoveredId && isActive ? 0xffffff : 0xb0b6c2
      })
    }

    function setHovered (id) {
      hoveredId = id
      applyTransform()
      container.classList.toggle('is-node-hovered', Boolean(id))
    }

    function updateDraggedNode (event) {
      if (!draggedNode) return
      const point = world.toLocal(event.global)
      draggedNode.x = point.x
      draggedNode.y = point.y
      draggedNode.fx = point.x
      draggedNode.fy = point.y
      moved = true
    }

    function finishDraggedNode () {
      if (!draggedNode) return
      draggedNode.fx = null
      draggedNode.fy = null
      simulation.alphaTarget(0)
      app.stage.off('pointermove', updateDraggedNode)
      app.stage.off('pointerup', finishDraggedNode)
      app.stage.off('pointerupoutside', finishDraggedNode)
      draggedNode = null
    }

    simulationNodes.forEach(node => {
      const gfx = new window.PIXI.Graphics()
      gfx.circle(0, 0, node.radius)
      gfx.fill({ color: nodeColor(node) })
      if (node.kind === '分类') gfx.stroke({ width: 1.5, color: 0xf2d29d, alpha: 0.9 })
      gfx.eventMode = 'static'
      gfx.cursor = 'pointer'
      gfx.on('pointerover', () => setHovered(node.id))
      gfx.on('pointerout', () => setHovered(null))
      gfx.on('pointerdown', event => {
        event.stopPropagation()
        dragStart = Date.now()
        moved = false
        draggedNode = node
        node.fx = node.x
        node.fy = node.y
        simulation.alphaTarget(0.25).restart()
        app.stage.on('pointermove', updateDraggedNode)
        app.stage.on('pointerup', finishDraggedNode)
        app.stage.on('pointerupoutside', finishDraggedNode)
      })
      gfx.on('pointerup', () => {
        if (!moved && Date.now() - dragStart < 500 && node.url) {
          visited.add(node.id)
          window.localStorage.setItem('knowledge-graph-visited', JSON.stringify([...visited]))
          window.location.href = node.url
        }
      })
      nodesLayer.addChild(gfx)

      const label = new window.PIXI.Text({
        text: node.text,
        style: { fontSize: node.kind === '分类' ? 13 : 12, fill: dark ? 0xdfe3eb : 0x3d4552, fontFamily: bodyFont, fontWeight: node.kind === '分类' ? '700' : '500' },
        resolution: (window.devicePixelRatio || 1) * 3
      })
      label.anchor.set(0.5, 1.35)
      labelsLayer.addChild(label)
      nodeGraphics.push({ node, gfx, label })
    })

    simulationLinks.forEach(link => {
      const gfx = new window.PIXI.Graphics()
      gfx.eventMode = 'none'
      linksLayer.addChild(gfx)
      linkGraphics.push({ link, gfx })
    })

    const simulation = window.d3.forceSimulation(simulationNodes)
      .force('charge', window.d3.forceManyBody().strength(-105 * (options.local ? 0.78 : 1)))
      .force('center', window.d3.forceCenter(0, 0).strength(options.local ? 0.32 : 0.22))
      .force('link', window.d3.forceLink(simulationLinks).distance(options.local ? 70 : 115).strength(0.65))
      .force('collide', window.d3.forceCollide().radius(node => node.radius + (options.local ? 15 : 22)).iterations(3))
      .force('orbit', window.d3.forceRadial(node => node.kind === '分类' ? 72 : (options.local ? 105 : 230), 0, 0).strength(0.18))

    function redraw () {
      if (stopped) return
      nodeGraphics.forEach(item => {
        item.gfx.position.set(item.node.x, item.node.y)
        item.label.position.set(item.node.x, item.node.y)
      })
      linkGraphics.forEach(item => {
        const { source, target } = item.link
        item.gfx.clear()
        item.gfx.moveTo(source.x, source.y)
        item.gfx.lineTo(target.x, target.y)
        item.gfx.stroke({ width: 1, color: 0xb0b6c2, alpha: 0.46 })
      })
      applyTransform()
      window.requestAnimationFrame(redraw)
    }
    simulation.restart()
    redraw()

    const zoom = window.d3.zoom().scaleExtent([0.25, 4]).on('zoom', event => {
      transform = event.transform
      applyTransform()
    })
    window.d3.select(app.canvas).call(zoom)

    function zoomTo (next) {
      transform = { ...transform, k: Math.max(0.25, Math.min(4, next)) }
      window.d3.select(app.canvas).call(zoom.transform, transform)
      applyTransform()
    }
    function focus (id) {
      const node = nodeMap.get(id)
      if (!node) return
      const k = options.local ? 1.5 : 1.8
      transform = { k, x: width / 2 - node.x * k, y: height / 2 - node.y * k }
      window.d3.select(app.canvas).call(zoom.transform, transform)
      setHovered(id)
    }
    function fit () {
      const xs = simulationNodes.map(node => node.x)
      const ys = simulationNodes.map(node => node.y)
      const minX = Math.min(...xs) - 45
      const maxX = Math.max(...xs) + 45
      const minY = Math.min(...ys) - 45
      const maxY = Math.max(...ys) + 45
      const k = Math.max(0.45, Math.min(1.45, Math.min(width / (maxX - minX), height / (maxY - minY))))
      transform = { k, x: width / 2 - ((minX + maxX) / 2) * k, y: height / 2 - ((minY + maxY) / 2) * k }
      window.d3.select(app.canvas).call(zoom.transform, transform)
      applyTransform()
    }
    function reset () {
      setHovered(null)
      simulation.alpha(1).restart()
      transform = window.d3.zoomIdentity.translate(width / 2, height / 2)
      window.d3.select(app.canvas).call(zoom.transform, transform)
      applyTransform()
      window.setTimeout(fit, options.local ? 300 : 900)
    }

    simulation.restart()
    window.setTimeout(fit, options.local ? 200 : 900)
    return {
      destroy () { stopped = true; simulation.stop(); try { app.destroy(true) } catch (_) {}; container.replaceChildren() },
      focus,
      reset,
      fit,
      zoomBy (amount) { zoomTo(transform.k * amount) }
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
      nodeScale: root.querySelector('[data-graph-node-scale]'),
      labels: root.querySelector('[data-graph-labels]'),
      categories: root.querySelector('[data-graph-categories]'),
      orphans: root.querySelector('[data-graph-orphans]')
    }
    makeLegend(root.querySelector('[data-graph-legend]'), nodes)
    status.textContent = `${nodes.length} 个节点 · ${graphLinks(nodes).length} 条连接`

    let graphView
    let renderToken = 0
    const graphOptions = () => ({
      nodeScale: controls.nodeScale.value,
      showLabels: controls.labels.checked,
      showCategories: controls.categories.checked,
      showOrphans: controls.orphans.checked,
      depth: -1
    })
    const rerender = async () => {
      const token = ++renderToken
      if (graphView) graphView.destroy()
      graphView = await renderGraph(canvas, nodes, graphOptions())
      if (token !== renderToken) graphView.destroy()
    }
    await rerender()

    root.querySelector('[data-graph-reset]').addEventListener('click', () => graphView && graphView.reset())
    root.querySelector('[data-graph-fit]').addEventListener('click', () => graphView && graphView.fit())
    root.querySelector('[data-graph-zoom-in]').addEventListener('click', () => graphView && graphView.zoomBy(1.25))
    root.querySelector('[data-graph-zoom-out]').addEventListener('click', () => graphView && graphView.zoomBy(0.8))
    root.querySelector('[data-graph-settings]').addEventListener('click', () => { settingsPanel.hidden = !settingsPanel.hidden })
    ;[controls.nodeScale, controls.labels, controls.categories, controls.orphans].forEach(control => control.addEventListener('change', rerender))

    const fullscreenButton = root.querySelector('[data-graph-fullscreen]')
    const handleFullscreen = () => {
      const active = document.fullscreenElement === root
      root.classList.toggle('is-fullscreen', active)
      document.body.classList.toggle('knowledge-graph-fullscreen', active)
      fullscreenButton.querySelector('i').className = active ? 'fas fa-compress' : 'fas fa-expand'
      fullscreenButton.querySelector('span').textContent = active ? '退出' : '沉浸'
      setTimeout(() => graphView && graphView.fit(), 100)
    }
    fullscreenButton.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement === root) await document.exitFullscreen()
        else await root.requestFullscreen()
      } catch (_) {}
    })
    document.addEventListener('fullscreenchange', handleFullscreen)

    const names = byNames(nodes)
    const input = root.querySelector('[data-graph-search]')
    input.addEventListener('input', () => {
      const query = input.value.trim().toLocaleLowerCase('zh-CN')
      if (!query) return
      const match = names.get(query) || nodes.find(node => node.title.toLocaleLowerCase('zh-CN').includes(query))
      if (match && graphView) graphView.focus(match.id)
    })
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') { input.value = ''; input.blur() }
    })
    document.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        input.focus()
      }
    })
    const focusQuery = new URLSearchParams(window.location.search).get('focus')
    if (focusQuery) {
      const focus = names.get(focusQuery.trim().toLocaleLowerCase('zh-CN'))
      if (focus) setTimeout(() => graphView && graphView.focus(focus.id), 900)
    }

    return () => {
      if (graphView) graphView.destroy()
      document.removeEventListener('fullscreenchange', handleFullscreen)
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
    const graphView = await renderGraph(section.querySelector('[data-local-graph-canvas]'), nodes, { local: true, focusId: node.id, depth: 1, showCategories: true, showLabels: true, showOrphans: true })
    return () => { graphView.destroy(); section.remove() }
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
      document.querySelectorAll('[data-graph-canvas], [data-local-graph-canvas]').forEach(canvas => {
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
