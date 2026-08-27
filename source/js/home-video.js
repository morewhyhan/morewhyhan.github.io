(() => {
  'use strict'

  const HOME_HEADER = '#body-wrap.type-rain-home #page-header'
  const VIDEO_CLASS = 'home-hero-video'
  const VIDEO_URL = '/media/home-hero-loop.mp4'
  const POSTER_URL = '/img/home-hero-loop-poster.jpg'
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  function removeStaleVideo(activeHeader) {
    document.querySelectorAll(`.${VIDEO_CLASS}`).forEach(video => {
      if (!activeHeader || !activeHeader.contains(video)) {
        video.pause()
        video.remove()
      }
    })
  }

  function mountHomeVideo() {
    const header = document.querySelector(HOME_HEADER)
    removeStaleVideo(header)

    if (!header || reduceMotion.matches) return

    let video = header.querySelector(`.${VIDEO_CLASS}`)
    if (!video) {
      video = document.createElement('video')
      video.className = VIDEO_CLASS
      video.src = VIDEO_URL
      video.poster = POSTER_URL
      video.autoplay = true
      video.defaultMuted = true
      video.muted = true
      video.loop = true
      video.playsInline = true
      video.preload = 'auto'
      video.disablePictureInPicture = true
      video.setAttribute('aria-hidden', 'true')
      video.setAttribute('muted', '')
      video.setAttribute('playsinline', '')
      video.setAttribute('webkit-playsinline', '')
      video.setAttribute('disableRemotePlayback', '')
      header.prepend(video)
    }

    const playback = video.play()
    if (playback && typeof playback.catch === 'function') {
      playback.catch(() => {
        // The configured poster remains visible if a browser blocks autoplay.
      })
    }
  }

  document.addEventListener('DOMContentLoaded', mountHomeVideo)
  document.addEventListener('pjax:complete', mountHomeVideo)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) mountHomeVideo()
  })

  reduceMotion.addEventListener?.('change', mountHomeVideo)
})()
