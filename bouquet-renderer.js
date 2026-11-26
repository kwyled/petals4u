const FPS = 24;
const SPIN_SPEED = 0.6;
const TILT = 0.30;
const CAM_DIST = 4.0;
const NUM_HEARTS = 18;

const WHITE = [244, 248, 251, 254, 255, 231];
const PINK = [125, 162, 168, 205, 211, 218, 225];
const RED = [52, 88, 124, 160, 196, 203];
const PURPLE = [54, 91, 97, 134, 140, 183];
const YELLOW = [136, 178, 214, 220, 226, 229];
const ORANGE = [130, 166, 202, 208, 214, 216];
const GOLD_CENTER = [94, 136, 178, 214, 220];
const DARK_CENTER = [52, 58, 94, 130, 136];
const GREENS = [22, 28, 28, 34, 35, 71, 77, 114];
const PAPER = [246, 249, 251, 253, 255, 231];
const RIBBON = [54, 91, 97, 134, 140, 183];
const HEART_COLORS = [161, 197, 204, 205, 211, 218];
const SHADE = ".:-=+*%@";
const PETAL_SHADE = "+*#%";
const RESET = "\x1b[0m";
const PIVOT_Y = 0.2;

const L0 = [-0.45, 0.6, 0.66];
const Ln = Math.hypot(...L0);
const [LX, LY, LZ] = L0.map((v) => v / Ln);

const DISC_TYPES = [
  [WHITE, GOLD_CENTER, 13],
  [PINK, GOLD_CENTER, 8],
  [RED, DARK_CENTER, 6],
  [PURPLE, GOLD_CENTER, 7],
  [YELLOW, DARK_CENTER, 12],
  [ORANGE, DARK_CENTER, 9],
];
let TULIP_COLORS = [PINK, PINK, PINK];
let FLOWER_PALETTES = {
  rose: PINK,
  lavender: PURPLE,
  sunflower: YELLOW,
  daisy: WHITE,
};

function xtermRgb(code) {
  const basic = [
    [0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0],
    [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192],
    [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0],
    [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255],
  ];
  if (code < 16) return basic[code];
  if (code < 232) {
    const levels = [0, 95, 135, 175, 215, 255];
    const index = code - 16;
    return [levels[Math.floor(index / 36)], levels[Math.floor(index / 6) % 6], levels[index % 6]];
  }
  const gray = 8 + (code - 232) * 10;
  return [gray, gray, gray];
}

function colorPalette(hex, factors) {
  const rgb = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const palette = [];
  for (const factor of factors) {
    const shade = rgb.map((value) => Math.max(0, Math.min(255, Math.round(value * factor))));
    let best = 16;
    let distance = Infinity;
    for (let code = 16; code < 256; code++) {
      const candidate = xtermRgb(code);
      const score = candidate.reduce((sum, value, index) => sum + (value - shade[index]) ** 2, 0);
      if (score < distance) {
        best = code;
        distance = score;
      }
    }
    if (!palette.includes(best)) palette.push(best);
  }
  return palette;
}

function setFlowerColors(colors) {
  const rosePalette = colorPalette(colors.rose, [0.65, 0.82, 1, 1.15, 1.25]);
  PINK.splice(0, PINK.length, ...rosePalette);
  RED.splice(0, RED.length, ...colorPalette(colors.rose, [0.4, 0.6, 0.8, 1, 1.1]));
  FLOWER_PALETTES = {
    rose: PINK,
    lavender: colorPalette(colors.lavender, [0.55, 0.72, 0.88, 1, 1.12, 1.25]),
    sunflower: colorPalette(colors.sunflower, [0.55, 0.72, 0.88, 1, 1.12, 1.25]),
    daisy: colorPalette(colors.daisy, [0.72, 0.88, 1, 1.08, 1.16]),
  };
  const tulipPalette = colorPalette(colors.tulip, [0.55, 0.72, 0.88, 1, 1.12, 1.25]);
  TULIP_COLORS = [tulipPalette, tulipPalette, tulipPalette];
}

// Small seeded PRNG (mulberry32) so the bouquet looks the same every run.
function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.uniform = (lo, hi) => lo + (hi - lo) * next();
  return next;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const uniform = (lo, hi) => lo + (hi - lo) * Math.random();
const clamp01 = (b) => Math.min(0.999, Math.max(0.0, b));

function norm(v) {
  const m = Math.hypot(v[0], v[1], v[2]) || 1.0;
  return [v[0] / m, v[1] / m, v[2] / m];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function add(p, d, k) {
  return [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k];
}

function buildScene(counts = { rose: 8, lavender: 2, sunflower: 2, tulip: 2, daisy: 2 }) {
  const rnd = makeRng(21);
  const pts = []; // [x, y, z, nx, ny, nz, palette, tone, twoSided, override]
  const neck = [0.0, -0.12, 0.0];

  const C = [0.0, 0.12, 0.0];
  const D = 0.64;
  const kinds = Object.keys(FLOWER_PALETTES).concat("tulip");
  const flowerCounts = Object.fromEntries(kinds.map((kind) =>
    [kind, Math.max(0, Math.round(counts[kind] || 0))]));
  const N = Object.values(flowerCounts).reduce((total, count) => total + count, 0);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const heads = [];
  for (let i = 0; i < N; i++) {
    const el = ((88 - 60 * Math.sqrt(i / Math.max(1, N - 1))) * Math.PI) / 180;
    const az = i * golden;
    const d = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
    const pos = add(C, d, D * rnd.uniform(0.92, 1.05));
    heads.push([pos, norm(d)]);
  }

  const headTypes = new Array(N);
  if (N === 10 && flowerCounts.rose === 8 && flowerCounts.tulip === 2) {
    for (let i = 0; i < N; i++) headTypes[i] = i === 3 || i === 8 ? "tulip" : "rose";
  } else {
    for (const kind of kinds) {
      const count = flowerCounts[kind];
      for (let index = 0; index < count; index++) {
        const preferred = Math.min(N - 1, Math.floor((index + 0.5) * N / count));
        let slot = preferred;
        while (headTypes[slot] !== undefined) slot = (slot + 1) % N;
        headTypes[slot] = kind;
      }
    }
  }

  const flowers = []; // [pos, kind, palette, centerPalette, nPetals, radius, seed]
  heads.forEach(([pos, axis], idx) => {
    const base = add(pos, axis, -0.03);
    for (let j = 0; j < 70; j++) {
      const t = j / 69;
      pts.push([
        base[0] + (neck[0] - base[0]) * t,
        base[1] + (neck[1] - base[1]) * t,
        base[2] + (neck[2] - base[2]) * t,
        axis[0], 0.0, axis[2], GREENS, -0.15, true, null,
      ]);
    }

    const kind = headTypes[idx];
    if (kind === "tulip") {
      flowers.push([pos, kind, TULIP_COLORS[idx % TULIP_COLORS.length], null, 0,
        0.11, rnd.uniform(0, 6.28)]);
    } else {
      const spec = {
        rose: [FLOWER_PALETTES.rose, DARK_CENTER, 8, 0.13],
        lavender: [FLOWER_PALETTES.lavender, GOLD_CENTER, 6, 0.09],
        sunflower: [FLOWER_PALETTES.sunflower, DARK_CENTER, 12, 0.16],
        daisy: [FLOWER_PALETTES.daisy, GOLD_CENTER, 13, 0.12],
      }[kind];
      flowers.push([pos, kind, spec[0], spec[1], spec[2],
        spec[3], rnd.uniform(0, 6.28)]);
    }
  });

  // Leaves
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.4) / 8) * 2 * Math.PI;
    const c = Math.cos(a), s = Math.sin(a);
    const base = [0.26 * c, 0.30, 0.26 * s];
    const d = norm([c, 0.15, s]);
    const side = [-s, 0.0, c];
    const n = norm(cross(side, d));
    const Ll = 0.30, W = 0.07;
    for (let ti = 0; ti < 32; ti++) {
      const t = ti / 31;
      for (let wi = -5; wi <= 5; wi++) {
        const w = wi / 5;
        const curl = 0.025 * w * w;
        const sw = W * Math.sin(Math.PI * t) * w;
        const rib = wi === 0 ? -0.25 : 0.0;
        pts.push([
          base[0] + d[0] * Ll * t + side[0] * sw + n[0] * curl,
          base[1] + d[1] * Ll * t - 0.10 * t * t + n[1] * curl,
          base[2] + d[2] * Ll * t + side[2] * sw + n[2] * curl,
          n[0], n[1], n[2], GREENS, rib, true, null,
        ]);
      }
    }
  }

  // Paper wrap (cone)
  const y0 = -0.20, y1 = 0.30, r0 = 0.06, r1 = 0.36;
  const k = (r1 - r0) / (y1 - y0);
  const rings = 50;
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const r = r0 + (r1 - r0) * t;
    const count = Math.max(8, Math.trunc(170 * r));
    for (let j = 0; j < count; j++) {
      const ph = ((j + rnd()) / count) * 2 * Math.PI;
      const c = Math.cos(ph), s = Math.sin(ph);
      let y = y0 + (y1 - y0) * t;
      if (t > 0.9) y += 0.03 * Math.sin(9 * ph);
      const fold = 0.3 * (Math.abs(Math.sin(5 * ph)) - 0.6);
      const nn = norm([c, -k, s]);
      pts.push([r * c, y, r * s, nn[0], nn[1], nn[2], PAPER, fold, false, null]);
    }
  }

  // Stems poking out the bottom
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * 2 * Math.PI;
    const sx = 0.025 * Math.cos(a), sz = 0.025 * Math.sin(a);
    for (let j = 0; j < 48; j++) {
      const t = j / 47;
      pts.push([
        sx * (1 + 1.2 * t), -0.20 - 0.38 * t, sz * (1 + 1.2 * t),
        Math.cos(a), 0.0, Math.sin(a), GREENS, -0.1, true, null,
      ]);
    }
  }

  // Ribbon band
  const by = -0.12;
  const br = r0 + k * (by - y0) + 0.01;
  for (let j = 0; j < 90; j++) {
    const ph = (j / 90) * 2 * Math.PI;
    for (const dy of [-0.012, 0.0, 0.012]) {
      pts.push([br * Math.cos(ph), by + dy, br * Math.sin(ph),
        Math.cos(ph), 0.0, Math.sin(ph), RIBBON, 0.0, false, null]);
    }
  }

  // Bow
  const knot = [0.0, by, br + 0.01];
  for (const side of [-1, 1]) {
    for (let j = 0; j < 70; j++) {
      const a = (j / 70) * 2 * Math.PI;
      const lx = side * (0.07 + 0.07 * Math.cos(a));
      const ly = 0.04 * Math.sin(a) + (0.02 * (0.07 + 0.07 * Math.cos(a))) / 0.14;
      for (const fill of [1.0, 0.7]) {
        pts.push([knot[0] + lx * fill, knot[1] + ly * fill, knot[2] + 0.01,
          side * 0.3, 0.2, 0.93, RIBBON, 0.1, true, null]);
      }
    }
    for (let j = 0; j < 30; j++) {
      const t = j / 29;
      pts.push([knot[0] + side * 0.06 * t, knot[1] - 0.15 * t, knot[2] + 0.015,
        side * 0.2, 0.0, 0.98, RIBBON, -0.05 + 0.05 * Math.sin(t * 9), true, null]);
    }
  }
  for (const dx of [-0.01, 0.0, 0.01]) {
    pts.push([dx, by, knot[2] + 0.02, 0, 0, 1, RIBBON, 0.2, true, "@"]);
  }

  // Baby's breath
  const babies = [];
  for (let i = 0; i < 90; i++) {
    const a = rnd() * 2 * Math.PI;
    const el = rnd.uniform(0.3, 1.4);
    const rr = rnd.uniform(0.40, 0.58);
    babies.push([rr * Math.cos(a) * Math.cos(el), C[1] + rr * Math.sin(el),
      rr * Math.sin(a) * Math.cos(el), rnd.uniform(0, 6.28)]);
  }

  // Sparkles
  const sparkles = [];
  for (let i = 0; i < 30; i++) {
    const a = rnd() * 2 * Math.PI;
    const rr = rnd.uniform(0.75, 0.95);
    sparkles.push([rr * Math.cos(a), rnd.uniform(-0.3, 1.0), rr * Math.sin(a),
      rnd.uniform(0, 6.28), rnd.uniform(1.5, 4.0)]);
  }

  return { pts, flowers, babies, sparkles };
}

function updateHearts(hearts, dt) {
  while (hearts.length < NUM_HEARTS) {
    hearts.push([Math.random(), 1.0 + Math.random(), uniform(0.03, 0.08),
      uniform(0, 6.28), pick(HEART_COLORS)]);
  }
  for (const h of hearts) {
    h[1] -= h[2] * dt;
    if (h[1] < 0) {
      h[0] = Math.random();
      h[1] = 1.0;
      h[4] = pick(HEART_COLORS);
    }
  }
}

function render(scene, t, cols, rows, hearts, rotation = 1, size = 100, rotationOffset = 0) {
  const { pts, flowers, babies, sparkles } = scene;
  const chars = Array.from({ length: rows }, () => new Array(cols).fill(" "));
  const colors = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const zbuf = Array.from({ length: rows }, () => new Array(cols).fill(-1e9));

  const viewRows = rows - 2;
  const widthFitScale = (cols - 2) / 2.7;
  const scale = Math.max(1.0, Math.min((viewRows - 2) / 1.45, widthFitScale));
  const sizeFactor = Math.min(size / 100, widthFitScale / scale);
  const flowerScale = Math.min(1 + Math.max(0, sizeFactor - 1) * 0.5, 1.15);
  const sxScale = scale * 2.0 * sizeFactor;
  const cx = cols / 2;
  const cy = 1 + 0.78 * scale;

  const ang = t * SPIN_SPEED * rotation + rotationOffset;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const ct = Math.cos(TILT), st = Math.sin(TILT);

  // Returns [screenX, screenY, depth, perspectiveFactor] (floats)
  const projectF = (x, y, z) => {
    const xr = x * ca - z * sa;
    const zr = x * sa + z * ca;
    const yp = y - PIVOT_Y;
    const yt = yp * ct - zr * st;
    const zt = yp * st + zr * ct;
    const f = CAM_DIST / (CAM_DIST - zt);
    return [cx + xr * f * sxScale, cy - yt * f * scale, zt, f];
  };
  const project = (x, y, z) => {
    const [fx, fy, zt] = projectF(x, y, z);
    return [Math.trunc(fx), Math.trunc(fy), zt];
  };

  const plot = (col, row, z, ch, color) => {
    if (row >= 0 && row < viewRows && col >= 0 && col < cols && z > zbuf[row][col]) {
      zbuf[row][col] = z;
      chars[row][col] = ch;
      colors[row][col] = color;
    }
  };

  // Floating hearts (furthest back)
  for (const [x, y, , phase, color] of hearts) {
    let col = Math.trunc((x + 0.015 * Math.sin(t * 1.2 + phase)) * cols) % cols;
    if (col < 0) col += cols;
    plot(col, Math.trunc(y * viewRows), -50, "♥", color);
  }

  // Point cloud (stems, leaves, paper, ribbon)
  for (const [x, y, z, nx, ny, nz, pal, tone, twoSided, override] of pts) {
    const [col, row, zt] = project(x, y, z);
    const nxr = nx * ca - nz * sa;
    const nzr = nx * sa + nz * ca;
    const nyt = ny * ct - nzr * st;
    const nzt = ny * st + nzr * ct;
    let dot = nxr * LX + nyt * LY + nzt * LZ;
    if (twoSided && dot < 0) dot = -dot * 0.55;
    const b = clamp01(0.25 + 0.75 * Math.max(0.0, dot) + tone);
    const ch = override || SHADE[Math.floor(b * SHADE.length)];
    plot(col, row, zt, ch, pal[Math.floor(b * pal.length)]);
  }

  // Flower heads (flat shapes that always face the camera)
  for (const [[x, y, z], kind, pal, cpal, nPet, R, seed] of flowers) {
    const [fx, fy, zt, f] = projectF(x, y, z);
    const rx = R * f * sxScale, ry = R * f * scale * flowerScale;
    const dim = -0.4 * (1 - Math.min(1.0, Math.max(0.0, (zt + 0.6) / 1.2)));
    const rot = seed + ang * 0.7;
    for (let row = Math.trunc(fy - ry) - 1; row < Math.trunc(fy + ry) + 2; row++) {
      const dy = (row + 0.5 - fy) / ry;
      for (let col = Math.trunc(fx - rx) - 1; col < Math.trunc(fx + rx) + 2; col++) {
        const dx = (col + 0.5 - fx) / rx;
        if (kind === "lavender") {
          const buds = [[-0.18, -0.58], [0.17, -0.27], [-0.16, 0.04], [0.12, 0.35]];
          let closest = Infinity;
          let budShade = 0;
          for (const [bx, by] of buds) {
            const dxn = (dx - bx) / 0.24;
            const dyn = (dy - by) / 0.24;
            const distance = Math.sqrt(dxn * dxn + dyn * dyn);
            if (distance < closest) {
              closest = distance;
              budShade = clamp01(0.72 - 0.22 * dxn - 0.18 * dyn + dim);
            }
          }
          if (closest > 1) continue;
          plot(col, row, zt + 0.04, PETAL_SHADE[Math.floor(budShade * PETAL_SHADE.length)],
            pal[Math.floor(budShade * pal.length)]);
        } else if (kind !== "tulip") {
          const s = Math.sqrt(dx * dx + dy * dy);
          if (s > 1.0) continue;
          if (s < 0.3) {
            const b = clamp01(0.55 - 0.35 * dx - 0.35 * dy + dim);
            plot(col, row, zt + 0.06, s < 0.17 ? "@" : "o", cpal[Math.floor(b * cpal.length)]);
            continue;
          }
          const ph = Math.atan2(dy, dx);
          const reach = 0.32 + 0.68 * Math.abs(Math.cos((nPet * (ph + rot)) / 2)) ** 0.7;
          if (s > reach) continue;
          const edge = s > reach - 0.14 ? -0.22 : 0.0;
          const b = clamp01(0.62 - 0.22 * dx - 0.28 * dy + 0.12 * s + edge + dim);
          plot(col, row, zt + 0.04 * (1 - s),
            PETAL_SHADE[Math.floor(b * PETAL_SHADE.length)], pal[Math.floor(b * pal.length)]);
        } else {
          const v = (1 - dy) / 2;
          if (v < 0 || v > 1) continue;
          const hw = 0.62 * Math.sin(Math.PI * 0.5 * Math.min(1.0, v * 1.5 + 0.05));
          if (hw <= 0 || Math.abs(dx) > hw) continue;
          const xn = dx / hw;
          if (v > 0.72 + 0.28 * Math.cos(1.5 * Math.PI * xn) ** 2) continue;
          const seam = Math.abs(Math.abs(xn) - 0.33) < 0.12 && v > 0.3 ? -0.25 : 0.0;
          const b = clamp01(0.55 - 0.3 * xn + 0.1 * v + seam + dim);
          plot(col, row, zt + 0.03,
            PETAL_SHADE[Math.floor(b * PETAL_SHADE.length)], pal[Math.floor(b * pal.length)]);
        }
      }
    }
  }

  // Baby's breath
  for (const [x, y, z, phase] of babies) {
    const [col, row, zt] = project(x, y, z);
    const star = Math.sin(t * 2 + phase) > 0.6;
    plot(col, row, zt + 0.02, star ? "*" : "·", star ? 231 : 255);
  }

  // Twinkling sparkles
  for (const [x, y, z, phase, speed] of sparkles) {
    const [col, row, zt] = project(x, y, z);
    const tw = Math.sin(t * speed + phase);
    if (tw > 0.85) plot(col, row, zt, "*", 231);
    else if (tw > 0.4) plot(col, row, zt, "+", 225);
    else if (tw > 0.0) plot(col, row, zt, "·", 218);
  }

  // Build the frame, only emitting a color code when the color changes
  const lines = [];
  for (let r = 0; r < rows; r++) {
    let last = -1;
    let line = "";
    for (let c = 0; c < cols; c++) {
      const ch = chars[r][c];
      if (ch !== " " && colors[r][c] !== last) {
        last = colors[r][c];
        line += `\x1b[38;5;${last}m`;
      }
      line += ch;
    }
    lines.push(line);
  }
  return "\x1b[H" + lines.join("\n") + RESET;
}

export { FPS, buildScene, render, setFlowerColors, updateHearts };