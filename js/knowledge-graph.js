/* Knowledge graph powered by Cytoscape.js and the fCoSE layout. */
(() => {
  'use strict'

  const DATA_URL = '/knowledge-graph/data.json'
  const LIBRARIES = [
    ['cytoscape', 'https://cdn.jsdelivr.net/npm/cytoscape@3.34.2/dist/cytoscape.min.js', 'cytoscape'],
    ['layout-base', 'https://cdn.jsdelivr.net/npm/layout-base@2.0.1/layout-base.js', 'layoutBase'],
    ['cose-base', 'https://cdn.jsdelivr.net/npm/cose-base@2.2.0/cose-base.js', 'coseBase'],
    ['cytoscape-fcose', 'https://cdn.jsdelivr.net/npm/cytoscape-fcose@2.2.0/cytoscape-fcose.js', null]
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

  function renderGraph (container, allNodes, options = {}) {
    const { nodes, links } = visibleGraph(allNodes, options)
    container.replaceChildren()
    if (!nodes.length) {
      container.innerHTML = '<div class="knowledge-graph-empty">还没有形成可显示的连接。</div>'
      return { destroy () {}, focus () {}, reset () {}, resize () {} }
    }

    const nodeScale = Number(options.nodeScale || 100) / 100
    const degrees = new Map(nodes.map(node => [node.id, 0]))
    links.forEach(link => {
      degrees.set(link.source, (degrees.get(link.source) || 0) + 1)
      degrees.set(link.target, (degrees.get(link.target) || 0) + 1)
    })
    const elements = [
      ...nodes.map(node => ({
        group: 'nodes',
        data: {
          id: node.id,
          label: node.title,
          url: node.url,
          kind: node.kind,
          color: COLORS[node.kind] || COLORS['知识页面'],
          size: (node.kind === '分类' ? 30 : 13 + Math.sqrt(degrees.get(node.id) || 0) * 4) * nodeScale
        }
      })),
      ...links.map((link, index) => ({
        group: 'edges',
        data: { id: `edge-${index}`, source: link.source, target: link.target }
      }))
    ]

    const dark = document.documentElement.getAttribute('data-theme') === 'dark'
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const cy = window.cytoscape({
      container,
      elements,
      minZoom: 0.12,
      maxZoom: 3.2,
      wheelSensitivity: 0.24,
      boxSelectionEnabled: true,
      autoungrabify: false,
      autounselectify: false,
      style: [
        {
          selector: 'node',
          style: {
            width: 'data(size)',
            height: 'data(size)',
            'background-color': 'data(color)',
            'border-width': 1.5,
            'border-color': dark ? '#d8dde8' : '#556071',
            'border-opacity': 0.34,
            label: options.showLabels === false ? '' : 'data(label)',
            color: dark ? '#edf0f5' : '#303641',
            'font-family': 'LXGW WenKai Screen, system-ui, sans-serif',
            'font-size': options.local ? 10 : 12,
            'font-weight': 500,
            'text-valign': 'top',
            'text-halign': 'center',
            'text-margin-y': options.local ? -7 : -10,
            'text-wrap': 'ellipsis',
            'text-max-width': options.local ? 120 : 180,
            'text-background-color': dark ? '#111720' : '#f5f7fa',
            'text-background-opacity': 0.72,
            'text-background-padding': 3,
            'text-background-shape': 'roundrectangle',
            'min-zoomed-font-size': 6,
            'overlay-opacity': 0,
            'transition-property': 'opacity, border-width, border-color, width, height',
            'transition-duration': '180ms'
          }
        },
        {
          selector: 'node[kind = "分类"]',
          style: {
            'border-width': 3,
            'border-color': '#f0d7a2',
            'border-opacity': 0.9,
            'font-size': options.local ? 11 : 15,
            'font-weight': 700,
            'text-margin-y': options.local ? -9 : -14,
            'z-index': 10
          }
        },
        {
          selector: 'edge',
          style: {
            width: 1,
            'line-color': dark ? '#7f899b' : '#8993a3',
            opacity: 0.34,
            'curve-style': 'bezier',
            'overlay-opacity': 0,
            'transition-property': 'opacity, width, line-color',
            'transition-duration': '180ms'
          }
        },
        { selector: '.kg-muted', style: { opacity: 0.08 } },
        {
          selector: 'node.kg-active',
          style: {
            opacity: 1,
            'border-width': 4,
            'border-color': '#f3d79e',
            'border-opacity': 1,
            'z-index': 20
          }
        },
        {
          selector: 'edge.kg-active',
          style: { opacity: 0.94, width: 2.4, 'line-color': '#d7b873', 'z-index': 15 }
        },
        {
          selector: 'node:selected',
          style: { 'border-width': 5, 'border-color': '#f6dfb3', 'border-opacity': 1 }
        }
      ]
    })

    function runLayout () {
      const layout = cy.layout({
        name: 'fcose',
        quality: options.local ? 'draft' : 'default',
        randomize: true,
        animate: !reducedMotion,
        animationDuration: options.local ? 420 : 900,
        animationEasing: 'ease-out-cubic',
        fit: true,
        padding: options.local ? 28 : 110,
        nodeDimensionsIncludeLabels: true,
        uniformNodeDimensions: false,
        packComponents: false,
        samplingType: true,
        sampleSize: Math.min(25, nodes.length),
        nodeSeparation: options.local ? 54 : 92,
        nodeRepulsion: node => node.data('kind') === '分类' ? 9000 : 6200,
        idealEdgeLength: () => options.local ? 68 : 125,
        edgeElasticity: () => 0.38,
        nestingFactor: 0.1,
        numIter: options.local ? 1200 : 2500,
        tile: true,
        tilingPaddingVertical: 24,
        tilingPaddingHorizontal: 24,
        gravity: 0.22,
        gravityRangeCompound: 1.5,
        gravityCompound: 1,
        gravityRange: 4.2,
        initialEnergyOnIncremental: 0.3
      })
      layout.run()
    }

    function clearFocus () {
      cy.elements().removeClass('kg-muted kg-active')
      container.classList.remove('is-node-hovered')
    }

    cy.on('mouseover', 'node', event => {
      const node = event.target
      const neighbourhood = node.closedNeighborhood()
      cy.elements().addClass('kg-muted')
      neighbourhood.removeClass('kg-muted')
      node.addClass('kg-active')
      node.connectedEdges().addClass('kg-active')
      container.classList.add('is-node-hovered')
    })
    cy.on('mouseout', 'node', clearFocus)
    cy.on('tap', event => {
      if (event.target === cy) clearFocus()
    })
    cy.on('tap', 'node', event => {
      const url = event.target.data('url')
      if (url) window.location.href = url
    })

    function focus (id) {
      const node = cy.getElementById(id)
      if (!node.length) return
      cy.elements().unselect()
      node.select()
      cy.animate({ fit: { eles: node.closedNeighborhood(), padding: options.local ? 34 : 220 } }, { duration: 560 })
    }

    function reset () {
      cy.elements().unselect()
      clearFocus()
      runLayout()
    }

    runLayout()
    if (options.focusId) setTimeout(() => focus(options.focusId), options.local ? 380 : 760)

    return {
      destroy () {
        clearFocus()
        cy.destroy()
        container.replaceChildren()
      },
      focus,
      reset,
      resize () {
        cy.resize()
        cy.fit(cy.elements(), options.local ? 28 : 110)
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
      if (focus) setTimeout(() => graphView.focus(focus.id), 840)
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
