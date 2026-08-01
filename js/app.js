/**
 * 中国诗词人荣耀世界 - 主应用逻辑
 */
(function () {
  'use strict';

  const TIER_CONFIG = {
    '最强王者': { color: '#C93B3B', lightColor: '#F5D6A8', label: '最强王者', colorName: '朱砂红', fontFamily: '"Noto Serif SC", "STZhongsong", "SimSun", serif' },
    '至尊星耀': { color: '#6B9A8F', lightColor: '#D0E8E0', label: '至尊星耀', colorName: '天 青', fontFamily: '"STKaiti", "KaiTi", serif' },
    '永恒钻石': { color: '#7A9CAE', lightColor: '#C8DEE8', label: '永恒钻石', colorName: '东方既白', fontFamily: '"Songti SC", "SimSun", serif' },
    '尊贵铂金': { color: '#9E9E6D', lightColor: '#D8D8C0', label: '尊贵铂金', colorName: '秋香色', fontFamily: '"STFangsong", "FangSong", serif' },
    '荣耀黄金': { color: '#8B7D9A', lightColor: '#D8D0E4', label: '荣耀黄金', colorName: '暮山紫', fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif' }
  };

  // 数据源 = 基础数据（poets-data.js）+ 分类扩充（poets-extra.js），任一缺失仍可用另一
  // 注意：两者均为 const 全局声明，不在 window 对象上，须用 typeof 判断
  var ALL_POETS = (typeof POETS_DATA !== 'undefined' ? POETS_DATA : [])
    .concat(typeof POETS_EXTRA !== 'undefined' ? POETS_EXTRA : []);

  const canvas = document.getElementById('sphereCanvas');
  const tierTabs = document.querySelectorAll('.tier-tab');
  const tierTabsNav = document.getElementById('tierTabs');
  const tierBgSlider = document.getElementById('tierBgSlider');
  const footerInfo = document.getElementById('tierInfo');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalContent = document.getElementById('modalContent');
  const modalBody = document.getElementById('modalBody');
  const modalClose = document.getElementById('modalClose');
  const sphereContainer = document.querySelector('.sphere-container');

  let currentTier = '最强王者';
  let sphere = null;

  function getPoetsByTier(tier) {
    return ALL_POETS.filter(function (p) { return p.tier === tier; });
  }

  function getTierConfig(tier) {
    return TIER_CONFIG[tier] || TIER_CONFIG['最强王者'];
  }

  /** 根据名句的 source 找到关联 skill（获取完整诗文） */
  function findQuoteSkill(poet, quote) {
    if (!poet.skills || !quote) return null;
    var target = (quote.source || '').replace(/[《》]/g, '');
    if (!target) return null;
    // 单遍匹配：精确 > 前缀（"声声慢"→"声声慢·寻寻觅觅"）> 互相包含（"饮酒·其五"→"饮酒（其五）"）
    for (var i = 0; i < poet.skills.length; i++) {
      var name = poet.skills[i].name;
      if (name === target || name.indexOf(target) >= 0 || target.indexOf(name) >= 0) {
        return poet.skills[i];
      }
    }
    return null;
  }

  function setActiveTab(tier) {
    var activeTab = null;
    tierTabs.forEach(function (tab) {
      if (tab.dataset.tier === tier) {
        tab.classList.add('active');
        activeTab = tab;
      } else {
        tab.classList.remove('active');
      }
    });
    if (tierBgSlider && activeTab) {
      var config = getTierConfig(tier);
      tierBgSlider.style.left = activeTab.offsetLeft + 'px';
      tierBgSlider.style.width = activeTab.offsetWidth + 'px';
      tierBgSlider.style.background = config.color;
    }
  }

  function updateFooter(tier, count) {
    var config = getTierConfig(tier);
    footerInfo.innerHTML = tier + ' · 共' + count + '位诗人 · <span style="opacity:0.6">' + config.colorName + ' ' + config.color + '</span>';
    footerInfo.style.color = config.color;
  }

  function switchTier(tier) {
    if (tier === currentTier && sphere) return;
    currentTier = tier;
    var poets = getPoetsByTier(tier);
    var config = getTierConfig(tier);
    if (!poets || poets.length === 0) {
      footerInfo.innerHTML = tier + ' · 暂无诗人';
      return;
    }
    setActiveTab(tier);
    updateFooter(tier, poets.length);
    if (!sphere) {
      sphere = new PoetSphere(canvas, poets, { tierColor: config.color, fontFamily: config.fontFamily });
      sphere.onNodeClick(function (poet) { showPoetDetail(poet); });
      sphere.start();
    } else {
      sphere.setPoets(poets, config.color, config.fontFamily);
    }
  }

  // ===== 详情弹窗 =====
  function showPoetDetail(poet) {
    if (!poet) return;
    var config = getTierConfig(poet.tier);
    var bio = poet.basicInfo || {};
    var years = (bio.birthYear || '不详') + ' — ' + (bio.deathYear || '不详');
    var html = '';

    // 头部
    html += '<div class="modal-section modal-header-section">';
    html += '  <div class="modal-title-row">';
    html += '    <h2 class="modal-poet-name" style="color:' + config.color + '">' + (poet.name || '无名氏') + '</h2>';
    html += '    <span class="modal-poet-title">' + (bio.title || '诗人') + '</span>';
    html += '  </div>';
    html += '  <div class="modal-bio">';
    html += '    <span class="bio-item"><span class="bio-label">时代</span>' + (bio.dynasty || '不详') + '</span>';
    html += '    <span class="bio-item"><span class="bio-label">生卒</span>' + years + '</span>';
    html += '    <span class="bio-item"><span class="bio-label">籍贯</span>' + (bio.hometown || '不详') + '</span>';
    html += '    <span class="bio-item"><span class="bio-label">段位</span><span class="tier-badge" style="background:' + config.color + '">' + (poet.tier || '未定级') + '</span></span>';
    html += '    <p class="bio-desc">' + (bio.description || '') + '</p>';
    html += '  </div>';
    html += '</div>';

    // 雷达图 + 关键数据
    html += '<div class="modal-section modal-stats-row">';
    html += '  <div class="modal-stats"><canvas id="radarCanvas"></canvas></div>';
    html += '  <div class="modal-keydata">';
    html += '    <h3 class="modal-section-title">关键数据</h3>';
    html += '    <div class="keydata-list">';
    if (poet.keyData) {
      html += '    <div class="keydata-item"><span class="keydata-label">存世作品</span><span class="keydata-value">' + (poet.keyData.extantWorks || '不详') + '</span></div>';
      html += '    <div class="keydata-item"><span class="keydata-label">千古名句</span><span class="keydata-value">' + (poet.keyData.famousLines || '不详') + '</span></div>';
      html += '    <div class="keydata-item"><span class="keydata-label">风格标签</span><span class="keydata-value">';
      if (poet.keyData.keywords) {
        poet.keyData.keywords.slice(0, 5).forEach(function (kw) {
          html += '<span class="keyword-tag">' + kw + '</span>';
        });
      }
      html += '    </span></div>';
    }
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    // 流派
    if (poet.school) {
      html += '<div class="modal-section">';
      html += '  <h3 class="modal-section-title">流派阵营</h3>';
      html += '  <div class="school-row">';
      if (poet.school.style && poet.school.style.length) {
        html += '    <div class="school-group"><span class="school-label">风格</span>';
        poet.school.style.forEach(function (s) { html += '<span class="school-tag" style="border-color:' + config.color + ';color:' + config.color + '">' + s + '</span>'; });
        html += '    </div>';
      }
      if (poet.school.group && poet.school.group.length) {
        html += '    <div class="school-group"><span class="school-label">团体</span>';
        poet.school.group.forEach(function (g) { html += '<span class="school-tag" style="border-color:' + config.color + ';color:' + config.color + '">' + g + '</span>'; });
        html += '    </div>';
      }
      html += '  </div>';
      html += '</div>';
    }

    // 技能/代表作（卡片翻转）
    if (poet.skills && poet.skills.length) {
      html += '<div class="modal-section">';
      html += '  <h3 class="modal-section-title">技能 · 代表作 <span style="font-size:0.7rem;font-weight:400;color:#8A8078;letter-spacing:0">点击翻转看全文</span></h3>';
      html += '  <div class="modal-skills">';
      poet.skills.forEach(function (skill) {
        var typeLabel = skill.type;
        var typeCls = skill.type === '大招' ? 'skill-ultimate' : (skill.type === '主动技' ? 'skill-active' : 'skill-passive');
        html += '  <div class="skill-card-flip" data-flip-card style="border-left-color:' + config.color + '">';
        // --- 正面 ---
        html += '    <div class="card-front">';
        html += '      <div class="skill-header"><span class="skill-name">' + skill.name + '</span><span class="skill-type" style="background:' + config.color + '">' + typeLabel + '</span></div>';
        if (skill.highlights && skill.highlights.length > 0) {
          for (var hi = 0; hi < Math.min(2, skill.highlights.length); hi++) {
            html += '      <p class="card-quote" style="color:' + config.color + '">「' + skill.highlights[hi] + '」</p>';
          }
        }
        html += '      <p class="skill-comment">' + skill.description + '</p>';
        html += '      <p class="flip-hint">点击翻转</p>';
        html += '    </div>';
        // --- 背面 ---
        html += '    <div class="card-back">';
        if (skill.poem) {
          html += '      <div class="skill-header"><span class="skill-name">' + skill.name + '</span><span class="skill-type" style="background:' + config.color + '">' + typeLabel + '</span></div>';
          html += '      <div class="card-poem">';
          var poemHL = skill.highlights || [];
          var poemLines = skill.poem.split('。');
          for (var li = 0; li < poemLines.length; li++) {
            var l = poemLines[li].trim(); if (!l) continue;
            var isHL = false;
            for (var h2 = 0; h2 < poemHL.length; h2++) {
              if (l.indexOf(poemHL[h2]) >= 0 || (poemHL[h2] && poemHL[h2].indexOf(l) >= 0)) { isHL = true; break; }
            }
            html += isHL ? '      <p class="poem-line hl">' + l + '。</p>' : '      <p class="poem-line">' + l + '。</p>';
          }
          html += '      </div>';
        } else {
          html += '      <p style="color:#8A8078;margin-top:16px;font-size:0.85rem">无完整诗词</p>';
        }
        html += '      <p class="flip-hint back">翻转返回</p>';
        html += '    </div>';
        html += '  </div>';
      });
      html += '  </div>';
      html += '</div>';
    }

    // 代表诗句（合并 famousQuotes + skill 高亮句，全部展示可翻转看全文）
    var expandedQuotes = [];
    var seenQuotes = {};
    if (poet.famousQuotes) {
      poet.famousQuotes.forEach(function (q) {
        if (!q || !q.text) return;
        seenQuotes[q.text] = true;
        expandedQuotes.push(q);
      });
    }
    if (poet.skills) {
      poet.skills.forEach(function (s) {
        if (!s.highlights) return;
        s.highlights.forEach(function (h) {
          if (seenQuotes[h]) return; // 与已有名句去重
          seenQuotes[h] = true;
          expandedQuotes.push({ text: h, source: '《' + s.name + '》', _skill: s });
        });
      });
    }
    if (expandedQuotes.length) {
      html += '<div class="modal-section">';
      html += '  <h3 class="modal-section-title">代表诗句 <span style="font-size:0.7rem;font-weight:400;color:#8A8078;letter-spacing:0">点击翻转看全文</span></h3>';
      html += '  <div class="modal-quotes">';
      expandedQuotes.forEach(function (q) {
        var skill = q._skill || findQuoteSkill(poet, q);
        var sourceClean = (q.source || '佚名出处').replace(/[《》]/g, '');
        html += '  <div class="quote-flip" data-flip-quote style="border-left-color:' + config.color + '">';
        // 正面
        html += '    <div class="quote-front">';
        html += '      <p class="quote-text">「' + q.text + '」</p>';
        html += '      <p class="quote-source">—— ' + q.source + '</p>';
        html += '      <p class="flip-hint">点击翻转</p>';
        html += '    </div>';
        // 背面
        html += '    <div class="quote-back" style="border-left-color:' + config.color + '">';
        html += '      <p class="quote-poem-title" style="color:' + config.color + '">' + sourceClean + '</p>';
        if (skill && skill.poem) {
          var poemLines = skill.poem.split('。');
          for (var li = 0; li < poemLines.length; li++) {
            var l = poemLines[li].trim(); if (!l) continue;
            var isHL = false;
            for (var h2 = 0; h2 < (skill.highlights || []).length; h2++) {
              if (l.indexOf(skill.highlights[h2]) >= 0 || (skill.highlights[h2] && skill.highlights[h2].indexOf(l) >= 0)) { isHL = true; break; }
            }
            html += isHL ? '      <p class="poem-line hl">' + l + '。</p>' : '      <p class="poem-line">' + l + '。</p>';
          }
        } else {
          html += '      <p class="poem-line" style="color:#8A8078;font-style:italic">（完整诗词未收录）</p>';
        }
        html += '      <p class="flip-hint back">翻转返回</p>';
        html += '    </div>';
        html += '  </div>';
      });
      html += '  </div>';
      html += '</div>';
    }

    // 关系网络
    if (poet.relationships && poet.relationships.length) {
      html += '<div class="modal-section">';
      html += '  <h3 class="modal-section-title">关系网络</h3>';
      html += '  <div class="modal-relationships">';
      poet.relationships.forEach(function (rel) {
        html += '  <div class="relation-item" style="border-color:' + config.color + '40">';
        html += '    <span class="relation-type" style="color:' + config.color + '">' + rel.type + '</span>';
        html += '    <span class="relation-target">' + rel.target + '</span>';
        html += '    <span class="relation-label">' + rel.label + '</span>';
        html += '  </div>';
      });
      html += '  </div>';
      html += '</div>';
    }

    // 人物故事
    if (poet.stories) {
      html += '<div class="modal-section">';
      html += '  <h3 class="modal-section-title">人物故事 · 生平典故选</h3>';
      html += '  <div class="modal-stories">';
      if (poet.stories.keywords && poet.stories.keywords.length) {
        html += '  <div class="story-keywords">';
        poet.stories.keywords.forEach(function (kw) { html += '<span class="story-keyword" style="background:' + config.lightColor + ';color:' + config.color + ';border:1px solid ' + config.color + '30">' + kw + '</span>'; });
        html += '  </div>';
      }
      if (poet.stories.anecdote) {
        html += '  <div class="story-anecdote-wrap" style="border-left-color:' + config.color + '">';
        html += '    <p class="story-anecdote">' + poet.stories.anecdote + '</p>';
        html += '  </div>';
      }
      html += '  </div>';
      html += '</div>';
    }

    modalBody.innerHTML = html;
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    canvas.style.pointerEvents = 'none';
    // 关闭球体指针交互，杜绝弹窗内点击通过 window 级 mouseup 误触发节点
    if (sphere) sphere.setInteractive(false);

    setTimeout(function () {
      var radarCanvas = document.getElementById('radarCanvas');
      if (radarCanvas && poet.stats) {
        drawRadarChart(radarCanvas, poet.stats, { color: config.color, size: Math.min(260, window.innerWidth - 100) });
      }
    }, 50);
  }

  function closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
    canvas.style.pointerEvents = '';
    // 恢复球体交互
    if (sphere) sphere.setInteractive(true);
  }

  // ===== 事件绑定 =====
  tierTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var tier = this.dataset.tier;
      if (tier !== currentTier) switchTier(tier);
    });
  });

  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', function (e) {
    if (e.target === modalOverlay) closeModal();
  });
  // 卡片翻转：事件委托 + 阻止冒泡，避免穿透 overlay 触发 canvas
  modalBody.addEventListener('click', function (e) {
    var card = e.target.closest('[data-flip-card], [data-flip-quote]');
    if (card) {
      e.stopPropagation();
      card.classList.toggle('flipped');
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (sphere) sphere.resize(); }, 200);
  });

  /**
   * 数据自检：重复名字 / 重复 globalId / 非法段位 / 空条目
   * 仅输出警告，不阻塞运行；用于数据扩充后的质量保障
   */
  function validateData(list) {
    var seenName = {}, seenId = {}, validTiers = Object.keys(TIER_CONFIG), issues = 0;
    (list || []).forEach(function (p) {
      if (!p || !p.name) { issues++; console.warn('[数据自检] 存在无名条目'); return; }
      if (seenName[p.name]) { issues++; console.warn('[数据自检] 重复诗人名：' + p.name); }
      seenName[p.name] = true;
      if (p.globalId != null) {
        if (seenId[p.globalId]) { issues++; console.warn('[数据自检] 重复 globalId：' + p.globalId); }
        seenId[p.globalId] = true;
      }
      if (p.tier && validTiers.indexOf(p.tier) < 0) { issues++; console.warn('[数据自检] 未知段位：' + p.name + ' -> ' + p.tier); }
    });
    if (issues) console.warn('[数据自检] 共发现 ' + issues + ' 个问题');
    else console.log('[数据自检] 数据完整，通过');
    return issues;
  }

  function init() {
    console.log('中国诗词人荣耀世界 v1.0');
    if (!canvas) return;
    if (!ALL_POETS || !ALL_POETS.length) {
      var emptyHint = document.getElementById('sphereHint');
      if (emptyHint) {
        emptyHint.textContent = '暂无诗人数据';
        emptyHint.classList.add('show');
      }
      footerInfo.innerHTML = '数据加载失败';
      return;
    }
    if (typeof PoetSphere !== 'function') return;
    validateData(ALL_POETS);
    try {
      switchTier('最强王者');
      setTimeout(function () {
        setActiveTab('最强王者');
        if (tierBgSlider) tierBgSlider.classList.add('tier-bg-slider--animated');
      }, 100);
      // 移动端双指缩放提示
      if (window.innerWidth < 768) {
        var hint = document.getElementById('sphereHint');
        if (hint) {
          hint.classList.add('show');
          setTimeout(function () { hint.classList.remove('show'); }, 3000);
        }
      }
    } catch (e) {
      console.error('初始化失败:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 供孪生宇宙弹窗（index.html 内联脚本）同步球体交互状态，
  // 防止弹窗内点击经 window 级 mouseup 误触发诗人节点
  window.__pgw = window.__pgw || {};
  window.__pgw.setSphereInteractive = function (flag) {
    if (sphere) sphere.setInteractive(flag);
  };
})();
