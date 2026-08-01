/**
 * 中国诗词人荣耀世界 — 共享工具模块
 * 统一颜色解析 / 透明度处理，供 sphere3d.js、radar-chart.js 复用
 */
(function () {
  'use strict';

  var PGW = window.PGW = window.PGW || {};

  /**
   * 十六进制颜色 -> RGB 分量
   * @param {string} hex - 如 '#C93B3B' 或 'C93B3B'（支持 3 位简写）
   * @returns {{r:number,g:number,b:number}}
   */
  PGW.parseColor = function (hex) {
    var c = String(hex || '').replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var n = parseInt(c, 16);
    if (isNaN(n)) return { r: 0, g: 0, b: 0 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };

  /**
   * 十六进制颜色 + 透明度 -> rgba() 字符串
   * @param {string} hex
   * @param {number} alpha - 0~1
   * @returns {string}
   */
  PGW.colorWithAlpha = function (hex, alpha) {
    var c = PGW.parseColor(hex);
    var a = Math.max(0, Math.min(1, Number(alpha) || 0));
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  };

})();
