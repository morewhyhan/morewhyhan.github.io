(() => {
  const mountHomeLibrary = () => {
    const isHome = window.location.pathname === '/' || window.location.pathname === '/index.html'
    if (!isHome) return

    const container = document.querySelector('#recent-posts .recent-post-items')
    if (!container || container.querySelector('.home-library')) return

    container.insertAdjacentHTML('beforeend', `
      <section class="home-library" aria-labelledby="home-library-title">
        <div class="home-library-heading">
          <div>
            <span>READING NOTES</span>
            <h2 id="home-library-title">图书笔记</h2>
          </div>
          <a href="/book/">查看全部专题 →</a>
        </div>
        <a class="home-library-card" href="/book/decision-algorithm/">
          <span class="home-library-number">01</span>
          <div>
            <strong>决策算法100讲</strong>
            <p>概率、风险、博弈与人生选择</p>
          </div>
          <span class="home-library-count">100 讲</span>
        </a>
      </section>
    `)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountHomeLibrary, { once: true })
  } else {
    mountHomeLibrary()
  }

  document.addEventListener('pjax:complete', mountHomeLibrary)
})()
