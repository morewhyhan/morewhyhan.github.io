(() => {
  const mountHomeLibrary = () => {
    const isHome = window.location.pathname === '/' || window.location.pathname === '/index.html'
    if (!isHome) return

    const container = document.querySelector('#recent-posts .recent-post-items')
    if (!container || container.querySelector('[data-book-collection="decision-algorithm"]')) return

    container.insertAdjacentHTML('beforeend', `
      <div class="recent-post-item" data-book-collection="decision-algorithm">
        <div class="post_cover left">
          <a href="/book/decision-algorithm/" title="决策算法100讲">
            <img class="post-bg" src="/img/hua.png" alt="决策算法100讲">
          </a>
        </div>
        <div class="recent-post-info">
          <a class="article-title" href="/book/decision-algorithm/" title="决策算法100讲">决策算法100讲</a>
          <div class="article-meta-wrap">
            <span class="article-meta">
              <i class="fas fa-inbox"></i>
              <a class="article-meta__categories" href="/book/">图书笔记</a>
              <span class="article-meta-separator">|</span>
              <i class="fas fa-book-open"></i>
              <span>100 讲</span>
            </span>
          </div>
          <div class="content">老喻关于概率、风险、博弈与人生选择的系统课程资料。点击进入专题目录，阅读全部 100 讲。</div>
        </div>
      </div>
    `)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountHomeLibrary, { once: true })
  } else {
    mountHomeLibrary()
  }

  document.addEventListener('pjax:complete', mountHomeLibrary)
})()
