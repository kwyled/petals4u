import {
  FPS,
  buildScene,
  render,
  setFlowerColors,
  updateHearts
} from "./bouquet-renderer.js";

(function () {
  "use strict";

  const canvas = document.getElementById("bouquet");
  const context = canvas.getContext("2d");
  const panel = document.getElementById("controlPanel");
  const flowerKinds = ["rose", "lavender", "sunflower", "tulip", "daisy"];
  const state = {
    theme: "valentine",
    night: true,
    paused: false,
    reducedMotion: false,
    rotation: 100,
    rotationOffset: 0,
    size: 130,
    density: 100,
    glow: 1
  };
  const themes = {
    valentine: { background: "#09030c", rose: "#c51e55", tulip: "#f4a0c4" },
    anniversary: { background: "#100b18", rose: "#9769bd", tulip: "#d7b7ef" },
    birthday: { background: "#170b12", rose: "#e5713f", tulip: "#ffd27a" },
    spring: { background: "#08130e", rose: "#dc738e", tulip: "#f4a0c4" },
    memorial: { background: "#0c1018", rose: "#8797b5", tulip: "#c2cde0" },
    winter: { background: "#071018", rose: "#d9e3ed", tulip: "#b5d7ef" }
  };
  setFlowerColors({
    rose: "#c51e55",
    lavender: "#aa83eb",
    sunflower: "#f0bd30",
    tulip: "#f4a0c4",
    daisy: "#fafafa"
  });
  let scene = buildScene({ rose: 8, lavender: 2, sunflower: 2, tulip: 2, daisy: 2 });
  const hearts = [];
  let elapsed = 0;
  let previousTick = performance.now();
  let previousFrame = previousTick;
  let frameSize = { width: 0, height: 0, fontSize: 16, cellWidth: 10, cellHeight: 20 };

  function showToast(message) {
    const element = document.getElementById("toast");
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => element.classList.remove("show"), 2800);
  }

  function updateCanvasSize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const fontSize = Math.max(9, Math.min(20, width < 600 ? 12 : 16));
    context.font = `${fontSize}px "Courier New", monospace`;
    const cellWidth = context.measureText("M").width;
    const cellHeight = fontSize * 1.16;
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }
    frameSize = { width, height, fontSize, cellWidth, cellHeight };
    return {
      cols: Math.max(20, Math.floor(width / cellWidth)),
      rows: Math.max(12, Math.floor(height / cellHeight))
    };
  }

  function xtermColor(code) {
    const basic = [
      [0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0],
      [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192],
      [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0],
      [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]
    ];
    if (code < 16) return `rgb(${basic[code].join(",")})`;
    if (code < 232) {
      const levels = [0, 95, 135, 175, 215, 255];
      const index = code - 16;
      return `rgb(${levels[Math.floor(index / 36)]},${levels[Math.floor(index / 6) % 6]},${levels[index % 6]})`;
    }
    const gray = 8 + (code - 232) * 10;
    return `rgb(${gray},${gray},${gray})`;
  }

  function drawAnsi(ansi, cols, rows) {
    const characters = Array.from({ length: rows }, () => new Array(cols).fill(" "));
    const colors = Array.from({ length: rows }, () => new Uint16Array(cols));
    let row = 0;
    let col = 0;
    let color = 255;

    for (let index = 0; index < ansi.length;) {
      if (ansi[index] === "\x1b" && ansi[index + 1] === "[") {
        const command = /[A-Za-z]/.exec(ansi.slice(index + 2));
        if (!command) break;
        const end = index + 2 + command.index;
        const match = ansi.slice(index, end + 1);
        const code = match.slice(2);
        if (code.endsWith("m")) {
          const values = code.slice(0, -1).split(";").map(Number);
          const position = values.indexOf(38);
          if (position !== -1 && values[position + 1] === 5) color = values[position + 2];
          else if (values[0] === 0) color = 255;
        } else if (code === "H") {
          row = 0;
          col = 0;
        }
        index = end + 1;
        continue;
      }

      const character = ansi[index++];
      if (character === "\n") {
        row++;
        col = 0;
      } else {
        if (row < rows && col < cols) {
          characters[row][col] = character;
          colors[row][col] = color;
        }
        col++;
      }
    }

    context.fillStyle = getComputedStyle(document.body).backgroundColor;
    context.fillRect(0, 0, frameSize.width, frameSize.height);
    context.font = `${frameSize.fontSize}px "Courier New", monospace`;
    context.textBaseline = "top";
    context.shadowBlur = state.glow * 3;

    for (let y = 0; y < rows; y++) {
      let x = 0;
      while (x < cols) {
        while (x < cols && characters[y][x] === " ") x++;
        if (x >= cols) break;
        const start = x;
        const currentColor = colors[y][x];
        let text = "";
        while (x < cols && characters[y][x] !== " " && colors[y][x] === currentColor) {
          text += characters[y][x++];
        }
        context.fillStyle = xtermColor(currentColor);
        context.shadowColor = context.fillStyle;
        context.fillText(text, start * frameSize.cellWidth, y * frameSize.cellHeight);
      }
    }
    context.shadowBlur = 0;
  }

  function currentOptions() {
    const counts = {};
    const colors = {};
    for (const kind of flowerKinds) {
      const enabled = document.querySelector(`[data-kind="${kind}"]`).checked;
      const countInput = document.querySelector(`[data-flower-count="${kind}"]`);
      const colorInput = document.querySelector(`[data-flower-color="${kind}"]`);
      counts[kind] = enabled
        ? Math.round(Math.max(0, Math.min(40, Number(countInput.value) || 0)) * state.density / 100)
        : 0;
      colors[kind] = colorInput.value;
    }
    return { counts, colors };
  }

  function configureRenderer() {
    const options = currentOptions();
    setFlowerColors(options.colors);
    scene = buildScene(options.counts);
    hearts.length = 0;
  }

  function setPanel(open) {
    panel.classList.toggle("open", open);
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    document.getElementById("settingsToggle").setAttribute("aria-expanded", String(open));
  }

  function applyTheme(name) {
    const theme = themes[name];
    if (!theme) return;
    state.theme = name;
    document.body.style.backgroundColor = theme.background;
    document.querySelector('[data-flower-color="rose"]').value = theme.rose;
    document.querySelector('[data-flower-color="tulip"]').value = theme.tulip;
    document.querySelectorAll(".theme-button").forEach((button) => {
      button.classList.toggle("active", button.dataset.theme === name);
    });
    configureRenderer();
  }

  function animate(now) {
    const delta = Math.min((now - previousTick) / 1000, 0.1);
    previousTick = now;
    if (!state.paused && !state.reducedMotion) elapsed += delta;

    if (now - previousFrame >= 1000 / FPS) {
      const dimensions = updateCanvasSize();
      const frameDelta = Math.min((now - previousFrame) / 1000, 0.1);
      previousFrame = now;
      const motionDelta = state.paused || state.reducedMotion ? 0 : frameDelta;
      updateHearts(hearts, motionDelta);
      const time = state.reducedMotion ? 0 : elapsed;
      const ansi = render(scene, time, dimensions.cols, dimensions.rows, hearts,
        state.rotation / 100, state.size, state.rotationOffset);
      drawAnsi(ansi, dimensions.cols, dimensions.rows);
    }
    requestAnimationFrame(animate);
  }
  document.getElementById("settingsToggle").addEventListener("click", () => {
    setPanel(!panel.classList.contains("open"));
  });
  document.getElementById("closePanel").addEventListener("click", () => setPanel(false));

  let drag = null;
  canvas.addEventListener("pointerdown", (event) => {
    drag = { x: event.clientX };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("drag");
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag) return;
    state.rotationOffset += (event.clientX - drag.x) * 0.01;
    drag.x = event.clientX;
  });
  function endDrag() {
    drag = null;
    canvas.classList.remove("drag");
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  document.querySelectorAll(".theme-button").forEach((button) => {
    button.addEventListener("click", () => applyTheme(button.dataset.theme));
  });
  document.querySelectorAll("[data-kind]").forEach((input) => {
    input.addEventListener("change", configureRenderer);
  });
  document.querySelectorAll("[data-flower-color], [data-flower-count]").forEach((input) => {
    input.addEventListener("input", configureRenderer);
    input.addEventListener("change", configureRenderer);
  });
  document.getElementById("sizeRange").addEventListener("input", (event) => {
    state.size = Number(event.target.value);
    updateCanvasSize();
  });
  document.getElementById("densityRange").addEventListener("input", (event) => {
    state.density = Number(event.target.value);
    configureRenderer();
  });
  document.getElementById("glowRange").addEventListener("input", (event) => {
    state.glow = Number(event.target.value);
  });
  document.getElementById("rotationRange").addEventListener("input", (event) => {
    state.rotation = Number(event.target.value);
  });
  document.getElementById("pauseButton").addEventListener("click", (event) => {
    state.paused = !state.paused;
    event.currentTarget.textContent = state.paused ? "Resume" : "Pause";
  });
  document.getElementById("dayNightButton").textContent = "Day";
  document.getElementById("dayNightButton").addEventListener("click", (event) => {
    state.night = !state.night;
    document.body.style.backgroundColor = state.night ? themes[state.theme].background : "#d9edf2";
    event.currentTarget.textContent = state.night ? "Day" : "Night";
  });
  document.getElementById("motionButton").addEventListener("click", (event) => {
    state.reducedMotion = !state.reducedMotion;
    event.currentTarget.textContent = state.reducedMotion ? "Enable motion" : "Reduce motion";
  });

  function exportCanvas() {
    const output = document.createElement("canvas");
    output.width = canvas.width;
    output.height = canvas.height;
    const outputContext = output.getContext("2d");
    outputContext.fillStyle = getComputedStyle(document.body).backgroundColor;
    outputContext.fillRect(0, 0, output.width, output.height);
    outputContext.drawImage(canvas, 0, 0);
    return output;
  }

  function download(blob, filename) {
    if (!blob) {
      showToast("Could not create the image");
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  document.getElementById("pngButton").addEventListener("click", () => {
    exportCanvas().toBlob((blob) => download(blob, "petals4u.png"), "image/png");
  });
  document.getElementById("gifButton").addEventListener("click", () => {
    if (typeof GIF === "undefined") {
      showToast("GIF exporter could not load");
      return;
    }
    const image = exportCanvas();
    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: image.width,
      height: image.height,
      workerScript: "vendor/gif.worker.js"
    });
    let frame = 0;
    gif.on("finished", (blob) => download(blob, "petals4u.gif"));
    showToast("Rendering animated GIF...");
    const capture = () => {
      gif.addFrame(exportCanvas(), { copy: true, delay: 120 });
      if (++frame < 12) setTimeout(capture, 120);
      else gif.render();
    };
    capture();
  });

  window.addEventListener("resize", updateCanvasSize);
  updateCanvasSize();
  requestAnimationFrame(animate);
})();
