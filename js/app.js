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
    return POETS_DATA.filter(function (p) { return p.tier === tier; });
  }

  function getTierConfig(tier) {
    return TIER_CONFIG[tier] || TIER_CONFIG['最强王者'];
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
      var navRect = tierTabsNav.getBoundingClientRect();
      var tabRect = activeTab.getBoundingClientRect();
      var config = getTierConfig(tier);
      tierBgSlider.style.left = (tabRect.left - navRect.left) + 'px';
      tierBgSlider.style.width = tabRect.width + 'px';
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
    if (!poets || poets.length === 0) { return; }
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
    var config = getTierConfig(poet.tier);
    var bio = poet.basicInfo;
    var years = bio.birthYear + ' — ' + bio.deathYear;
    var html = '';

    // 头部
    html += '<div class="modal-section modal-header-section">';
    html += '  <div class="modal-title-row">';
    html += '    <h2 class="modal-poet-name" style="color:' + config.color + '">' + poet.name + '</h2>';
    html += '    <span class="modal-poet-title">' + bio.title + '</span>';
    html += '  </div>';
    html += '  <div class="modal-bio">';
    html += '    <span class="bio-item"><span class="bio-label">时代</span>' + bio.dynasty + '</span>';
    html += '    <span class="bio-item"><span class="bio-label">生卒</span>' + years + '</span>';
    html += '    <span class="bio-item"><span class="bio-label">籍贯</span>' + bio.hometown + '</span>';
    html += '    <span class="bio-item"><span class="bio-label">段位</span><span class="tier-badge" style="background:' + config.color + '">' + poet.tier + '</span></span>';
    html += '    <p class="bio-desc">' + bio.description + '</p>';
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
        html += '  <div class="skill-card-flip" onclick="this.classList.toggle(\'flipped\')" style="border-left-color:' + config.color + '">';
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

    // 代表诗句
    if (poet.famousQuotes && poet.famousQuotes.length) {
      html += '<div class="modal-section">';
      html += '  <h3 class="modal-section-title">代表诗句</h3>';
      html += '  <div class="modal-quotes">';
      poet.famousQuotes.forEach(function (q) {
        html += '  <div class="quote-block" style="border-left-color:' + config.color + '">';
        html += '    <p class="quote-text">「' + q.text + '」</p>';
        html += '    <p class="quote-source">—— ' + q.source + '</p>';
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
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (sphere) sphere.resize(); }, 200);
  });

  function init() {
    console.log('中国诗词人荣耀世界 v1.0');
    if (!canvas) return;
    if (!POETS_DATA || !POETS_DATA.length) return;
    if (typeof PoetSphere !== 'function') return;
    try {
      switchTier('最强王者');
      setTimeout(function () {
        setActiveTab('最强王者');
        if (tierBgSlider) tierBgSlider.classList.add('tier-bg-slider--animated');
      }, 100);
    } catch (e) {
      console.error('初始化失败:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
