/**
 * 六维雷达图绘制模块
 * 用于中国诗词人荣耀世界项目的诗人详情展示
 *
 * 六个维度：
 *   literaryInfluence    — 文学影响力
 *   artisticAchievement  — 艺术成就
 *   innovation           — 创新性
 *   popularity           — 传唱度
 *   depth                — 思想深度
 *   technique            — 技法工整
 */

(function () {
  'use strict';

  /**
   * 将十六进制颜色转为 rgba 字符串
   * @param {string} hex - 六位十六进制色值，如 '#C93B3B'
   * @param {number} alpha - 透明度 0-1
   * @returns {string}
   */
  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  /**
   * 绘制六维雷达图
   * @param {HTMLCanvasElement} canvas - Canvas 元素
   * @param {Object} stats - 六维数据
   * @param {number} [stats.literaryInfluence]
   * @param {number} [stats.artisticAchievement]
   * @param {number} [stats.innovation]
   * @param {number} [stats.popularity]
   * @param {number} [stats.depth]
   * @param {number} [stats.technique]
   * @param {Object} [options] - 配置项
   * @param {string} [options.color='#C93B3B'] - 主色（段位色）
   * @param {number} [options.size=240] - 图表尺寸（宽高，单位 px）
   * @param {number} [options.maxValue=10] - 数据最大值
   * @returns {Object} - { canvas }
   */
  function drawRadarChart(canvas, stats, options) {
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('drawRadarChart: 第一个参数必须为 Canvas 元素');
    }

    options = options || {};
    var opts = {
      color: '#C93B3B',
      size: 240,
      maxValue: 10
    };

    // 合并用户选项
    if (options.color !== undefined) opts.color = options.color;
    if (options.size !== undefined) opts.size = options.size;
    if (options.maxValue !== undefined) opts.maxValue = options.maxValue;

    var ctx = canvas.getContext('2d');

    // ---- DPR 适配 ----
    var dpr = window.devicePixelRatio || 1;
    var logicalSize = opts.size;
    var padding = 40; // 标签预留边距

    canvas.width = logicalSize * dpr;
    canvas.height = logicalSize * dpr;
    canvas.style.width = logicalSize + 'px';
    canvas.style.height = logicalSize + 'px';

    ctx.scale(dpr, dpr);

    // ---- 几何常量 ----
    var center = logicalSize / 2;
    var radius = center - padding;

    var labels = [
      '文学影响力',
      '艺术成就',
      '创新性',
      '传唱度',
      '思想深度',
      '技法工整'
    ];

    var keys = [
      'literaryInfluence',
      'artisticAchievement',
      'innovation',
      'popularity',
      'depth',
      'technique'
    ];

    // 角度：从顶部（12 点方向）开始，顺时针排列
    var angles = [];
    for (var i = 0; i < 6; i++) {
      angles[i] = -Math.PI / 2 + i * (Math.PI / 3);
    }

    var gridLevels = 5;

    // ---- 清空画布 ----
    ctx.clearRect(0, 0, logicalSize, logicalSize);

    // ================================================================
    // 1. 绘制同心六边形网格（5 层，对应数值 2,4,6,8,10）
    // ================================================================
    for (var level = 1; level <= gridLevels; level++) {
      var r = (radius / gridLevels) * level;
      ctx.beginPath();
      for (var j = 0; j < 6; j++) {
        var x = center + r * Math.cos(angles[j]);
        var y = center + r * Math.sin(angles[j]);
        if (j === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ================================================================
    // 2. 绘制轴线（从中心到每个顶点）
    // ================================================================
    for (var k = 0; k < 6; k++) {
      var endX = center + radius * Math.cos(angles[k]);
      var endY = center + radius * Math.sin(angles[k]);
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ================================================================
    // 3. 绘制刻度标注（沿第一条轴线标注 2,4,6,8,10）
    // ================================================================
    ctx.fillStyle = '#999';
    ctx.font = '10px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // 沿角度 0（右侧轴）标注
    var labelAngle = angles[1]; // -30°，右偏上
    var labelOffsetX = 6;
    var labelOffsetY = 0;
    for (var m = 1; m <= gridLevels; m++) {
      var lr = (radius / gridLevels) * m;
      var lx = center + lr * Math.cos(labelAngle) + labelOffsetX;
      var ly = center + lr * Math.sin(labelAngle) + labelOffsetY;
      var levelVal = Math.round((opts.maxValue / gridLevels) * m);
      ctx.fillText(String(levelVal), lx, ly);
    }

    // ================================================================
    // 4. 绘制数据多边形
    // ================================================================
    var points = [];
    ctx.beginPath();
    for (var p = 0; p < 6; p++) {
      var key = keys[p];
      var value = (stats && stats[key] !== undefined && stats[key] !== null)
        ? Number(stats[key])
        : 0;
      var pr = Math.min(value / opts.maxValue, 1) * radius;
      var px = center + pr * Math.cos(angles[p]);
      var py = center + pr * Math.sin(angles[p]);
      points.push({
        x: px,
        y: py,
        value: value
      });
      if (p === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();

    // 填充（半透明）
    ctx.fillStyle = hexToRgba(opts.color, 0.2);
    ctx.fill();

    // 边框
    ctx.strokeStyle = opts.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // ================================================================
    // 5. 数据点小圆 + 分值标注
    // ================================================================
    for (var q = 0; q < points.length; q++) {
      var pt = points[q];

      // 小圆点
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = opts.color;
      ctx.fill();

      // 分值标注（略偏离数据点）
      var scoreOffsetX = 0;
      var scoreOffsetY = -14;
      var a = angles[q];
      // 根据角度调整分值文字偏移
      if (a > -Math.PI / 4 && a < Math.PI / 4) {
        // 右侧区域
        scoreOffsetX = 10;
        scoreOffsetY = -4;
      } else if (a >= Math.PI / 4 && a < (Math.PI * 3) / 4) {
        // 底部区域
        scoreOffsetX = 0;
        scoreOffsetY = 14;
      } else if (a >= (Math.PI * 3) / 4 || a <= -(Math.PI * 3) / 4) {
        // 左侧区域
        scoreOffsetX = -10;
        scoreOffsetY = -4;
      } else {
        // 顶部区域
        scoreOffsetX = 0;
        scoreOffsetY = -14;
      }

      ctx.fillStyle = opts.color;
      ctx.font = 'bold 11px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(pt.value), pt.x + scoreOffsetX, pt.y + scoreOffsetY);
    }

    // ================================================================
    // 6. 维度标签
    // ================================================================
    var labelOffset = 18; // 标签与轴线末端的间距

    for (var t = 0; t < 6; t++) {
      var ang = angles[t];
      var lx = center + (radius + labelOffset) * Math.cos(ang);
      var ly = center + (radius + labelOffset) * Math.sin(ang);

      ctx.fillStyle = '#555555';
      ctx.font = '12px "PingFang SC","Microsoft YaHei",sans-serif';

      // ---- 文字水平对齐 ----
      var cosA = Math.cos(ang);
      if (cosA > 0.1) {
        ctx.textAlign = 'left';
      } else if (cosA < -0.1) {
        ctx.textAlign = 'right';
      } else {
        ctx.textAlign = 'center';
      }

      // ---- 文字垂直对齐 ----
      if (ang > 0 && ang < Math.PI) {
        ctx.textBaseline = 'top';
      } else {
        ctx.textBaseline = 'bottom';
      }

      ctx.fillText(labels[t], lx, ly);
    }

    return { canvas: canvas };
  }

  // ================================================================
  // 导出到全局
  // ================================================================
  window.drawRadarChart = drawRadarChart;
})();
