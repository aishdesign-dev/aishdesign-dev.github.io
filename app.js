/* Vanilla desktop: windows, drag, start menu, clock. No build step. */
(() => {
  const desktop = document.getElementById("desktop");
  const boot = document.getElementById("boot");
  const startBtn = document.getElementById("start-btn");
  const startMenu = document.getElementById("start-menu");
  const tasks = document.getElementById("tasks");
  const clockEl = document.getElementById("clock");

  const windows = {};
  let z = 20;
  const isMobile = () => window.matchMedia("(max-width: 720px)").matches;

  function $(sel, root = document) { return root.querySelector(sel); }

  function bringToFront(id) {
    z += 1;
    Object.entries(windows).forEach(([key, w]) => {
      w.el.classList.toggle("is-front", key === id);
      if (key === id) w.el.style.zIndex = String(z);
      if (w.task) w.task.classList.toggle("is-active", key === id && w.el.classList.contains("is-open") && !w.el.classList.contains("is-min"));
    });
  }

  function ensureTask(id, title) {
    const w = windows[id];
    if (w.task) return;
    const btn = document.createElement("button");
    btn.className = "task";
    btn.type = "button";
    btn.textContent = title;
    btn.addEventListener("click", () => {
      if (w.el.classList.contains("is-min") || !w.el.classList.contains("is-open")) openWindow(id);
      else if (w.el.classList.contains("is-front")) minimizeWindow(id);
      else bringToFront(id);
    });
    tasks.appendChild(btn);
    w.task = btn;
  }

  function openWindow(id) {
    const w = windows[id];
    if (!w) return;
    if (isMobile()) {
      Object.values(windows).forEach((other) => {
        if (other !== w) {
          other.el.classList.remove("is-open");
          other.el.classList.add("is-min");
        }
      });
    }
    w.el.classList.add("is-open");
    w.el.classList.remove("is-min");
    ensureTask(id, w.title);
    bringToFront(id);
    closeStart();
  }

  function closeWindow(id) {
    const w = windows[id];
    w.el.classList.remove("is-open", "is-min", "is-max", "is-front");
    if (w.task) { w.task.remove(); w.task = null; }
  }

  function minimizeWindow(id) {
    const w = windows[id];
    w.el.classList.add("is-min");
    w.el.classList.remove("is-front");
    if (w.task) w.task.classList.remove("is-active");
  }

  function toggleMax(id) {
    if (isMobile()) return;
    windows[id].el.classList.toggle("is-max");
    bringToFront(id);
  }

  function makeDraggable(id) {
    const w = windows[id];
    const bar = w.el.querySelector(".title-bar");
    let dragging = false, sx, sy, ox, oy;

    bar.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      if (isMobile() || w.el.classList.contains("is-max")) return;
      dragging = true;
      bringToFront(id);
      const desk = desktop.getBoundingClientRect();
      const r = w.el.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY;
      ox = r.left - desk.left; oy = r.top - desk.top;
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const desk = desktop.getBoundingClientRect();
      let x = ox + (e.clientX - sx);
      let y = oy + (e.clientY - sy);
      const maxX = desk.width - 80;
      const maxY = desk.height - 40;
      x = Math.max(-w.el.offsetWidth + 80, Math.min(x, maxX));
      y = Math.max(0, Math.min(y, maxY));
      w.el.style.left = `${x}px`;
      w.el.style.top = `${y}px`;
    });
    const stop = () => { dragging = false; };
    bar.addEventListener("pointerup", stop);
    bar.addEventListener("pointercancel", stop);
    bar.addEventListener("dblclick", () => toggleMax(id));
  }

  document.querySelectorAll("[data-window]").forEach((el) => {
    const id = el.getAttribute("data-window");
    windows[id] = { el, title: el.querySelector(".title-bar span").textContent, task: null };
    el.querySelector("[data-action=close]").addEventListener("click", () => closeWindow(id));
    el.querySelector("[data-action=min]").addEventListener("click", () => minimizeWindow(id));
    el.querySelector("[data-action=max]").addEventListener("click", () => toggleMax(id));
    el.addEventListener("mousedown", () => bringToFront(id));
    makeDraggable(id);
  });

  document.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const id = el.getAttribute("data-open");
      if (!windows[id]) return;
      e.preventDefault();
      openWindow(id);
    });
  });

  function closeStart() {
    startMenu.classList.remove("is-open");
    startBtn.setAttribute("aria-expanded", "false");
  }
  function toggleStart() {
    const open = !startMenu.classList.contains("is-open");
    startMenu.classList.toggle("is-open", open);
    startBtn.setAttribute("aria-expanded", String(open));
  }
  startBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleStart(); });
  document.addEventListener("click", (e) => {
    if (!startMenu.contains(e.target) && e.target !== startBtn && !startBtn.contains(e.target)) closeStart();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeStart();
  });

  function tick() {
    const now = new Date();
    clockEl.dateTime = now.toISOString();
    clockEl.textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  tick();
  setInterval(tick, 1000);

  function finishBoot() {
    if (!boot || boot.classList.contains("is-done")) return;
    boot.classList.add("is-done");
    setTimeout(() => boot.remove(), 520);
    openWindow("about");
  }
  const params = new URLSearchParams(location.search);
  if (params.has("preview")) {
    boot?.remove();
    openWindow("about");
    if (!isMobile()) {
      const about = windows.about?.el;
      if (about) { about.style.left = "150px"; about.style.top = "48px"; about.style.width = "520px"; }
      openWindow("projects");
      const proj = windows.projects?.el;
      if (proj) { proj.style.left = "700px"; proj.style.top = "96px"; proj.style.width = "500px"; }
    }
  } else {
    const skip = document.getElementById("boot-skip");
    if (skip) skip.addEventListener("click", finishBoot);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(finishBoot, reduce ? 200 : 1700);
  }

  document.getElementById("restart")?.addEventListener("click", () => {
    closeStart();
    location.reload();
  });
})();
