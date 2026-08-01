/**
 * 孪生宇宙 — 跨项目导航（独立文件，配合 CSP 无内联脚本策略）
 * 从 psychscope/projects.json 拉取其他项目列表展示
 */
(function () {
  'use strict';

  var SELF_PROJECT = 'poetry-glory-world';
  var PROJECTS_URL = 'https://yun-ai-base.github.io/psychscope/projects.json';
  var TWIN_CATS = {
    ai:       { label: 'AI 对话',   emoji: '🤖' },
    tool:     { label: '工具',      emoji: '🛠️' },
    content:  { label: '内容精选',  emoji: '📖' }
  };
  var TWIN_ORDER = ['ai', 'tool', 'content'];
  var twinBuilt = false;

  function escHtml(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  }

  function toggleTwin() {
    var v = document.getElementById('twinView');
    if (!v) return;
    var willOpen = !v.classList.contains('open');
    v.classList.toggle('open');
    document.body.style.overflow = willOpen ? 'hidden' : '';
    // 弹窗打开时关闭球体交互，防止点击穿透误触发诗人节点
    if (window.__pgw && window.__pgw.setSphereInteractive) {
      window.__pgw.setSphereInteractive(!willOpen);
    }
    if (willOpen && !twinBuilt) {
      twinBuilt = true;
      buildTwin();
    }
  }

  function buildTwin() {
    var container = document.getElementById('twinContainer');
    function fail() {
      if (container) {
        container.innerHTML = '<div class="twin-fallback">🌫 其他项目暂时无法加载（网络或服务异常）</div>';
      }
    }
    if (!container) return;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', PROJECTS_URL, true);
    xhr.timeout = 8000;
    xhr.onload = function () {
      if (xhr.status !== 200) { fail(); return; }
      try {
        var all = JSON.parse(xhr.responseText);
        var projects = all.filter(function (p) { return p.name !== SELF_PROJECT; });
        var byCat = {};
        projects.forEach(function (s) { (byCat[s.cat] = byCat[s.cat] || []).push(s); });
        var html = '';
        TWIN_ORDER.forEach(function (cat) {
          var list = byCat[cat];
          if (!list) return;
          var info = TWIN_CATS[cat];
          html += '<div class="twin-section">'
               + '<div class="twin-section-title">' + info.emoji + ' ' + info.label + '</div>'
               + '<div class="twin-grid">';
          list.forEach(function (s) {
            html += '<a class="twin-card" href="https://yun-ai-base.github.io/' + encodeURIComponent(s.name) + '/" target="_blank" rel="noopener noreferrer">'
                 + '<span class="twin-card-icon">' + escHtml(s.icon) + '</span>'
                 + '<span class="twin-card-info">'
                 + '<span class="twin-card-name">' + escHtml(s.name) + '</span>'
                 + '<span class="twin-card-desc">' + escHtml(s.desc) + '</span>'
                 + '</span>'
                 + '<span class="twin-card-arrow">→</span>'
                 + '</a>';
          });
          html += '</div></div>';
        });
        container.innerHTML = html || '<div class="twin-fallback">暂未发现其他项目</div>';
      } catch (e) { fail(); }
    };
    xhr.onerror = fail;
    xhr.ontimeout = fail;
    xhr.send();
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var v = document.getElementById('twinView');
      if (v && v.classList.contains('open')) toggleTwin();
    }
  });

  // 事件绑定（CSP script-src 'self' 禁内联 onclick，必须用 addEventListener）
  function bindTwinEvents() {
    var footerBtn = document.getElementById('footerTwinBtn');
    if (footerBtn) footerBtn.addEventListener('click', toggleTwin);

    var closeBtn = document.getElementById('twinCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', toggleTwin);

    var overlay = document.getElementById('twinView');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) toggleTwin(); // 点击遮罩关闭
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindTwinEvents);
  } else {
    bindTwinEvents();
  }

  // 暴露给 index.html 内联 onclick 使用
  window.toggleTwin = toggleTwin;
  window.buildTwin = buildTwin;
  window.escHtml = escHtml;
})();
