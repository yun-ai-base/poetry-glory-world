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
  const searchInput = document.getElementById('searchInput');
  const eraSelect = document.getElementById('eraSelect');
  const clearFilterBtn = document.getElementById('clearFilter');

  let currentTier = '最强王者';
  let sphere = null;
  // 当前是否有激活的筛选（关键词 / 时代）
  let filterActive = false;
  // 当前打开的弹窗诗人（用于导出等）
  var currentPoet = null;

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

  // ===== 搜索与筛选 =====
  /** 关键词匹配：诗人名/朝代/称号/籍贯/名句/技能/流派/团体/关键字 */
  function matchKeyword(poet, kw) {
    if (!kw) return true;
    var pool = [];
    pool.push(poet.name || '');
    var bio = poet.basicInfo || {};
    pool.push(bio.dynasty || '', bio.title || '', bio.hometown || '');
    (poet.famousQuotes || []).forEach(function (q) { if (q && q.text) pool.push(q.text); });
    (poet.skills || []).forEach(function (s) {
      if (!s) return;
      pool.push(s.name || '');
      (s.highlights || []).forEach(function (h) { pool.push(h || ''); });
      if (s.poem) pool.push(s.poem);
    });
    var sch = poet.school || {};
    (sch.style || []).forEach(function (x) { pool.push(x); });
    (sch.group || []).forEach(function (x) { pool.push(x); });
    (((poet.keyData || {}).keywords) || []).forEach(function (x) { pool.push(x); });
    return pool.some(function (t) { return t && t.indexOf(kw) >= 0; });
  }

  /** 时代匹配：按 dynasty 字段做包含式映射（简化，含"唐"即归隋唐等） */
  var ERA_RULES = [
    ['先秦', /先秦|战国|楚|诗经/],
    ['两汉', /汉/],
    ['魏晋南北朝', /魏|晋|南朝|南北朝|陈|梁|齐/],
    ['五代', /五代|南唐/],
    ['隋唐', /隋|唐/],
    ['宋', /宋/],
    ['元', /元/],
    ['明', /明/],
    ['清', /清/],
    ['近代', /近代/]
  ];
  function matchEra(poet, era) {
    if (!era || era === '全部') return true;
    var d = ((poet.basicInfo || {}).dynasty) || '';
    if (!d) return false;
    for (var i = 0; i < ERA_RULES.length; i++) {
      if (ERA_RULES[i][0] === era) return ERA_RULES[i][1].test(d);
    }
    return false;
  }

  /** 应用筛选：有筛选则跨段位显示匹配诗人，否则恢复当前段位 */
  function applyFilter() {
    var kw = searchInput ? searchInput.value.trim() : '';
    var era = eraSelect ? eraSelect.value : '全部';
    var cfg = getTierConfig(currentTier);
    filterActive = !!(kw || (era && era !== '全部'));

    if (!filterActive) {
      var poets = getPoetsByTier(currentTier);
      if (sphere) sphere.setPoets(poets, cfg.color, cfg.fontFamily);
      updateFooter(currentTier, poets.length);
      return;
    }
    var filtered = ALL_POETS.filter(function (p) { return matchKeyword(p, kw) && matchEra(p, era); });
    if (sphere) sphere.setPoets(filtered, cfg.color, cfg.fontFamily);
    footerInfo.innerHTML = '筛选结果 · 共' + filtered.length + '位诗人';
    footerInfo.style.color = cfg.color;
  }

  function clearFilter() {
    if (searchInput) searchInput.value = '';
    if (eraSelect) eraSelect.value = '全部';
    applyFilter();
  }

  // ===== 视图切换（球体 / 时间线）=====
  var ERA_YEARS = {
    '先秦': '约前770 — 前221',
    '两汉': '前202 — 220',
    '魏晋南北朝': '220 — 589',
    '隋唐': '581 — 907',
    '五代': '907 — 960',
    '宋': '960 — 1279',
    '元': '1271 — 1368',
    '明': '1368 — 1644',
    '清': '1644 — 1912',
    '近代': '1912 — 1949'
  };
  var timelineBuilt = false;

  /** 解析生卒年字符串为数值（"约前340"→-340，"701"→701，失败→null） */
  function parseYear(str) {
    if (!str) return null;
    var s = String(str);
    var neg = s.indexOf('前') >= 0;
    s = s.replace(/约|年左右|前后|年|初|中|末|早期|晚期|前/g, '').trim();
    var n = parseInt(s, 10);
    if (isNaN(n)) return null;
    return neg ? -n : n;
  }

  /** 诗人所属时代（第一个匹配的 ERA_RULES） */
  function getPoetEra(poet) {
    var d = ((poet.basicInfo || {}).dynasty) || '';
    for (var i = 0; i < ERA_RULES.length; i++) {
      if (ERA_RULES[i][1].test(d)) return ERA_RULES[i][0];
    }
    return '其他';
  }

  /** 排序用年份：优先出生年，其次死亡年，再按时代中值，最后末尾 */
  function poetYear(poet) {
    var y = parseYear((poet.basicInfo || {}).birthYear);
    if (y != null) return y;
    y = parseYear((poet.basicInfo || {}).deathYear);
    if (y != null) return y;
    return 1e7;
  }

  function buildTimeline() {
    var container = document.getElementById('timelineScroll');
    if (!container) return;
    var eras = ERA_RULES.map(function (r) { return r[0]; }).concat(['其他']);
    var groups = {};
    eras.forEach(function (e) { groups[e] = []; });
    ALL_POETS.forEach(function (p) {
      var era = getPoetEra(p);
      groups[era].push({ p: p, y: poetYear(p) });
    });
    var html = '';
    eras.forEach(function (e) {
      var list = groups[e].slice().sort(function (a, b) { return a.y - b.y; });
      if (!list.length) return;
      var cfg = getTierConfig(list[0].p.tier);
      html += '<div class="timeline-era">';
      html += '  <div class="timeline-era-head">'
            + '<span class="timeline-era-name" style="color:' + cfg.color + '">' + e + '</span>'
            + '<span class="timeline-era-years">' + (ERA_YEARS[e] || '') + '</span>'
            + '<span class="timeline-era-count">' + list.length + ' 位</span>'
            + '</div>';
      html += '  <div class="timeline-era-poets">';
      list.forEach(function (it) {
        var p = it.p;
        var c = getTierConfig(p.tier);
        html += '<button class="timeline-poet" data-poet-name="' + p.name + '"'
              + ' style="border-color:' + c.color + ';color:' + c.color + '"'
              + ' title="' + (((p.basicInfo || {}).dynasty) || '') + ' · ' + (((p.basicInfo || {}).birthYear) || '?') + '—' + (((p.basicInfo || {}).deathYear) || '?') + '">'
              + p.name + '</button>';
      });
      html += '  </div>';
      html += '</div>';
    });
    container.innerHTML = html;
    // 委托点击
    if (!container._timelineBound) {
      container._timelineBound = true;
      container.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-poet-name]');
        if (!btn) return;
        var name = btn.getAttribute('data-poet-name');
        var target = ALL_POETS.find(function (p) { return p.name === name; });
        if (target) showPoetDetail(target);
      });
    }
  }

  function setView(view) {
    var sphereC = document.querySelector('.sphere-container');
    var tl = document.getElementById('timelineView');
    var isSphere = view === 'sphere';
    if (sphereC) sphereC.style.display = isSphere ? '' : 'none';
    if (tl) tl.hidden = isSphere;
    document.querySelectorAll('.view-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === view);
    });
    if (isSphere) {
      if (sphere) sphere.start();
    } else {
      if (sphere) sphere.stop();
      if (!timelineBuilt) { timelineBuilt = true; buildTimeline(); }
    }
  }

  function bindViewEvents() {
    document.querySelectorAll('.view-btn').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.dataset.view); });
    });
  }

  function bindFilterEvents() {
    if (!searchInput || !eraSelect || !clearFilterBtn) return;
    var timer = null;
    searchInput.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(applyFilter, 200);
    });
    eraSelect.addEventListener('change', applyFilter);
    clearFilterBtn.addEventListener('click', clearFilter);
    // Enter 直接应用（输入法/移动端友好）
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { clearTimeout(timer); applyFilter(); }
    });
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
    currentPoet = poet;
    var config = getTierConfig(poet.tier);
    var bio = poet.basicInfo || {};
    var years = (bio.birthYear || '不详') + ' — ' + (bio.deathYear || '不详');
    var html = '';

    // 头部
    html += '<div class="modal-section modal-header-section">';
    html += '  <div class="modal-title-row">';
    html += '    <h2 class="modal-poet-name" style="color:' + config.color + '">' + (poet.name || '无名氏') + '</h2>';
    html += '    <span class="modal-poet-title">' + (bio.title || '诗人') + '</span>';
    html += '    <button class="export-btn" data-action="export-poet" title="导出为 Markdown 文件">导出 ↓</button>';
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
      html += '  <h3 class="modal-section-title">关系网络 <span style="font-size:0.7rem;font-weight:400;color:#8A8078;letter-spacing:0">点击诗人可跳转</span></h3>';
      html += '  <div class="modal-relationships">';
      poet.relationships.forEach(function (rel) {
        var linked = ALL_POETS.some(function (p) { return p.name === rel.target; });
        var tag = linked ? 'button' : 'div';
        html += '  <' + tag + ' class="relation-item' + (linked ? ' relation-link' : '') + '"'
              + (linked ? ' data-rel-target="' + rel.target + '"' : '')
              + ' style="border-color:' + config.color + '40">';
        html += '    <span class="relation-type" style="color:' + config.color + '">' + rel.type + '</span>';
        html += '    <span class="relation-target">' + rel.target + '</span>';
        html += '    <span class="relation-label">' + rel.label + '</span>';
        html += '  </' + tag + '>';
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

  // ===== 导出 Markdown =====
  function escMd(s) { return String(s == null ? '' : s).replace(/[\\`*_{}\[\]()#+\-.!|>]/g, function (m) { return '\\' + m; }); }

  function exportPoetMarkdown(poet) {
    if (!poet) return;
    var bio = poet.basicInfo || {};
    var cfg = getTierConfig(poet.tier);
    var L = [];
    L.push('# ' + (poet.name || '无名氏') + (bio.title ? ' · ' + bio.title : ''));
    L.push('');
    L.push('> ' + (bio.dynasty || '') + ' · ' + (bio.birthYear || '?') + ' — ' + (bio.deathYear || '?') + ' · ' + (bio.hometown || ''));
    L.push('> 段位：' + (poet.tier || '') + '  ·  配色：' + (cfg.colorName || '') + ' ' + (cfg.color || ''));
    L.push('');
    if (bio.description) { L.push(bio.description); L.push(''); }

    // 六维
    if (poet.stats) {
      L.push('## 六维数据');
      L.push('');
      L.push('| 维度 | 评分 |');
      L.push('|------|------|');
      var labels = { literaryInfluence:'文学影响力', artisticAchievement:'艺术成就', innovation:'创新性', popularity:'传唱度', depth:'思想深度', technique:'技法工整' };
      Object.keys(labels).forEach(function (k) {
        var v = poet.stats[k];
        L.push('| ' + labels[k] + ' | ' + (v != null ? v : '不详') + ' |');
      });
      L.push('');
    }

    if (poet.school) {
      L.push('## 流派阵营');
      L.push('');
      if (poet.school.style && poet.school.style.length) L.push('- 风格：' + poet.school.style.join('、'));
      if (poet.school.group && poet.school.group.length) L.push('- 团体：' + poet.school.group.join('、'));
      L.push('');
    }

    if (poet.skills && poet.skills.length) {
      L.push('## 技能 · 代表作');
      L.push('');
      poet.skills.forEach(function (s) {
        if (!s) return;
        L.push('### ' + s.name + (s.type ? ' [' + s.type + ']' : ''));
        if (s.description) L.push('> ' + s.description);
        if (s.poem) {
          var poemLines = s.poem.split('。');
          var hl = s.highlights || [];
          L.push('');
          poemLines.forEach(function (l) {
            l = (l || '').trim();
            if (!l) return;
            var isHL = hl.some(function (h) { return h && (l.indexOf(h) >= 0 || h.indexOf(l) >= 0); });
            L.push('> ' + (isHL ? '**' + l + '。**' : l + '。'));
          });
          L.push('');
        }
        if (s.highlights && s.highlights.length) {
          L.push('**名句**：' + s.highlights.map(function (h) { return '「' + h + '」'; }).join(' / '));
          L.push('');
        }
      });
    }

    if (poet.famousQuotes && poet.famousQuotes.length) {
      L.push('## 代表诗句');
      L.push('');
      poet.famousQuotes.forEach(function (q) {
        L.push('> 「' + (q.text || '') + '」');
        L.push('> —— ' + (q.source || ''));
      });
      L.push('');
    }

    if (poet.relationships && poet.relationships.length) {
      L.push('## 关系网络');
      L.push('');
      poet.relationships.forEach(function (r) {
        L.push('- **' + (r.type || '') + '** ' + (r.target || '') + (r.label ? ' · ' + r.label : ''));
      });
      L.push('');
    }

    if (poet.stories) {
      if (poet.stories.keywords && poet.stories.keywords.length) {
        L.push('## 标签');
        L.push('');
        L.push(poet.stories.keywords.map(function (k) { return '`' + k + '`'; }).join(' '));
        L.push('');
      }
      if (poet.stories.anecdote) {
        L.push('## 生平典故选');
        L.push('');
        L.push(poet.stories.anecdote);
        L.push('');
      }
    }

    if (poet.keyData) {
      L.push('## 关键数据');
      L.push('');
      if (poet.keyData.extantWorks) L.push('- 存世作品：' + poet.keyData.extantWorks);
      if (poet.keyData.famousLines) L.push('- 千古名句：' + poet.keyData.famousLines);
      if (poet.keyData.keywords && poet.keyData.keywords.length) L.push('- 关键词：' + poet.keyData.keywords.join('、'));
      L.push('');
    }

    L.push('---');
    L.push('');
    L.push('*来自 中国诗词人·荣耀世界 · yun-ai-base.github.io/poetry-glory-world*');

    var md = L.join('\n');
    var filename = (poet.name || '无名氏') + '.md';
    filename = filename.replace(/[\\/:*?"<>|]/g, ''); // 清理文件名特殊字符
    downloadFile(filename, md);
  }

  function downloadFile(filename, content) {
    var blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
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
  // 卡片翻转 + 导出按钮 + 关系跳转：事件委托 + 阻止冒泡
  modalBody.addEventListener('click', function (e) {
    var relBtn = e.target.closest('[data-rel-target]');
    if (relBtn) {
      e.stopPropagation();
      var tName = relBtn.getAttribute('data-rel-target');
      var target = ALL_POETS.find(function (p) { return p.name === tName; });
      if (target) {
        closeModal();
        setTimeout(function () { showPoetDetail(target); }, 60);
      }
      return;
    }
    var exportBtn = e.target.closest('[data-action="export-poet"]');
    if (exportBtn) {
      e.stopPropagation();
      exportPoetMarkdown(currentPoet);
      return;
    }
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

  // 绑定搜索与筛选（脚本在 body 末尾执行，DOM 已就绪）
  bindFilterEvents();
  // 绑定视图切换（球体 / 时间线）
  bindViewEvents();

  // 供孪生宇宙弹窗（index.html 内联脚本）同步球体交互状态，
  // 防止弹窗内点击经 window 级 mouseup 误触发诗人节点
  window.__pgw = window.__pgw || {};
  window.__pgw.setSphereInteractive = function (flag) {
    if (sphere) sphere.setInteractive(flag);
  };

  // ===== 主题（浅色 / 暗色）=====
  var THEME_KEY = 'pgw-theme';
  function getPreferredTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (saved === 'light' || saved === 'dark') return saved;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    var btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme') || 'light';
    setTheme(cur === 'dark' ? 'light' : 'dark');
  }

  // 初始化（在 DOMContentLoaded 之前也可，因为 documentElement 已存在）
  setTheme(getPreferredTheme());


  // 绑定切换按钮（在 init 之外，DOM 已就绪）
  var themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', toggleTheme);
    themeBtn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTheme(); }
    });
  }

  // 跟随系统主题变化（仅在用户未显式选择时）
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var listener = function (e) {
      var saved = null;
      try { saved = localStorage.getItem(THEME_KEY); } catch (err) {}
      if (saved !== 'light' && saved !== 'dark') {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    if (mq.addEventListener) mq.addEventListener('change', listener);
    else if (mq.addListener) mq.addListener(listener); // 兼容旧 API
  }
})();
