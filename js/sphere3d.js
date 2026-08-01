/**
 * PoetSphere - 3D旋转球体引擎
 * 将诗人节点分布在球面上，支持自动旋转、拖拽交互、关联线绘制
 */
(function () {
  'use strict';

  // ============================================================
  // 3D 数学辅助
  // ============================================================
  function rotateX(y, z, angle) {
    var cos = Math.cos(angle), sin = Math.sin(angle);
    return [y * cos - z * sin, y * sin + z * cos];
  }
  function rotateY(x, z, angle) {
    var cos = Math.cos(angle), sin = Math.sin(angle);
    return [x * cos + z * sin, -x * sin + z * cos];
  }

  /** Fibonacci 球体算法 — 均匀分布节点 */
  function fibonacciSphere(numPoints, radius) {
    var points = [];
    var goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < numPoints; i++) {
      var y = 1 - (i / (numPoints - 1 || 1)) * 2;
      var rAtY = Math.sqrt(1 - y * y);
      var theta = goldenAngle * i;
      points.push({
        x: Math.cos(theta) * rAtY * radius,
        y: y * radius,
        z: Math.sin(theta) * rAtY * radius
      });
    }
    return points;
  }

  /** 十六进制 -> RGB 分量（优先用共享工具，缺失时本地兜底） */
  function parseColor(hex) {
    if (window.PGW) return window.PGW.parseColor(hex);
    var c = String(hex || '').replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var n = parseInt(c, 16);
    if (isNaN(n)) return { r: 0, g: 0, b: 0 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  /** 十六进制 + alpha -> rgba() 字符串（优先用共享工具） */
  function colorWithAlpha(hex, alpha) {
    if (window.PGW) return window.PGW.colorWithAlpha(hex, alpha);
    var c = parseColor(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + Math.max(0, Math.min(1, alpha)) + ')';
  }

  // ============================================================
  // PoetSphere 主类
  // ============================================================
  function PoetSphere(canvas, poets, options) {
    if (!canvas) throw new Error('PoetSphere: canvas 不能为空');
    options = options || {};

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.poets = poets || [];
    this.tierColor = options.tierColor || '#C93B3B';
    this.fontFamily = options.fontFamily || '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';

    // 球体半径（0=自动）
    this.radius = options.radius || 0;
    // 旋转
    this.rotationX = 0;
    this.rotationY = 0;
    this.autoRotateSpeed = 0.003;
    // 拖拽
    this._dragging = false;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._dragRX = 0;
    this._dragRY = 0;
    this._vx = 0;
    this._vy = 0;
    this._inertia = 0.95;
    // 节点
    this.nodes = [];
    this._sortedNodes = [];
    // 交互
    this._clickCb = null;
    this.hoveredNode = null;
    // 动画
    this._running = false;
    this._animId = null;
    // 关系索引
    this._relMap = null;
    this._proximityEdges = null;
    // 事件
    this._handlers = {};
    // 交互开关（弹窗打开时关闭，防止 window 级 mouseup 穿透误触发点击）
    this._interactive = true;
    // 缩放
    this._pinchDist = 0;
    this._pinchRadius = 0;

    // 逻辑尺寸（实际用于绘制的像素）
    this.width = 0;
    this.height = 0;

    this._initSize();
    this._buildRelationMap();
    this._initNodes();
    this._buildProximityConnections();
  }

  // ==========================================================
  // 初始化
  // ==========================================================
  PoetSphere.prototype._initSize = function () {
    var parent = this.canvas.parentElement;
    var rect = parent ? parent.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
    var w = Math.max(rect.width, 100);
    var h = Math.max(rect.height, 200);

    // 不使用 DPR 缩放，直接用逻辑像素，避免坐标混乱
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';

    this.width = w;
    this.height = h;

    var isMobile = w < 768;
    this._isMobile = isMobile;
    this.radius = Math.min(w, h) * (isMobile ? 0.46 : 0.35);
  };

  PoetSphere.prototype._buildRelationMap = function () {
    this._relMap = new Map();
    for (var i = 0; i < this.poets.length; i++) {
      var poet = this.poets[i];
      var set = new Set();
      if (poet.relationships) {
        for (var j = 0; j < poet.relationships.length; j++) {
          set.add(poet.relationships[j].target);
        }
      }
      this._relMap.set(poet.name, set);
    }
  };

  /** 为每个节点找到球面上最近的2-3个邻居，形成网格连线 */
  PoetSphere.prototype._buildProximityConnections = function () {
    var nodes = this.nodes;
    if (nodes.length < 3) return;

    // 每个节点存储其最近邻居的索引列表
    var K = Math.min(3, nodes.length - 1);
    for (var i = 0; i < nodes.length; i++) {
      var dists = [];
      for (var j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        var dx = nodes[i].ox - nodes[j].ox;
        var dy = nodes[i].oy - nodes[j].oy;
        var dz = nodes[i].oz - nodes[j].oz;
        dists.push({ idx: j, dist: dx*dx + dy*dy + dz*dz });
      }
      dists.sort(function (a, b) { return a.dist - b.dist; });
      var neighbors = [];
      for (var k = 0; k < K; k++) {
        neighbors.push(dists[k].idx);
      }
      nodes[i].neighbors = neighbors;
    }

    // 建立去重的连线集合（i→j 和 j→i 只算一次）
    this._proximityEdges = [];
    var seen = {};
    for (var i = 0; i < nodes.length; i++) {
      var nbrs = nodes[i].neighbors || [];
      for (var k = 0; k < nbrs.length; k++) {
        var j = nbrs[k];
        var key = i < j ? i + '|' + j : j + '|' + i;
        if (seen[key]) continue;
        seen[key] = true;
        this._proximityEdges.push({ a: i, b: j });
      }
    }
  };

  PoetSphere.prototype._initNodes = function () {
    var count = this.poets.length;
    if (count === 0) { this.nodes = []; return; }
    var positions = fibonacciSphere(count, this.radius);

    this.nodes = [];
    for (var i = 0; i < count; i++) {
      var p = positions[i] || { x: 0, y: 0, z: 0 };
      this.nodes.push({
        poet: this.poets[i],
        ox: p.x, oy: p.y, oz: p.z,
        x: 0, y: 0, z: 0,
        sx: 0, sy: 0,
        scale: 1, opacity: 1, size: 20,
        showName: false
      });
    }
  };

  // ==========================================================
  // 公共 API
  // ==========================================================
  PoetSphere.prototype.start = function () {
    if (this._running) return;
    this._running = true;
    this._bindEvents();
    this._tick();
  };

  PoetSphere.prototype.stop = function () {
    this._running = false;
    if (this._animId) { cancelAnimationFrame(this._animId); this._animId = null; }
    this._unbindEvents();
  };

  PoetSphere.prototype.setPoets = function (poets, tierColor, fontFamily) {
    this.poets = poets || [];
    if (tierColor) this.tierColor = tierColor;
    if (fontFamily) this.fontFamily = fontFamily;
    this._buildRelationMap();
    this._initNodes();
    this._buildProximityConnections();
    this.rotationX = 0;
    this.rotationY = 0;
    this._vx = 0;
    this._vy = 0;
  };

  PoetSphere.prototype.onNodeClick = function (cb) {
    this._clickCb = cb;
  };

  /**
   * 启用/禁用球体指针交互。
   * 弹窗打开时必须设为 false：球体的 mouseup 监听挂在 window 上，
   * 弹窗内的点击会冒泡到 window 并命中背后节点，导致信息被误切换。
   * @param {boolean} flag
   */
  PoetSphere.prototype.setInteractive = function (flag) {
    this._interactive = !!flag;
    if (!this._interactive) {
      this._dragging = false;
      this.hoveredNode = null;
    }
  };

  PoetSphere.prototype.resize = function () {
    this._initSize();
    this._initNodes();
    this._buildProximityConnections();
  };

  PoetSphere.prototype.destroy = function () {
    this.stop();
    this.nodes = [];
    this.poets = [];
    this._clickCb = null;
    this.hoveredNode = null;
    this._relMap = null;
  };

  // ==========================================================
  // 事件绑定
  // ==========================================================
  PoetSphere.prototype._getPos = function (clientX, clientY) {
    var rect = this.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  PoetSphere.prototype._bindEvents = function () {
    var self = this;
    var c = this.canvas;
    var h = this._handlers;

    h.mousedown = function (e) { self._onDown(self._getPos(e.clientX, e.clientY)); };
    h.mousemove = function (e) { self._onMove(self._getPos(e.clientX, e.clientY)); };
    h.mouseup = function (e) {
      self._onUp(self._getPos(e.clientX, e.clientY));
    };
    h.mouseleave = function () {
      self._dragging = false;
      self.hoveredNode = null;
    };

    c.addEventListener('mousedown', h.mousedown);
    c.addEventListener('mousemove', h.mousemove);
    window.addEventListener('mouseup', h.mouseup);
    c.addEventListener('mouseleave', h.mouseleave);

    h.touchstart = function (e) {
      e.preventDefault();
      if (e.touches.length === 2) {
        // 双指缩放开始
        var dx = e.touches[0].clientX - e.touches[1].clientX;
        var dy = e.touches[0].clientY - e.touches[1].clientY;
        self._pinchDist = Math.sqrt(dx*dx + dy*dy);
        self._pinchRadius = self.radius;
        self._dragging = false;
        self._dragDist = 999;
        return;
      }
      var t = e.touches[0];
      self._onDown(self._getPos(t.clientX, t.clientY));
    };
    h.touchmove = function (e) {
      e.preventDefault();
      if (e.touches.length === 2) {
        // 双指缩放
        var dx = e.touches[0].clientX - e.touches[1].clientX;
        var dy = e.touches[0].clientY - e.touches[1].clientY;
        var dist = Math.sqrt(dx*dx + dy*dy);
        var scale = dist / self._pinchDist;
        var newR = self._pinchRadius * scale;
        newR = Math.max(60, Math.min(500, newR)); // 限制范围
        if (Math.abs(newR - self.radius) > 2) {
          self.radius = newR;
          self.focalLength = newR * 2;
          self._initNodes();
          self._buildProximityConnections();
        }
        return;
      }
      var t = e.touches[0];
      self._onMove(self._getPos(t.clientX, t.clientY));
    };
    h.touchend = function (e) {
      if (e.touches.length > 0) return; // 还有手指在屏幕上
      if (e.changedTouches && e.changedTouches[0]) {
        var t = e.changedTouches[0];
        self._onUp(self._getPos(t.clientX, t.clientY));
      } else {
        self._onUp();
      }
    };

    c.addEventListener('touchstart', h.touchstart, { passive: false });
    c.addEventListener('touchmove', h.touchmove, { passive: false });
    c.addEventListener('touchend', h.touchend);
    c.addEventListener('touchcancel', h.touchend);

    h.resize = function () { self.resize(); };
    window.addEventListener('resize', h.resize);
  };

  PoetSphere.prototype._unbindEvents = function () {
    var c = this.canvas;
    var h = this._handlers;
    if (h.mousedown) c.removeEventListener('mousedown', h.mousedown);
    if (h.mousemove) c.removeEventListener('mousemove', h.mousemove);
    if (h.mouseup) window.removeEventListener('mouseup', h.mouseup);
    if (h.mouseleave) c.removeEventListener('mouseleave', h.mouseleave);
    if (h.touchstart) c.removeEventListener('touchstart', h.touchstart);
    if (h.touchmove) c.removeEventListener('touchmove', h.touchmove);
    if (h.touchend) c.removeEventListener('touchend', h.touchend);
    if (h.touchcancel) c.removeEventListener('touchcancel', h.touchend);
    if (h.resize) window.removeEventListener('resize', h.resize);
    this._handlers = {};
  };

  PoetSphere.prototype._onDown = function (pos) {
    if (!this._interactive) return;
    this._dragging = true;
    this._dragStartX = pos.x;
    this._dragStartY = pos.y;
    this._dragRX = this.rotationX;
    this._dragRY = this.rotationY;
    this._vx = 0;
    this._vy = 0;
    this._dragDist = 0;
    this._clickPos = { x: pos.x, y: pos.y };
  };

  PoetSphere.prototype._onMove = function (pos) {
    if (!this._interactive) return;
    if (this._dragging) {
      var dx = pos.x - this._dragStartX;
      var dy = pos.y - this._dragStartY;
      this._dragDist = Math.sqrt(dx*dx + dy*dy);
      var sens = 0.008;
      this.rotationY = this._dragRY + dx * sens;
      this.rotationX = Math.max(-Math.PI/2, Math.min(Math.PI/2, this._dragRX + dy * sens));
      this._vy = dx * sens * 0.6;
      this._vx = dy * sens * 0.6;
    } else {
      this._updateHover(pos.x, pos.y);
    }
  };

  PoetSphere.prototype._onUp = function (pos) {
    // 关键守卫：弹窗打开时 window 级 mouseup 仍会触发这里，
    // 必须直接返回，避免命中背后节点误切换诗人
    if (!this._interactive) return;
    if (pos && this._dragDist < 6) {
      this._handleClick(pos.x, pos.y);
    }
    this._dragging = false;
    this.hoveredNode = null;
  };

  // ==========================================================
  // Hover / 点击
  // ==========================================================
  PoetSphere.prototype._updateHover = function (mx, my) {
    if (!this._interactive) return;
    var found = null;
    // 从最近到最远检测（sortedNodes末尾=最近）
    var sorted = this._sortedNodes;
    for (var i = sorted.length - 1; i >= 0; i--) {
      var node = sorted[i];
      if (!node) continue;
      var dx = mx - node.sx;
      var dy = my - node.sy;
      var hitR = node.size * 1.2;
      if (dx*dx + dy*dy <= hitR*hitR) {
        found = node;
        break;
      }
    }
    this.hoveredNode = found;
  };

  PoetSphere.prototype._handleClick = function (mx, my) {
    if (!this._interactive || !this._clickCb) return;
    var sorted = this._sortedNodes;
    for (var i = sorted.length - 1; i >= 0; i--) {
      var node = sorted[i];
      if (!node) continue;
      var dx = mx - node.sx;
      var dy = my - node.sy;
      var hitR = node.size * 1.2;
      if (dx*dx + dy*dy <= hitR*hitR) {
        this._clickCb(node.poet);
        return;
      }
    }
  };

  // ==========================================================
  // 更新
  // ==========================================================
  PoetSphere.prototype._update = function () {
    // 自动旋转
    if (!this._dragging) {
      this.rotationY += this.autoRotateSpeed;
      if (Math.abs(this._vx) > 0.0001 || Math.abs(this._vy) > 0.0001) {
        this.rotationY += this._vy;
        this.rotationX += this._vx;
        this.rotationX = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.rotationX));
        this._vx *= this._inertia;
        this._vy *= this._inertia;
      }
    }

    var cx = this.width / 2;
    var cy = this.height / 2;
    var R = this.radius;
    var focal = R * 2;

    for (var i = 0; i < this.nodes.length; i++) {
      var node = this.nodes[i];

      // 旋转
      var ry = rotateY(node.ox, node.oz, this.rotationY);
      var rx = rotateX(node.oy, ry[1], this.rotationX);

      node.x = ry[0];
      node.y = rx[0];
      node.z = rx[1];

      // 透视投影
      var scale = focal / (focal + node.z + R);
      node.scale = scale;
      node.sx = cx + node.x * scale;
      node.sy = cy + node.y * scale;

      // Z 深度: -R(最近) ~ +R(最远)
      var depth = (node.z + R) / (R * 2);
      node.size = (this._isMobile ? 16 : 22) + scale * (this._isMobile ? 22 : 32);
      node.opacity = 0.35 + 0.65 * (1 - depth);
      node.showName = node.z < R * (this._isMobile ? 0.15 : 0.25);
    }

    // Z 排序：远→近
    this._sortedNodes = this.nodes.slice().sort(function (a, b) { return a.z - b.z; });
  };

  // ==========================================================
  // 绘制
  // ==========================================================
  PoetSphere.prototype._draw = function () {
    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    var sorted = this._sortedNodes;
    if (!sorted || sorted.length === 0) return;

    // 0. 球体骨架线（经纬线，让3D球体视觉成型）
    this._drawSphereFrame(ctx);

    // 1. 关联线
    this._drawLines(ctx, sorted);
    // 2. 节点
    for (var i = 0; i < sorted.length; i++) {
      this._drawNode(ctx, sorted[i]);
    }
  };

  /** 绘制球体骨架——3条经线 + 3条纬线，让球体视觉上立起来 */
  PoetSphere.prototype._drawSphereFrame = function (ctx) {
    var R = this.radius;
    var color = parseColor(this.tierColor);
    var cx = this.width / 2;
    var cy = this.height / 2;
    var focal = R * 2;
    var segments = 60;
    var rings = 3; // 纬线层数

    // bind this for drawRing
    var self = this;

    function drawRing(points3d) {
      var projected = [];
      for (var i = 0; i < points3d.length; i++) {
        var ry = rotateY(points3d[i].x, points3d[i].z, self.rotationY);
        var rx = rotateX(points3d[i].y, ry[1], self.rotationX);
        var scale = focal / (focal + rx[1] + R);
        projected.push({
          sx: cx + ry[0] * scale,
          sy: cy + rx[0] * scale,
          z: rx[1]
        });
      }
      // 按 Z 排序分段：将环分为前后两半分别绘制
      var front = [], back = [];
      for (var i = 0; i < projected.length; i++) {
        if (projected[i].z > 0) front.push(projected[i]);
        else back.push(projected[i]);
      }
      // 先画后面（半透明），再画前面
      var drawHalf = function (pts, alpha) {
        if (pts.length < 3) return;
        ctx.beginPath();
        ctx.moveTo(pts[0].sx, pts[0].sy);
        for (var i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].sx, pts[i].sy);
        }
        ctx.strokeStyle = 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + alpha + ')';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      };
      drawHalf(back, 0.15);
      drawHalf(front, 0.35);
    }

    // 纬线（水平环）
    for (var lat = 1; lat <= rings; lat++) {
      var y = R * (lat / (rings + 1) * 2 - 1); // -R ~ +R
      var ringR = Math.sqrt(R * R - y * y);
      var pts = [];
      for (var i = 0; i <= segments; i++) {
        var theta = (i / segments) * Math.PI * 2;
        pts.push({ x: ringR * Math.cos(theta), y: y, z: ringR * Math.sin(theta) });
      }
      drawRing(pts);
    }

    // 经线（垂直环）
    for (var m = 0; m < 3; m++) {
      var angle = (m / 3) * Math.PI;
      var pts = [];
      for (var i = 0; i <= segments; i++) {
        var theta = (i / segments) * Math.PI * 2;
        pts.push({ x: R * Math.cos(theta) * Math.cos(angle), y: R * Math.sin(theta), z: R * Math.cos(theta) * Math.sin(angle) });
      }
      drawRing(pts);
    }
  };

  PoetSphere.prototype._drawLines = function (ctx, sorted) {
    if (!this._relMap) return;
    var color = parseColor(this.tierColor);

    // name→node 映射
    var nameToNode = {};
    for (var i = 0; i < sorted.length; i++) {
      nameToNode[sorted[i].poet.name] = sorted[i];
    }

    var drawn = {};
    // ---- 关系连线（并称/师承等） ----
    for (var i = 0; i < sorted.length; i++) {
      var node = sorted[i];
      var rels = node.poet.relationships;
      if (!rels) continue;

      for (var j = 0; j < rels.length; j++) {
        var target = nameToNode[rels[j].target];
        if (!target) continue;

        var key = [node.poet.name, rels[j].target].sort().join('||');
        if (drawn[key]) continue;
        drawn[key] = true;

        var avgZ = (node.z + target.z) / 2;
        var d = (avgZ + this.radius) / (this.radius * 2);
        var alpha = Math.max(0.1, 0.5 * (1 - d));

        ctx.beginPath();
        ctx.moveTo(node.sx, node.sy);
        ctx.lineTo(target.sx, target.sy);
        ctx.strokeStyle = 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + alpha + ')';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    // ---- 相邻节点连线（形成球面网格，增强立体感） ----
    var edges = this._proximityEdges;
    if (edges) {
      for (var i = 0; i < edges.length; i++) {
        var na = this.nodes[edges[i].a];
        var nb = this.nodes[edges[i].b];
        if (!na || !nb) continue;

        var avgZ = (na.z + nb.z) / 2;
        var d = (avgZ + this.radius) / (this.radius * 2);
        var alpha = Math.max(0.08, 0.25 * (1 - d));

        ctx.beginPath();
        ctx.moveTo(na.sx, na.sy);
        ctx.lineTo(nb.sx, nb.sy);
        ctx.strokeStyle = 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + alpha + ')';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  };

  PoetSphere.prototype._drawNode = function (ctx, node) {
    var sx = node.sx;
    var sy = node.sy;
    var size = node.size;
    var opacity = node.opacity;
    if (size < 3) return;

    var isHover = this.hoveredNode === node;
    var hoverS = isHover ? 1.4 : 1;
    var finalSize = size * hoverS;
    var finalOpa = isHover ? Math.min(1, opacity * 1.2) : opacity;

    // 有名字的节点使用更大的主体（容纳文字）
    var nameScale = node.showName ? 1.6 : 0.75;
    var bodyRadius = finalSize * nameScale;

    // 白色泛光
    var glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, bodyRadius * 2.5);
    glow.addColorStop(0, 'rgba(255,255,255,' + (finalOpa * 0.1) + ')');
    glow.addColorStop(0.3, 'rgba(255,255,255,' + (finalOpa * 0.03) + ')');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(sx, sy, bodyRadius * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // 段位色晕
    var cg = ctx.createRadialGradient(sx, sy, bodyRadius * 0.3, sx, sy, bodyRadius * 1.6);
    cg.addColorStop(0, colorWithAlpha(this.tierColor, finalOpa * 0.3));
    cg.addColorStop(1, colorWithAlpha(this.tierColor, 0));
    ctx.beginPath();
    ctx.arc(sx, sy, bodyRadius * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = cg;
    ctx.fill();

    // 主体圆形（半透明底色，让名字更清晰）
    ctx.beginPath();
    ctx.arc(sx, sy, bodyRadius, 0, Math.PI * 2);
    ctx.fillStyle = colorWithAlpha(this.tierColor, Math.min(0.85, finalOpa * 0.85));
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx, sy, bodyRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,' + (finalOpa * 0.3) + ')';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 高光（左上角小亮点）
    ctx.beginPath();
    ctx.arc(sx - bodyRadius * 0.2, sy - bodyRadius * 0.2, bodyRadius * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,' + (finalOpa * 0.35) + ')';
    ctx.fill();

    // ===== 姓名（放在球体节点中心） =====
    if (node.showName) {
      var nameFontSize = Math.max(12, Math.min(16, bodyRadius * 0.42));
      ctx.font = 'bold ' + nameFontSize + 'px ' + this.fontFamily;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 深色阴影让文字清晰
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(node.poet.name, sx, sy);
      ctx.shadowBlur = 0;

      // 再描一层细边增强可读性
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.strokeText(node.poet.name, sx, sy);
    }

    // Hover 时额外显示朝代
    if (isHover && node.poet.basicInfo) {
      var dynasty = node.poet.basicInfo.dynasty || '';
      if (dynasty) {
        var infoSize = Math.max(10, 12);
        ctx.font = infoSize + 'px ' + this.fontFamily;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 4;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(dynasty, sx, sy + bodyRadius + 6);
        ctx.shadowBlur = 0;
      }
    }
  };

  // ==========================================================
  // 动画循环
  // ==========================================================
  PoetSphere.prototype._tick = function () {
    if (!this._running) return;
    try {
      this._update();
      this._draw();
    } catch (e) {
      console.error('球体渲染错误:', e);
    }
    var self = this;
    this._animId = requestAnimationFrame(function () { self._tick(); });
  };

  // 导出全局
  window.PoetSphere = PoetSphere;

})();
