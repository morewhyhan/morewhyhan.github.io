'use strict'

// Pages inside an original series use Butterfly's post layout without becoming
// separate homepage entries. Supply the collections that its post template expects.
hexo.extend.filter.register('before_post_render', data => {
  if (data.type !== 'article' || data.layout !== 'post') return data

  for (const [field, directory] of [
    ['categories', hexo.config.category_dir],
    ['tags', hexo.config.tag_dir]
  ]) {
    const values = data[field] || []
    if (!Array.isArray(values)) continue
    const items = values.map(name => ({ name, path: `${directory}/${name}/` }))
    data[field] = { data: items, length: items.length }
  }

  return data
})
