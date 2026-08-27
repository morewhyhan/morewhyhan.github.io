'use strict'

// hexo-generator-index returns no route when there are zero posts. Keep the
// native Butterfly homepage alive so its title, subtitle and hero still render.
hexo.extend.generator.register('empty-home', locals => {
  if (locals.posts.length > 0) return

  return {
    path: 'index.html',
    layout: ['index', 'archive'],
    data: {
      __index: true,
      base: '',
      total: 1,
      current: 1,
      current_url: '',
      posts: locals.posts,
      prev: 0,
      prev_link: '',
      next: 0,
      next_link: ''
    }
  }
})
