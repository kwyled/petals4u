(function () {
  var $ = function (s) { return document.querySelector(s); };
  var cv = $('#c'), ctx = cv.getContext('2d');
  var g1 = $('#glow1').getContext('2d'), g2 = $('#glow2').getContext('2d');
  var buf = document.createElement('canvas'), bx = buf.getContext('2d');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var RAMP = '.:-=+xo0#%@';
  var OY = 0.86, CAMD = 4;
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shades(h, s, l) {
    var out = [];
    for (var k = 0; k < 10; k++) out.push('hsl(' + h + ' ' + s + '% ' + clamp(l - 14 + k * 3.8, 10, 94) + '%)');
    return out;
  }
  function hash(i, j) { return (((i * 73856093) ^ (j * 19349663)) >>> 0) % 1000 / 1000; }

  /* The flower kinds: how many, how big, which colours. */
  var KINDS = {
    rose:  { count: 16, size: [0.085, 0.12], hues: [[140,62,50],[150,56,60],[128,52,42],[160,48,72],[100,52,54]], center: [140,60,50] },
    lav:   { count: 10, size: [0.075, 0.1], hues: [[266,72,70],[250,78,72],[285,65,72]], center: [266,72,70] },
    sun:   { count: 4, size: [0.11, 0.14], hues: [[46,100,58],[40,100,55]], center: [24,70,40] },
    tulip: { count: 6, size: [0.08, 0.1],  hues: [[350,88,60],[310,70,66],[24,96,60],[48,96,62],[0,0,94]], center: [350,80,50] },
    daisy: { count: 6, size: [0.06, 0.09], hues: [[0,0,95],[335,70,82]], center: [46,100,60] }
  };
  var STEM = [128, 45, 38];

  var W = 0, H = 0, U = 300, dpr = 1, fs = 12, cw = 7, ch = 13, cols = 0, rows = 0;
  var G = [], C = [], flowers = [], flies = [];
  var seed = 20261122;
  var t0 = performance.now() - (reduce ? 12000 : 0);
  var yawOff = 0, drag = null;
  var state = {
    paused: false,
    pausedAt: 0,
    motion: reduce,
    rotation: 1,
    size: 1,
    density: 1,
    glow: 1,
    night: true,
    fireflies: true,
    enabledKinds: { rose: true, lav: true, sun: true, tulip: true, daisy: true },
    flowerCounts: { rose: 16, lav: 10, sun: 4, tulip: 6, daisy: 6 },
    customColors: {},
    theme: 'valentine'
  };
  var themes = {
    valentine: { bg: '#09030c', stem: [128,45,38], rose: [[350,88,60],[330,72,65]], lav: [[266,72,70],[250,78,72]], sun: [[46,100,58]], tulip: [[350,88,60],[310,70,66]], daisy: [[0,0,95],[335,70,82]] },
    anniversary: { bg: '#08070f', stem: [142,34,38], rose: [[0,76,58],[342,72,68]], lav: [[260,50,68]], sun: [[42,88,62]], tulip: [[12,82,68],[330,58,68]], daisy: [[42,30,92],[350,55,75]] },
    birthday: { bg: '#08040d', stem: [128,45,38], rose: [[350,88,64],[300,78,68]], lav: [[195,85,68],[272,78,72]], sun: [[48,100,58],[25,96,62]], tulip: [[18,96,62],[320,82,70],[200,78,68]], daisy: [[0,0,96],[48,100,62]] },
    spring: { bg: '#05090a', stem: [128,50,34], rose: [[350,55,72],[320,48,72]], lav: [[270,55,72]], sun: [[48,100,58]], tulip: [[15,82,62],[350,75,70],[125,48,62]], daisy: [[0,0,96],[48,90,60]] },
    memorial: { bg: '#07070a', stem: [128,28,28], rose: [[0,0,88],[330,18,74]], lav: [[260,22,76]], sun: [[48,48,62]], tulip: [[0,0,92],[280,20,72]], daisy: [[0,0,94],[220,18,76]] },
    winter: { bg: '#050711', stem: [145,30,42], rose: [[205,58,72],[220,55,82]], lav: [[255,48,78]], sun: [[48,48,74]], tulip: [[195,60,78],[280,38,82],[0,0,94]], daisy: [[195,35,94],[210,55,82]] }
  };

  function makeFlower(r, kind, wx, wy, wz, ts) {
    var K = KINDS[kind], h = K.hues[Math.floor(r() * K.hues.length)];
    var len = Math.hypot(wx, wy, wz) || 1;
    var nx = wx / len, ny = wy / len + 0.4, nz = wz / len, nl = Math.hypot(nx, ny, nz);
    return {
      kind: kind, wx: wx, wy: wy, wz: wz, ts: ts, R: lerp(K.size[0], K.size[1], r()),
      nx: nx / nl, ny: ny / nl, nz: nz / nl,
      n: 5 + Math.floor(r() * 4) * 2,
      rot: r() * 6.28, ph: r() * 6.28,
      bx: (r() - 0.5) * 0.3, bz: (r() - 0.5) * 0.3,
      cols: shades(h[0], h[1], h[2]), ccols: shades(K.center[0], K.center[1], K.center[2])
    };
  }

  function applyTheme(name) {
    var theme = themes[name] || themes.valentine;
    state.theme = name;
    STEM = theme.stem;
    KINDS.rose.hues = state.customColors.rose || theme.rose;
    KINDS.lav.hues = state.customColors.lav || theme.lav;
    KINDS.sun.hues = state.customColors.sun || theme.sun;
    KINDS.tulip.hues = state.customColors.tulip || theme.tulip;
    KINDS.daisy.hues = state.customColors.daisy || theme.daisy;
    document.documentElement.style.setProperty('--bg', state.night ? theme.bg : '#d9edf2');
    document.documentElement.style.setProperty('--fg', state.night ? '#f1e9ff' : '#17202a');
  }

  function colorHues(hex) {
    var match = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!match) return [];
    var value = match[1];
    var r = parseInt(value.slice(0, 2), 16) / 255;
    var g = parseInt(value.slice(2, 4), 16) / 255;
    var b = parseInt(value.slice(4, 6), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return [[h, s * 100, l * 100], [h, s * 100, clamp(l * 100 + 10, 10, 90)]];
  }

  function gen() {
    var r = rng(seed), kinds = [], k;
    Object.keys(KINDS).forEach(function (key) {
      if (!state.enabledKinds[key]) return;
      var count = Math.round(state.flowerCounts[key] * state.density);
      for (var q = 0; q < count; q++) kinds.push(key);
    });
    for (k = kinds.length - 1; k > 0; k--) { var m = Math.floor(r() * (k + 1)), tmp = kinds[k]; kinds[k] = kinds[m]; kinds[m] = tmp; }
    var n = kinds.length;
    flowers = [];
    for (k = 0; k < n; k++) {
      var phi = k * 2.39996 + r() * 0.3;
      var th = 1.25 * Math.sqrt((k + 0.5) / n);
      var L = r() < 0.2 ? lerp(0.6, 0.8, r()) : lerp(0.82, 1, r());
      flowers.push(makeFlower(r, kinds[k], L * Math.sin(th) * Math.cos(phi), L * Math.cos(th), L * Math.sin(th) * Math.sin(phi), 0.1 + r() * 2.6));
    }
    flies = [];
    if (state.fireflies) {
      for (var q2 = 0; q2 < 46; q2++) flies.push({ fx: r(), y0: r(), sp: lerp(0.008, 0.02, r()), ph: r() * 6.28, c: '.+*·'.charAt(Math.floor(r() * 4)) });
    }
  }

  function sizeCanvas(c, x) {
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resize() {
    var m = $('main'), w = m.clientWidth, h = m.clientHeight;
    if (!w || !h) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = w; H = h;
    U = Math.min(H * (W < 560 ? 0.62 : 0.72), W * (W < 560 ? 1.35 : 0.6));
    OY = W < 560 ? 0.8 : 0.86;
    sizeCanvas(cv, ctx); sizeCanvas($('#glow1'), g1); sizeCanvas($('#glow2'), g2); sizeCanvas(buf, bx);
    fs = clamp(W / (W < 560 ? 60 : 105) / 0.6, 8, 15);
    bx.font = fs + 'px ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';
    cw = bx.measureText('M').width || fs * 0.6;
    ch = fs * 1.1;
    cols = Math.ceil(W / cw); rows = Math.ceil(H / ch);
    G = new Array(cols * rows); C = new Array(cols * rows);
    gen();
  }

  function put(i, j, c, col) {
    if (i < 0 || j < 0 || i >= cols || j >= rows) return;
    var k = j * cols + i; G[k] = c; C[k] = col;
  }
  function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
  function easeOutBack(x) { return 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2); }

  /* world: x right, y up, z toward the viewer at yaw 0. The bouquet base is the origin. */
  function rot(x, y, z, yaw, pitch) {
    var c = Math.cos(yaw), s = Math.sin(yaw);
    var x1 = x * c + z * s, z1 = -x * s + z * c;
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
  }
  function proj(x, y, z, yaw, pitch) {
    var q = rot(x, y, z, yaw, pitch), k = CAMD / (CAMD - q[2]);
    var screenX = q[0] * U * k;
    if (W < 560) screenX = Math.tanh(screenX * 0.75 / (W * 0.37)) * W * 0.37;
    return { x: W / 2 + screenX, y: H * OY - q[1] * U * k, z: q[2], k: k };
  }

  function tipWorld(f, nm) {
    var s = nm / 1000;
    return {
      x: f.wx + Math.sin(s * 0.8 + f.ph) * 0.025,
      y: f.wy + Math.sin(s * 0.6 + f.ph * 2) * 0.015,
      z: f.wz + Math.cos(s * 0.7 + f.ph) * 0.025
    };
  }

  /* The separated strands keep each stem visible below its flower head. */
  function drawStem(f, tw, tip, t, yaw, pitch, df, off) {
    var g = easeOutCubic(clamp((t - f.ts) / 1.8, 0, 1));
    if (g <= 0) return;
    var L = Math.hypot(tw.x, tw.y, tw.z) || 1;
    var ox = (-tw.z / L) * off, oz = (tw.x / L) * off;
    var ex = tw.x + ox, ez = tw.z + oz;
    var c1x = ex / 2 + f.bx * L, c1y = tw.y / 2, c1z = ez / 2 + f.bz * L;
    var approx = Math.hypot(tip.x - W / 2, tip.y - H * OY) * 1.2;
    var steps = Math.max(10, Math.ceil(approx / (cw * 0.55) * g));
    var px = W / 2, py = H * OY, dim = 0.75 + 0.25 * df;
    for (var k = 1; k <= steps; k++) {
      var u = g * k / steps, v = 1 - u;
      var p = proj(2 * v * u * c1x + u * u * ex, 2 * v * u * c1y + u * u * tw.y, 2 * v * u * c1z + u * u * ez, yaw, pitch);
      var dx = p.x - px, dy = p.y - py;
      var ang = Math.atan2(dx, -dy), i = Math.floor(p.x / cw), j = Math.floor(p.y / ch);
      var hh = hash(i, j), c;
      if (Math.abs(ang) < 0.38 || Math.abs(ang) >= 1.95) c = hh < 0.2 ? '!' : '|';
      else if (Math.abs(ang) > 1.2) c = '-';
      else c = ang > 0 ? '/' : '\\';
      if (hh > 0.88) c = ':';
      put(i, j, c, 'hsl(' + STEM[0] + ' ' + STEM[1] + '% ' + ((STEM[2] + hh * 24) * dim) + '%)');
      px = p.x; py = p.y;
    }
  }

  function drawFlower(f, tip, t, nm, yaw, df, nrm) {
    var b = clamp((t - f.ts - 1.2) / 1.8, 0, 1);
    if (b <= 0) return;
    var breathe = 1 + 0.035 * Math.sin(nm / 1000 * 1.4 + f.ph);
    var R = f.R * U * state.size * tip.k * easeOutBack(b) * breathe;
    var dim = 0.6 + 0.4 * df, kind = f.kind;
    if (R < cw * 0.6) { put(Math.floor(tip.x / cw), Math.floor(tip.y / ch), '*', f.cols[7]); return; }
    /* Round flowers are discs that face outward from the bouquet, so they squash as the bouquet turns. */
    var psi = Math.atan2(-nrm[1], nrm[0]), cp = Math.cos(psi), sp = Math.sin(psi);
    var sq = clamp(Math.abs(nrm[2]), 0.3, 1);
    var spin = nm / 1000 * 0.12 + yaw * 0.7;
    var flowerXScale = W < 560 ? 0.56 : 1;
    var ext = R * 1.6 * flowerXScale;
    var i0 = Math.floor((tip.x - ext) / cw), i1 = Math.ceil((tip.x + ext) / cw);
    var j0 = Math.floor((tip.y - ext) / ch), j1 = Math.ceil((tip.y + ext) / ch);
    for (var j = j0; j <= j1; j++) {
      for (var i = i0; i <= i1; i++) {
        var dx = ((i + 0.5) * cw - tip.x) / flowerXScale, dy = (j + 0.5) * ch - tip.y;
        var inten, c, col, hh = hash(i, j);
        if (kind === 'tulip') {
          var x = dx / (R * 0.85), y = dy / (R * 1.1);
          var e1 = Math.pow(x / 0.5, 2) + Math.pow((y - 0.05) / 0.85, 2);
          var e2 = Math.pow((x - 0.48) / 0.4, 2) + Math.pow((y + 0.05) / 0.72, 2);
          var e3 = Math.pow((x + 0.48) / 0.4, 2) + Math.pow((y + 0.05) / 0.72, 2);
          if ((e1 >= 1 && e2 >= 1 && e3 >= 1) || y > 0.82) continue;
          inten = clamp(0.35 + 0.45 * (1 - (y + 1) / 2) + (hh - 0.5) * 0.2 + (Math.abs(x) < 0.07 ? -0.25 : 0), 0, 1) * dim;
          c = Math.abs(x) < 0.07 ? '|' : RAMP.charAt(Math.floor(inten * (RAMP.length - 1)));
          col = f.cols[Math.floor(inten * 9)];
        } else if (kind === 'lav') {
          var yy = dy / (R * 1.6), w = 0.12 + 0.2 * (yy + 1) / 2;
          if (yy < -1 || yy > 1 || Math.abs(dx) / R > w * 1.1 || hh < 0.22) continue;
          inten = clamp(0.35 + hh * 0.65, 0, 1) * dim;
          c = 'o0&x'.charAt(Math.floor(hash(j, i) * 4));
          col = f.cols[Math.floor(inten * 9)];
        } else {
          var a = (dx * cp + dy * sp) / sq, bb = -dx * sp + dy * cp;
          var r = Math.hypot(a, bb);
          if (r > R * 1.3) continue;
          var th = Math.atan2(bb, a) + f.rot + spin;
          if (kind === 'rose') {
            var rb = R * (0.86 + 0.14 * Math.sin(f.n * th + f.ph));
            if (r > rb) continue;
            var u = r / rb;
            inten = clamp(0.5 + 0.5 * Math.sin(u * 8 + th * 1.5 + f.ph) * (1 - u * 0.35) + (hh - 0.5) * 0.25, 0, 1) * dim;
            c = RAMP.charAt(Math.floor(inten * (RAMP.length - 1)));
            col = f.cols[Math.floor(inten * 9)];
          } else if (kind === 'sun') {
            var lobe = Math.abs(Math.cos(7 * th));
            var rs = R * (0.8 + 0.2 * Math.pow(lobe, 1.5));
            if (r > rs) continue;
            if (r < R * 0.5) {
              inten = clamp(0.35 + 0.5 * Math.sin(r / R * 20) * 0.5 + hh * 0.3, 0, 1) * dim;
              c = ((i + j) % 2) ? '0' : '@';
              col = f.ccols[Math.floor(inten * 9)];
            } else {
              inten = clamp(0.3 + 0.7 * (r / rs) * (0.6 + 0.4 * lobe) + (hh - 0.5) * 0.15, 0, 1) * dim;
              c = RAMP.charAt(Math.floor(inten * (RAMP.length - 1)));
              col = f.cols[Math.floor(inten * 9)];
            }
          } else {
            var lb = Math.abs(Math.cos(f.n * th / 2));
            var rd = R * (0.62 + 0.38 * Math.pow(lb, 0.7));
            if (r > rd) continue;
            var uu = r / rd;
            if (uu < 0.26) {
              inten = clamp(0.4 + hh * 0.6, 0, 1) * dim;
              c = '@%O0'.charAt(Math.floor(hash(j, i) * 4));
              col = f.ccols[Math.floor(inten * 9)];
            } else {
              inten = clamp(0.25 + 0.75 * uu * (0.6 + 0.4 * lb) + (hh - 0.5) * 0.15, 0, 1) * dim;
              c = RAMP.charAt(Math.floor(inten * (RAMP.length - 1)));
              col = f.cols[Math.floor(inten * 9)];
            }
          }
        }
        put(i, j, c === '.' && hash(j, i) < 0.5 ? ':' : c, col);
      }
    }
  }

  function frame(now) {
    if (W && H) {
      var motionNow = state.motion ? 12000 : (state.paused ? state.pausedAt : now);
      var nm = motionNow, t = ((state.paused ? state.pausedAt : now) - t0) / 1000, a;
      var yaw = (state.motion ? 0.5 : nm / 1000 * 0.35 * state.rotation) + yawOff;
      var pitch = 0.3 + (state.motion ? 0 : 0.06 * Math.sin(nm / 1000 * 0.45));
      for (var k = 0; k < G.length; k++) G[k] = null;

      for (var s = 0; s < flies.length; s++) {
        var f = flies[s];
        var yy = (((f.y0 - nm / 1000 * f.sp) % 1) + 1) % 1;
        var xx = f.fx + Math.sin(nm / 1000 * 0.5 + f.ph) * 0.02;
        var tw = reduce ? 0.7 : 0.5 + 0.5 * Math.sin(nm * 0.003 + f.ph);
        put(Math.floor(xx * cols), Math.floor(yy * rows), f.c, 'hsl(48 100% ' + (40 + 40 * tw) + '%)');
      }

      var items = [];
      for (a = 0; a < flowers.length; a++) {
        var fl = flowers[a], w = tipWorld(fl, nm);
        items.push({ f: fl, w: w, p: proj(w.x, w.y, w.z, yaw, pitch), nrm: rot(fl.nx, fl.ny, fl.nz, yaw, pitch) });
      }
      items.sort(function (m, n) { return m.p.z - n.p.z; });
      for (a = 0; a < items.length; a++) {
        var it = items[a], df = clamp((it.p.z + 1.1) / 2.2, 0, 1);
        for (var o = -1; o <= 1; o++) drawStem(it.f, it.w, it.p, t, yaw, pitch, df, o * (W < 560 ? 0.07 : 0.05));
        drawFlower(it.f, it.p, t, nm, yaw, df, it.nrm);
      }

      bx.clearRect(0, 0, W, H);
      bx.textAlign = 'center'; bx.textBaseline = 'middle';
      var last = '';
      for (var n = 0; n < G.length; n++) {
        if (!G[n]) continue;
        if (C[n] !== last) { bx.fillStyle = C[n]; last = C[n]; }
        bx.fillText(G[n], (n % cols + 0.5) * cw, (Math.floor(n / cols) + 0.5) * ch);
      }
      [ctx, g1, g2].forEach(function (x) { x.clearRect(0, 0, W, H); x.drawImage(buf, 0, 0, W, H); });
    }
    requestAnimationFrame(frame);
  }

  cv.addEventListener('pointerdown', function (e) {
    drag = { x: e.clientX, moved: 0 };
    cv.classList.add('drag');
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x;
    drag.x = e.clientX; drag.moved += Math.abs(dx);
    yawOff += dx * 0.01;
  });
  function end() {
    if (drag && drag.moved < 5) t0 = performance.now() - (reduce ? 12000 : 0);
    drag = null; cv.classList.remove('drag');
  }
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);

  var panel = $('#controlPanel'), toastTimer;
  function toast(message) {
    var el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }
  function openPanel(open) {
    panel.classList.toggle('open', open);
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    $('#settingsToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  $('#settingsToggle').addEventListener('click', function () { openPanel(!panel.classList.contains('open')); });
  $('#closePanel').addEventListener('click', function () { openPanel(false); });

  document.querySelectorAll('.theme-button').forEach(function (button) {
    button.addEventListener('click', function () {
      document.querySelectorAll('.theme-button').forEach(function (item) { item.classList.remove('active'); });
      button.classList.add('active');
      applyTheme(button.dataset.theme);
      gen();
    });
  });
  document.querySelectorAll('[data-kind]').forEach(function (input) {
    input.addEventListener('change', function () {
      if (input.checked && state.flowerCounts[input.dataset.kind] === 0) {
        state.flowerCounts[input.dataset.kind] = 1;
        $('[data-flower-count="' + input.dataset.kind + '"]').value = '1';
      }
      state.enabledKinds[input.dataset.kind] = input.checked;
      gen();
    });
  });
  document.querySelectorAll('[data-flower-count]').forEach(function (input) {
    input.addEventListener('change', function () {
      var kind = input.dataset.flowerCount;
      var count = clamp(Math.round(Number(input.value) || 0), 0, 40);
      input.value = String(count);
      state.flowerCounts[kind] = count;
      var checkbox = $('[data-kind="' + kind + '"]');
      checkbox.checked = count > 0;
      state.enabledKinds[kind] = count > 0;
      gen();
    });
  });
  document.querySelectorAll('[data-flower-color]').forEach(function (input) {
    input.addEventListener('input', function () {
      var kind = input.dataset.flowerColor;
      state.customColors[kind] = colorHues(input.value);
      applyTheme(state.theme);
      gen();
    });
  });
  $('#sizeRange').addEventListener('input', function (e) {
    state.size = Number(e.target.value) / 100;
  });
  $('#densityRange').addEventListener('input', function (e) {
    state.density = Number(e.target.value) / 100;
    gen();
  });
  $('#glowRange').addEventListener('input', function (e) {
    state.glow = Number(e.target.value) / 100;
    $('#glow1').style.opacity = String(0.35 + state.glow * 0.55);
    $('#glow2').style.opacity = String(0.25 + state.glow * 0.5);
  });
  $('#rotationRange').addEventListener('input', function (e) {
    state.rotation = Number(e.target.value) / 100;
  });
  $('#pauseButton').addEventListener('click', function (e) {
    if (state.paused) {
      t0 += performance.now() - state.pausedAt;
      state.paused = false;
      e.target.textContent = 'Pause';
    } else {
      state.paused = true;
      state.pausedAt = performance.now();
      e.target.textContent = 'Play';
    }
  });
  $('#dayNightButton').addEventListener('click', function (e) {
    state.night = !state.night;
    e.target.textContent = state.night ? 'Night' : 'Day';
    applyTheme(state.theme);
  });
  $('#motionButton').addEventListener('click', function (e) {
    state.motion = !state.motion;
    e.target.textContent = state.motion ? 'Full motion' : 'Reduce motion';
  });
  $('#motionButton').textContent = state.motion ? 'Full motion' : 'Reduce motion';

  function compositeCanvas() {
    var out = document.createElement('canvas');
    out.width = cv.width; out.height = cv.height;
    var context = out.getContext('2d');
    context.fillStyle = state.night ? themes[state.theme].bg : '#d9edf2';
    context.fillRect(0, 0, out.width, out.height);
    context.drawImage(cv, 0, 0);
    return out;
  }
  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  $('#pngButton').addEventListener('click', function () {
    compositeCanvas().toBlob(function (blob) { downloadBlob(blob, 'petals4u.png'); toast('PNG downloaded'); }, 'image/png');
  });
  $('#gifButton').addEventListener('click', function () {
    if (typeof GIF === 'undefined') { toast('GIF exporter could not load'); return; }
    var gif = new GIF({ workers: 2, quality: 10, width: W, height: H, workerScript: 'vendor/gif.worker.js' });
    var frameCount = 12, frameIndex = 0;
    gif.on('finished', function (blob) { downloadBlob(blob, 'petals4u.gif'); toast('Animated GIF downloaded'); });
    toast('Rendering animated GIF...');
    var captureFrame = function () {
      gif.addFrame(compositeCanvas(), { copy: true, delay: 120 });
      frameIndex++;
      if (frameIndex < frameCount) setTimeout(captureFrame, 120);
      else gif.render();
    };
    captureFrame();
  });
  var params = new URLSearchParams(location.search);
  if (params.has('theme') && themes[params.get('theme')]) {
    var themeName = params.get('theme');
    document.querySelectorAll('.theme-button').forEach(function (button) { button.classList.toggle('active', button.dataset.theme === themeName); });
    applyTheme(themeName);
  } else {
    applyTheme('valentine');
  }

  new ResizeObserver(resize).observe($('main'));
  resize();
  requestAnimationFrame(frame);
})();