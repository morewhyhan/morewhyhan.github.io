(() => {
  const paths = {
  "/2025/12/29/Freqtrade 量化框架使用指南/": {
    "title": "Freqtrade 量化框架使用指南",
    "cats": [
      "1自然科学",
      "1.2计算机与信息科学",
      "1.2.7 软件工程"
    ]
  },
  "/2026/08/10/life-notes-make-room/": {
    "title": "再挤挤",
    "cats": [
      "5社会科学",
      "5.4社会学",
      "5.4.2 互动文化与身份"
    ]
  },
  "/2026/08/06/life-notes-civilization-on-graves/": {
    "title": "墓地上的文明",
    "cats": [
      "6人文与艺术",
      "6.1历史与考古学",
      "6.1.3 世界通史"
    ]
  },
  "/2026/08/23/life-notes-odyssey/": {
    "title": "奥德赛意识流",
    "cats": [
      "6人文与艺术",
      "6.2语言与文学",
      "6.2.5 文学理论与方法"
    ]
  },
  "/2026/08/08/life-notes-demon-outside-the-board/": {
    "title": "棋盘外有妖之命",
    "cats": [
      "6人文与艺术",
      "6.3哲学伦理学与宗教",
      "6.3.3 存在与心智"
    ]
  },
  "/2026/08/09/life-notes-autumn-fruit/": {
    "title": "给春稗以秋实",
    "cats": [
      "6人文与艺术",
      "6.3哲学伦理学与宗教",
      "6.3.5 价值哲学"
    ]
  },
  "/2026/08/10/life-notes-musashi/": {
    "title": "武藏之死在天下无双",
    "cats": [
      "6人文与艺术",
      "6.3哲学伦理学与宗教",
      "6.3.5 价值哲学"
    ]
  },
  "/2026/08/01/life-notes-ten-years-later/": {
    "title": "十年后的我",
    "cats": [
      "6人文与艺术",
      "6.3哲学伦理学与宗教",
      "6.3.5 价值哲学"
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
