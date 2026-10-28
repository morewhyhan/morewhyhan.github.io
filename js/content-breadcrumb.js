(() => {
  const path = decodeURIComponent(location.pathname).replace(/index\.html$/, '')
  const container = document.querySelector('#article-container')
  if (!container || path.startsWith('/content-directory/')) return

  const crumbs = [['内容目录', '/content-directory/']]
  const sectionNames = {
    '1-Great-Books': '伟大经典',
    '2-Civilization': '文明史',
    '3-Game-Theory': '博弈论',
    '4-Geo-Strategy': '地缘战略',
    '5-Secret-History': '隐秘历史'
  }
  if (path.startsWith('/book/decision-algorithm/')) {
    crumbs.push(['课程资料', '/content-directory/#课程资料'], ['决策算法100讲', '/book/decision-algorithm/'])
  } else if (path.startsWith('/book/psychohistory/')) {
    crumbs.push(['课程资料', '/content-directory/#课程资料'], ['姜学勤心理史学', '/book/psychohistory/'])
    const section = path.split('/')[3]
    if (sectionNames[section]) crumbs.push([sectionNames[section], `/book/psychohistory/${section}/README.html`])
  } else if (/^\/\d{4}\/\d{2}\/\d{2}\//.test(path)) {
    crumbs.push(['原创文章', '/content-directory/#原创文章'])
  } else return

  const nav = document.createElement('nav')
  nav.className = 'content-breadcrumb'
  nav.setAttribute('aria-label', '内容路径')
  crumbs.forEach(([label, href], index) => {
    if (index) nav.append(document.createTextNode(' › '))
    const a = document.createElement('a')
    a.href = href
    a.textContent = label
    nav.append(a)
  })
  const title = document.querySelector('.post-title, .page-title')?.textContent?.trim()
  if (title && title !== crumbs[crumbs.length - 1][0]) {
    nav.append(document.createTextNode(' › '))
    const current = document.createElement('span')
    current.setAttribute('aria-current', 'page')
    current.textContent = title
    nav.append(current)
  }
  container.prepend(nav)
})()
