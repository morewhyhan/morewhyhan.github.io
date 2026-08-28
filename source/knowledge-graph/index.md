---
title: 知识图谱
date: 2026-08-28 12:00:00
type: knowledge-graph
comments: false
aside: false
top_img: false
graph: false
---

<div class="knowledge-graph-intro">
  <p>这里不是另一套目录，而是本站所有公开文章、图书专题与机制卡片之间的关系网络。拖动节点观察结构，滚轮缩放，点击节点进入正文。</p>
</div>

<div id="knowledge-graph-app" class="knowledge-graph-app" aria-label="知识图谱">
  <div class="knowledge-graph-toolbar">
    <label class="knowledge-graph-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input type="search" data-graph-search placeholder="搜索节点" autocomplete="off" />
    </label>
    <div class="knowledge-graph-actions">
      <button type="button" data-graph-reset title="重新整理图谱"><i class="fas fa-redo-alt"></i><span>重置</span></button>
      <button type="button" data-graph-fullscreen title="全屏查看"><i class="fas fa-expand"></i><span>全屏</span></button>
      <button type="button" data-graph-settings title="图谱设置"><i class="fas fa-sliders-h"></i><span>设置</span></button>
    </div>
  </div>
  <div class="knowledge-graph-settings" data-graph-settings-panel hidden>
    <label>节点斥力 <input type="range" min="20" max="260" value="105" data-force="repel" /></label>
    <label>中心力 <input type="range" min="0" max="100" value="28" data-force="center" /></label>
    <label>连线距离 <input type="range" min="20" max="160" value="62" data-force="distance" /></label>
    <label><input type="checkbox" checked data-graph-orphans /> 显示孤立节点</label>
  </div>
  <div class="knowledge-graph-legend" data-graph-legend></div>
  <div class="knowledge-graph-canvas" data-graph-canvas>
    <div class="knowledge-graph-loading">正在整理知识之间的关系……</div>
  </div>
  <div class="knowledge-graph-status" data-graph-status></div>
</div>
