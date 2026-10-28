(() => {
  const paths = {
  "/2025/12/29/Freqtrade 量化框架使用指南/": {
    "title": "Freqtrade 量化框架使用指南",
    "cats": [
      "专题",
      "量化交易"
    ]
  },
  "/2026/08/10/life-notes-make-room/": {
    "title": "再挤挤",
    "cats": [
      "专题",
      "生活随笔"
    ]
  },
  "/2026/08/06/life-notes-civilization-on-graves/": {
    "title": "墓地上的文明",
    "cats": [
      "专题",
      "生活随笔"
    ]
  },
  "/2026/08/23/life-notes-odyssey/": {
    "title": "奥德赛意识流",
    "cats": [
      "专题",
      "生活随笔"
    ]
  },
  "/2026/08/08/life-notes-demon-outside-the-board/": {
    "title": "棋盘外有妖之命",
    "cats": [
      "专题",
      "生活随笔"
    ]
  },
  "/2026/08/09/life-notes-autumn-fruit/": {
    "title": "给春稗以秋实",
    "cats": [
      "专题",
      "生活随笔"
    ]
  },
  "/2026/08/10/life-notes-musashi/": {
    "title": "武藏之死在天下无双",
    "cats": [
      "专题",
      "生活随笔"
    ]
  },
  "/2026/08/01/life-notes-ten-years-later/": {
    "title": "十年后的我",
    "cats": [
      "专题",
      "生活随笔"
    ]
  }
}
  const path = decodeURIComponent(location.pathname).replace(/index\.html$/, '')
  const entry = paths[path]
  const container = document.querySelector('#article-container')
  if (!entry || !container) return
  const nav = document.createElement('nav')
  nav.className = 'content-breadcrumb'
  nav.setAttribute('aria-label', '文章路径')
  const links = [['文章目录', '/content-directory/'], ...entry.cats.map((name, index) => [name, '/categories/' + entry.cats.slice(0, index + 1).map(s => encodeURIComponent(s.replace(/[. ]/g, '-'))).join('/') + '/'])]
  links.forEach(([label, href], index) => {
    if (index) nav.append(document.createTextNode(' › '))
    const a = document.createElement('a')
    a.href = href
    a.textContent = label
    nav.append(a)
  })
  nav.append(document.createTextNode(' › '))
  const current = document.createElement('span')
  current.setAttribute('aria-current', 'page')
  current.textContent = entry.title
  nav.append(current)
  container.prepend(nav)
})()
