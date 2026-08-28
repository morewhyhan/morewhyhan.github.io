/* Stable semantic knowledge map rendered with Sigma.js + Graphology. */
(() => {
  'use strict'

  const DATA_URL = '/knowledge-graph/data.json'
  const LIBRARIES = [
    ['graphology', 'https://cdnjs.cloudflare.com/ajax/libs/graphology/0.25.4/graphology.umd.min.js'],
    ['Sigma', 'https://cdnjs.cloudflare.com/ajax/libs/sigma.js/2.4.0/sigma.min.js']
  ]
  const COLORS = {
    '分类': '#d0af78',
    '若我在场': '#d29b58',
    '图书笔记': '#9b87d7',
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
    if (!libraryPromise) libraryPromise = LIBRARIES.reduce((promise, [name, src]) => promise.then(() => loadScript(name, src)), Promise.resolve())
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
      ;[node.title, ...(node.aliases || [])].forEach(name => map.set(String(name).trim().toLocaleLowerCase('zh-CN'), node))
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

  function stableUnit (text) {
    let hash = 2166136261
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0) / 4294967295
  }

  function layoutNodes (nodes, links, local) {
    const degree = new Map(nodes.map(node => [node.id, 0]))
    links.forEach(link => {
      degree.set(link.source, (degree.get(link.source) || 0) + 1)
      degree.set(link.target, (degree.get(link.target) || 0) + 1)
    })

    const categories = nodes.filter(node => node.kind === '分类').sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'))
    const centers = new Map()
    categories.forEach((node, index) => {
      const angle = categories.length === 1 ? 0 : ((Math.PI * 2 * index) / categories.length) - Math.PI / 2
      const radius = categories.length === 1 ? 0 : 34 + categories.length * 3
      centers.set(node.title, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius })
    })

    const groups = new Map(categories.map(node => [node.title, []]))
    const ungrouped = []
    nodes.filter(node => node.kind !== '分类').forEach(node => {
      const category = (node.categories || []).find(name => centers.has(name))
      if (category) groups.get(category).push(node)
      else ungrouped.push(node)
    })

    const positions = new Map()
    categories.forEach(node => positions.set(node.id, centers.get(node.title)))
    groups.forEach((members, category) => {
      const center = centers.get(category)
      members.sort((left, right) => stableUnit(left.id) - stableUnit(right.id))
      members.forEach((node, index) => {
        const ring = Math.floor(index / 9)
        const angle = Math.PI * 2 * stableUnit(`${node.id}:angle`)
        const radius = (local ? 8 : 12) + ring * 9 + stableUnit(`${node.id}:radius`) * 5
        positions.set(node.id, { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius })
      })
    })
    ungrouped.forEach((node, index) => {
      const angle = Math.PI * 2 * stableUnit(`${node.id}:free`)
      const radius = 18 + Math.sqrt(index + 1) * 10
      positions.set(node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius })
    })

    return { positions, degree }
  }

  function prepareVisibleGraph (allNodes, options) {
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

  function renderGraph (container, allNodes, options = {}) {
    const { nodes, links } = prepareVisibleGraph(allNodes, options)
    container.replaceChildren()
    if (!nodes.length) {
      container.innerHTML = '<div class="knowledge-graph-empty">还没有形成可显示的连接。</div>'
      return { destroy () {}, focus () {}, reset () {}, resize () {} }
    }

    const Graph = window.graphology.Graph
    const graph = new Graph({ multi: false, type: 'undirected', allowSelfLoops: false })
    const { positions, degree } = layoutNodes(nodes, links, options.local)
    const nodeScale = Number(options.nodeScale || 100) / 100
    nodes.forEach(node => {
      const point = positions.get(node.id) || { x: 0, y: 0 }
      const category = node.kind === '分类'
      graph.addNode(node.id, {
        x: point.x,
        y: point.y,
        size: (category ? 12 : 5.5 + Math.sqrt(degree.get(node.id) || 0) * 1.7) * nodeScale,
        label: node.title,
        color: COLORS[node.kind] || COLORS['知识页面'],
        forceLabel: category || node.id === options.focusId,
        zIndex: category ? 2 : 1,
        url: node.url,
        kind: node.kind
      })
    })
    links.forEach((link, index) => {
      if (!graph.hasNode(link.source) || !graph.hasNode(link.target) || graph.hasEdge(link.source, link.target)) return
      graph.addUndirectedEdgeWithKey(`edge-${index}`, link.source, link.target, {
        size: 0.8,
        color: 'rgba(135,145,164,0.32)'
      })
    })

    let hoveredNode = null
    let selectedNode = options.focusId || null
    let draggedNode = null
    const showLabels = options.showLabels !== false
    const renderer = new window.Sigma(graph, container, {
      allowInvalidContainer: true,
      renderEdgeLabels: false,
      labelFont: 'LXGW WenKai Screen, system-ui, sans-serif',
      labelSize: options.local ? 11 : 13,
      labelWeight: '500',
      labelColor: { color: document.documentElement.getAttribute('data-theme') === 'dark' ? '#e8eaf0' : '#343841' },
      labelRenderedSizeThreshold: showLabels ? (options.local ? 5 : 4) : Infinity,
      defaultEdgeColor: 'rgba(135,145,164,0.32)',
      defaultEdgeType: 'line',
      enableEdgeEvents: false,
      zIndex: true,
      minCameraRatio: 0.06,
      maxCameraRatio: 3.5,
      nodeReducer (node, data) {
        const result = { ...data }
        if (!showLabels && node !== hoveredNode && node !== selectedNode) result.label = ''
        if (hoveredNode) {
          const related = node === hoveredNode || graph.areNeighbors(node, hoveredNode)
          if (!related) {
            result.color = 'rgba(118,126,141,0.14)'
            result.label = ''
            result.zIndex = 0
          } else {
            result.highlighted = node === hoveredNode
            result.zIndex = 3
          }
        }
        if (node === selectedNode) {
          result.highlighted = true
          result.size = data.size * 1.35
          result.zIndex = 4
        }
        return result
      },
      edgeReducer (edge, data) {
        if (!hoveredNode) return data
        if (!graph.hasExtremity(edge, hoveredNode)) return { ...data, hidden: true }
        return { ...data, color: 'rgba(219,190,132,0.88)', size: 1.8, zIndex: 3 }
      }
    })

    renderer.on('enterNode', ({ node }) => {
      hoveredNode = node
      container.classList.add('is-node-hovered')
      renderer.refresh()
    })
    renderer.on('leaveNode', () => {
      hoveredNode = null
      container.classList.remove('is-node-hovered')
      renderer.refresh()
    })
    renderer.on('clickNode', ({ node }) => {
      if (draggedNode) return
      selectedNode = node
      renderer.refresh()
      const url = graph.getNodeAttribute(node, 'url')
      if (url) window.location.href = url
    })
    renderer.on('clickStage', () => {
      selectedNode = null
      renderer.refresh()
    })
    renderer.on('downNode', ({ node }) => {
      draggedNode = node
      graph.setNodeAttribute(node, 'highlighted', true)
    })

    const mouse = renderer.getMouseCaptor()
    mouse.on('mousemovebody', event => {
      if (!draggedNode) return
      const position = renderer.viewportToGraph(event)
      graph.mergeNodeAttributes(draggedNode, position)
      event.preventSigmaDefault()
      if (event.original) event.original.preventDefault()
    })
    mouse.on('mouseup', () => {
      if (draggedNode) graph.removeNodeAttribute(draggedNode, 'highlighted')
      draggedNode = null
    })
    mouse.on('mousedown', () => {
      if (!renderer.getCustomBBox()) renderer.setCustomBBox(renderer.getBBox())
    })

    function focus (id) {
      if (!graph.hasNode(id)) return
      selectedNode = id
      const display = renderer.getNodeDisplayData(id)
      if (display) renderer.getCamera().animate({ x: display.x, y: display.y, ratio: options.local ? 0.45 : 0.18 }, { duration: 620 })
      renderer.refresh()
    }

    function reset () {
      selectedNode = options.focusId || null
      renderer.getCamera().animate({ x: 0.5, y: 0.5, ratio: 1, angle: 0 }, { duration: 520 })
      renderer.refresh()
    }

    if (options.focusId) setTimeout(() => focus(options.focusId), 260)

    return {
      destroy () {
        container.classList.remove('is-node-hovered')
        renderer.kill()
        container.replaceChildren()
      },
      focus,
      reset,
      resize () { renderer.resize() }
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
    const graphOptions = () => ({
      nodeScale: controls.nodeScale.value,
      showLabels: controls.labels.checked,
      showCategories: controls.categories.checked,
      showOrphans: controls.orphans.checked,
      depth: -1
    })
    const rerender = () => {
      if (graphView) graphView.destroy()
      graphView = renderGraph(canvas, nodes, graphOptions())
    }
    rerender()

    root.querySelector('[data-graph-reset]').addEventListener('click', () => graphView && graphView.reset())
    root.querySelector('[data-graph-settings]').addEventListener('click', () => { settingsPanel.hidden = !settingsPanel.hidden })
    ;[controls.nodeScale, controls.labels, controls.categories, controls.orphans].forEach(control => control.addEventListener('change', rerender))

    const fullscreenButton = root.querySelector('[data-graph-fullscreen]')
    const handleFullscreen = () => {
      const active = document.fullscreenElement === root
      root.classList.toggle('is-fullscreen', active)
      document.body.classList.toggle('knowledge-graph-fullscreen', active)
      fullscreenButton.querySelector('i').className = active ? 'fas fa-compress' : 'fas fa-expand'
      fullscreenButton.querySelector('span').textContent = active ? '退出' : '沉浸'
      setTimeout(() => graphView && graphView.resize(), 100)
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

    const focusQuery = new URLSearchParams(window.location.search).get('focus')
    if (focusQuery) {
      const focus = names.get(focusQuery.trim().toLocaleLowerCase('zh-CN'))
      if (focus) setTimeout(() => graphView.focus(focus.id), 420)
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
    const graphView = renderGraph(section.querySelector('[data-local-graph-canvas]'), nodes, {
      local: true,
      focusId: node.id,
      depth: 1,
      showCategories: true,
      showLabels: true,
      showOrphans: true
    })
    return () => {
      graphView.destroy()
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
