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
    '分类': '#b8b8b8',
    '若我在场': '#b8b8b8',
    '图书笔记': '#b8b8b8',
    '生活随笔': '#b8b8b8',
    '标签': '#858585',
    '机制卡片': '#a6a6a6',
    '文章': '#a6a6a6',
    '知识页面': '#a6a6a6'
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
    const minimumHeight = options.local ? 250 : (container.closest('.knowledge-graph-overlay-window') ? 220 : 560)
    const height = Math.max(container.clientHeight, minimumHeight)
    const degree = new Map(nodes.map(node => [node.id, 0]))
    links.forEach(link => {
      degree.set(link.source, degree.get(link.source) + 1)
      degree.set(link.target, degree.get(link.target) + 1)
    })
    const nodeScale = Number(options.nodeScale || 100) / 100
    const simulationNodes = nodes.map((node, index) => ({
      ...node,
      text: node.title,
      radius: ((node.kind === '分类' ? 4.2 : 2.5) + Math.sqrt(degree.get(node.id) || 0) * (node.kind === '分类' ? 1.15 : 0.82)) * nodeScale,
      x: (Math.random() - 0.5) * width * 0.6,
      y: (Math.random() - 0.5) * height * 0.55,
      index
    }))
    const nodeMap = new Map(simulationNodes.map(node => [node.id, node]))
    const simulationLinks = links.map(link => ({ source: nodeMap.get(link.source), target: nodeMap.get(link.target) }))
    const styles = getComputedStyle(document.documentElement)
    const bodyFont = styles.getPropertyValue('--bodyFont').trim() || 'system-ui, sans-serif'
    const primary = '#8b7cf6'
    const gray = '#a6a6a6'
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
      if (normalizePath(node.url) === current) return toHex(primary, 0x8b7cf6)
      if (node.kind === '标签') return 0x777777
      if (visited.has(node.id)) return 0xc8c8c8
      return toHex(COLORS[node.kind], toHex(gray, 0xa6a6a6))
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
      const labelsOpacity = Math.max(0.55, Math.min(0.92, (transform.k - 0.25) / 1.35))
      nodeGraphics.forEach(item => {
        const isActive = !hoveredId || activeNeighbours(hoveredId).has(item.node.id)
        item.gfx.alpha = hoveredId && !isActive ? 0.12 : 0.94
        item.label.alpha = options.showLabels === false ? 0 : (hoveredId === item.node.id ? 1 : (item.node.kind === '分类' ? Math.max(0.62, labelsOpacity) : labelsOpacity))
        item.label.scale.set(1 / transform.k * (hoveredId === item.node.id ? 1.08 : 1))
      })
      linkGraphics.forEach(item => {
        const isActive = !hoveredId || item.link.source.id === hoveredId || item.link.target.id === hoveredId
        item.gfx.alpha = hoveredId && !isActive ? 0.04 : (isActive && hoveredId ? 0.92 : 0.55)
        item.gfx.tint = hoveredId && isActive ? 0x8b7cf6 : 0x686868
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
      if (node.kind === '分类') gfx.stroke({ width: 1.1, color: 0xd0d0d0, alpha: 0.42 })
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
        style: {
          fontSize: node.kind === '分类' ? 12 : 11,
          fill: 0xd6d6d6,
          fontFamily: bodyFont,
          fontWeight: node.kind === '分类' ? '600' : '400',
          align: 'center',
          lineHeight: 14,
          wordWrap: true,
          breakWords: true,
          wordWrapWidth: node.kind === '分类' ? 118 : 96
        },
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

    const orbitRadius = options.local ? 105 : Math.max(120, Math.min(210, Math.min(width, height) * 0.58))
    const simulation = window.d3.forceSimulation(simulationNodes)
      .force('charge', window.d3.forceManyBody().strength(-118 * (options.local ? 0.78 : 1)))
      .force('center', window.d3.forceCenter(0, 0).strength(options.local ? 0.32 : 0.22))
      .force('link', window.d3.forceLink(simulationLinks).distance(options.local ? 70 : 108).strength(0.56))
      .force('collide', window.d3.forceCollide().radius(node => options.local
        ? node.radius + 15
        : Math.max(node.radius + 24, Math.min(98, 18 + node.text.length * 3.8))).iterations(4))
      .force('orbit', window.d3.forceRadial(node => node.kind === '分类' ? orbitRadius * 0.34 : orbitRadius, 0, 0).strength(0.18))

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
        item.gfx.stroke({ width: 0.8, color: 0x686868, alpha: 0.65 })
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
      const k = Math.max(0.25, Math.min(4, next))
      transform = window.d3.zoomIdentity.translate(transform.x, transform.y).scale(k)
      window.d3.select(app.canvas).call(zoom.transform, transform)
      applyTransform()
    }
    function focus (id) {
      const node = nodeMap.get(id)
      if (!node) return
      const k = options.local ? 1.5 : 1.8
      transform = window.d3.zoomIdentity.translate(width / 2 - node.x * k, height / 2 - node.y * k).scale(k)
      window.d3.select(app.canvas).call(zoom.transform, transform)
      setHovered(id)
    }
    function fit () {
      const xs = simulationNodes.map(node => node.x)
      const ys = simulationNodes.map(node => node.y)
      const minX = Math.min(...xs) - 72
      const maxX = Math.max(...xs) + 72
      const minY = Math.min(...ys) - 84
      const maxY = Math.max(...ys) + 84
      const k = Math.max(0.45, Math.min(1.45, Math.min(width / (maxX - minX), height / (maxY - minY))))
      transform = window.d3.zoomIdentity
        .translate(width / 2 - ((minX + maxX) / 2) * k, height / 2 - ((minY + maxY) / 2) * k)
        .scale(k)
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
    if (!options.local) window.setTimeout(fit, 2400)
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
    const eventController = new AbortController()
    const eventOptions = { signal: eventController.signal }
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

    root.querySelector('[data-graph-reset]').addEventListener('click', () => graphView && graphView.reset(), eventOptions)
    root.querySelector('[data-graph-fit]')?.addEventListener('click', () => graphView && graphView.fit(), eventOptions)
    root.querySelector('[data-graph-zoom-in]')?.addEventListener('click', () => graphView && graphView.zoomBy(1.25), eventOptions)
    root.querySelector('[data-graph-zoom-out]')?.addEventListener('click', () => graphView && graphView.zoomBy(0.8), eventOptions)
    root.querySelector('[data-graph-settings]')?.addEventListener('click', () => { settingsPanel.hidden = !settingsPanel.hidden }, eventOptions)
    ;[controls.nodeScale, controls.labels, controls.categories, controls.orphans].forEach(control => control.addEventListener('change', rerender, eventOptions))

    const fullscreenButton = root.querySelector('[data-graph-fullscreen]')
    if (fullscreenButton) {
      const handleFullscreen = () => {
        const active = document.fullscreenElement === root
        root.classList.toggle('is-fullscreen', active)
        document.body.classList.toggle('knowledge-graph-fullscreen', active)
        fullscreenButton.querySelector('i').className = active ? 'fas fa-compress' : 'fas fa-expand'
        const buttonLabel = fullscreenButton.querySelector('span')
        if (buttonLabel) buttonLabel.textContent = active ? '退出' : '沉浸'
        fullscreenButton.setAttribute('aria-label', active ? '退出沉浸模式' : '进入沉浸模式')
        fullscreenButton.title = active ? '退出沉浸模式' : '进入沉浸模式'
        setTimeout(() => graphView && graphView.fit(), 100)
      }
      fullscreenButton.addEventListener('click', async () => {
        try {
          if (document.fullscreenElement === root) await document.exitFullscreen()
          else await root.requestFullscreen()
        } catch (_) {}
      }, eventOptions)
      document.addEventListener('fullscreenchange', handleFullscreen, eventOptions)
    }

    const names = byNames(nodes)
    const input = root.querySelector('[data-graph-search]')
    input.addEventListener('input', () => {
      const query = input.value.trim().toLocaleLowerCase('zh-CN')
      if (!query) return
      const match = names.get(query) || nodes.find(node => node.title.toLocaleLowerCase('zh-CN').includes(query))
      if (match && graphView) graphView.focus(match.id)
    }, eventOptions)
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') { input.value = ''; input.blur() }
    }, eventOptions)
    document.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        input.focus()
      }
    }, eventOptions)
    const focusQuery = root.dataset.graphInitialFocus || new URLSearchParams(window.location.search).get('focus')
    if (focusQuery) {
      const focus = names.get(focusQuery.trim().toLocaleLowerCase('zh-CN'))
      if (focus) setTimeout(() => graphView && graphView.focus(focus.id), 900)
    }

    return () => {
      eventController.abort()
      if (graphView) graphView.destroy()
      root.classList.remove('is-fullscreen')
      document.body.classList.remove('knowledge-graph-fullscreen')
    }
  }

  function overlayMarkup () {
    return `
      <div class="knowledge-graph-overlay" data-knowledge-graph-overlay hidden aria-hidden="true">
        <button class="knowledge-graph-overlay-backdrop" type="button" data-graph-close aria-label="关闭知识图谱"></button>
        <section class="knowledge-graph-app knowledge-graph-overlay-window" role="dialog" aria-modal="true" aria-labelledby="knowledge-graph-overlay-title">
          <header class="knowledge-graph-window-bar">
            <div class="knowledge-graph-window-title" id="knowledge-graph-overlay-title">
              <i class="fas fa-project-diagram" aria-hidden="true"></i>
              <span>知识图谱</span>
            </div>
            <div class="knowledge-graph-window-actions">
              <button type="button" data-graph-settings title="显示或隐藏控制面板" aria-label="显示或隐藏控制面板"><i class="fas fa-sliders-h"></i></button>
              <button type="button" data-graph-close title="关闭知识图谱" aria-label="关闭知识图谱"><i class="fas fa-times"></i></button>
            </div>
          </header>
          <div class="knowledge-graph-workspace">
            <aside class="knowledge-graph-settings" data-graph-settings-panel aria-label="图谱控制面板">
              <details open>
                <summary>筛选</summary>
                <label class="knowledge-graph-search">
                  <i class="fas fa-search" aria-hidden="true"></i>
                  <input type="search" data-graph-search placeholder="搜索节点…" autocomplete="off" />
                </label>
              </details>
              <details>
                <summary>分组</summary>
                <label class="knowledge-graph-check"><input type="checkbox" checked data-graph-categories /> <span>显示分类节点</span></label>
                <label class="knowledge-graph-check"><input type="checkbox" checked data-graph-orphans /> <span>显示孤立节点</span></label>
              </details>
              <details open>
                <summary>显示</summary>
                <label class="knowledge-graph-check"><input type="checkbox" checked data-graph-labels /> <span>显示节点名称</span></label>
                <label class="knowledge-graph-range"><span>节点大小</span><input type="range" min="70" max="150" value="100" data-graph-node-scale /></label>
              </details>
              <details>
                <summary>力学</summary>
                <div class="knowledge-graph-force-actions">
                  <button type="button" data-graph-reset><i class="fas fa-redo-alt"></i> 重置</button>
                  <button type="button" data-graph-fit><i class="fas fa-compress-arrows-alt"></i> 适应画布</button>
                </div>
              </details>
            </aside>
            <div class="knowledge-graph-canvas" data-graph-canvas>
              <div class="knowledge-graph-loading">正在连接知识节点…</div>
            </div>
          </div>
          <footer class="knowledge-graph-window-status">
            <span data-graph-status></span>
            <span>滚轮缩放 · 拖动画布 · 点击节点阅读</span>
          </footer>
        </section>
      </div>`
  }

  function mountOverlay (nodes) {
    const eventController = new AbortController()
    const signal = eventController.signal
    document.body.insertAdjacentHTML('beforeend', overlayMarkup())
    const overlay = document.querySelector('[data-knowledge-graph-overlay]')
    const root = overlay.querySelector('.knowledge-graph-app')
    const canvas = root.querySelector('[data-graph-canvas]')
    let graphCleanup
    let opener
    let openingToken = 0

    const close = () => {
      openingToken += 1
      overlay.classList.remove('is-open')
      overlay.hidden = true
      overlay.setAttribute('aria-hidden', 'true')
      document.body.classList.remove('knowledge-graph-overlay-open')
      if (graphCleanup) graphCleanup()
      graphCleanup = null
      root.removeAttribute('data-graph-initial-focus')
      canvas.innerHTML = '<div class="knowledge-graph-loading">正在连接知识节点…</div>'
      if (opener && document.contains(opener)) opener.focus()
    }

    const open = async focusQuery => {
      opener = document.activeElement
      const token = ++openingToken
      overlay.hidden = false
      overlay.setAttribute('aria-hidden', 'false')
      document.body.classList.add('knowledge-graph-overlay-open')
      window.requestAnimationFrame(() => overlay.classList.add('is-open'))
      if (focusQuery) root.dataset.graphInitialFocus = focusQuery
      try {
        await loadLibraries()
        if (token !== openingToken) return
        graphCleanup = await mountGlobal(root, nodes)
        if (token !== openingToken) {
          graphCleanup()
          graphCleanup = null
          return
        }
        const input = root.querySelector('[data-graph-search]')
        if (focusQuery && input) {
          input.value = focusQuery
          input.dispatchEvent(new Event('input'))
        }
        overlay.querySelector('[data-graph-close]').focus()
      } catch (error) {
        console.error('[Knowledge graph overlay]', error)
        canvas.innerHTML = '<div class="knowledge-graph-empty">图谱暂时无法载入，请刷新后重试。</div>'
      }
    }

    overlay.querySelectorAll('[data-graph-close]').forEach(button => button.addEventListener('click', close, { signal }))
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !overlay.hidden) close()
    }, { signal })
    document.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target.closest('a[href]')
      if (!link) return
      let target
      try { target = new URL(link.href, window.location.href) } catch (_) { return }
      if (target.origin !== window.location.origin || normalizePath(target.pathname) !== '/knowledge-graph/') return
      event.preventDefault()
      event.stopImmediatePropagation()
      open(target.searchParams.get('focus'))
    }, { capture: true, signal })

    if (normalizePath(window.location.pathname) === '/knowledge-graph/') {
      window.requestAnimationFrame(() => open(new URLSearchParams(window.location.search).get('focus')))
    }

    return () => {
      eventController.abort()
      openingToken += 1
      if (graphCleanup) graphCleanup()
      document.body.classList.remove('knowledge-graph-overlay-open')
      overlay.remove()
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
      const node = currentNode(nodes)
      cleanups.push(mountOverlay(nodes))
      if (node && normalizePath(window.location.pathname) !== '/knowledge-graph/') {
        await loadLibraries()
        cleanups.push(await mountLocal(node, nodes))
      }
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
    resizeTimer = setTimeout(() => {
      if (!document.body.classList.contains('knowledge-graph-overlay-open')) boot()
    }, 260)
  })
})()
