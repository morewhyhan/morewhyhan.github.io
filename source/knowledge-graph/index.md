---
title: 知识图谱
date: 2026-08-28 12:00:00
type: knowledge-graph
comments: false
aside: false
top_img: false
graph: false
---

<div id="knowledge-graph-app" class="knowledge-graph-app" aria-label="知识图谱">
  <div class="knowledge-graph-brand">
    <strong>知识图谱</strong>
    <span>分类成簇 · 拖动整理 · 点击阅读</span>
  </div>
  <div class="knowledge-graph-toolbar">
    <label class="knowledge-graph-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input type="search" data-graph-search placeholder="搜索节点" autocomplete="off" />
    </label>
    <div class="knowledge-graph-actions">
      <button type="button" data-graph-reset title="恢复星图视角"><i class="fas fa-crosshairs"></i><span>归位</span></button>
      <button type="button" data-graph-fullscreen title="进入沉浸模式"><i class="fas fa-expand"></i><span>沉浸</span></button>
      <button type="button" data-graph-settings title="图谱设置"><i class="fas fa-sliders-h"></i><span>设置</span></button>
    </div>
  </div>
  <div class="knowledge-graph-settings" data-graph-settings-panel hidden>
    <label>节点大小 <input type="range" min="70" max="150" value="100" data-graph-node-scale /></label>
    <label><input type="checkbox" checked data-graph-labels /> 显示节点名称</label>
    <label><input type="checkbox" checked data-graph-categories /> 显示分类中心</label>
    <label><input type="checkbox" checked data-graph-orphans /> 显示孤立节点</label>
  </div>
  <div class="knowledge-graph-legend" data-graph-legend></div>
  <div class="knowledge-graph-canvas" data-graph-canvas>
    <div class="knowledge-graph-loading">正在整理知识之间的关系……</div>
  </div>
  <div class="knowledge-graph-status" data-graph-status></div>
</div>
