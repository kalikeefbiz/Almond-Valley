// Touch + mouse camera controls and tap/drag routing.
export function bindInput(canvas, view, h) {
  const cam = view.cam, pts = new Map();
  let mode = 'none', pinch = null, last = null, downAt = 0, moved = 0, rotating = false;

  const ground = (x, y) => view.groundAt(x, y);
  const two = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (pts.size === 1) {
      mode = 'pending'; downAt = performance.now(); moved = 0; last = { x: e.clientX, y: e.clientY };
      rotating = e.button === 2 || e.button === 1 || e.ctrlKey || e.shiftKey;
      if (rotating) mode = 'rotate';
    } else if (pts.size === 2) {
      if (mode === 'custom') h.dragEnd && h.dragEnd();
      mode = 'pinch'; pinch = two();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) { h.hover && h.hover(e.clientX, e.clientY); return; }
    p.x = e.clientX; p.y = e.clientY;
    if (mode === 'pinch' && pts.size >= 2) {
      const t = two();
      if (pinch.d > 10 && t.d > 10) cam.dist *= pinch.d / t.d;
      let da = t.a - pinch.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      cam.yaw -= da;
      cam.pitch += (t.cy - pinch.cy) * 0.005;
      // keep the ground under the fingers while panning with two fingers
      const g0 = ground(pinch.cx, pinch.cy), g1 = ground(t.cx, pinch.cy);
      if (g0 && g1) { cam.target.x += g0.x - g1.x; cam.target.z += g0.z - g1.z; }
      pinch = t; return;
    }
    if (pts.size !== 1) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    // distance from where the finger landed, so normal fingertip jitter still counts as a tap
    moved = Math.max(moved, Math.hypot(e.clientX - p.sx, e.clientY - p.sy));
    if (mode === 'pending' && moved > 14) mode = h.dragStart && h.dragStart(p.sx, p.sy) ? 'custom' : 'pan';
    if (mode === 'pan') {
      const g0 = ground(last.x, last.y), g1 = ground(e.clientX, e.clientY);
      if (g0 && g1) { const mx = g0.x - g1.x, mz = g0.z - g1.z, len = Math.hypot(mx, mz), cap = cam.dist * 0.5; const k = len > cap ? cap / len : 1; cam.target.x += mx * k; cam.target.z += mz * k; }
    } else if (mode === 'custom') h.dragMove && h.dragMove(e.clientX, e.clientY);
    else if (mode === 'rotate') { cam.yaw -= dx * 0.006; cam.pitch += dy * 0.005; }
    last = { x: e.clientX, y: e.clientY };
  });
  const up = (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    pts.delete(e.pointerId);
    if (mode === 'pending' && performance.now() - downAt < 650 && e.type === 'pointerup') h.tap && h.tap(e.clientX, e.clientY);
    if (mode === 'custom') h.dragEnd && h.dragEnd();
    mode = pts.size === 0 ? 'none' : 'wait';
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist *= Math.exp(e.deltaY * 0.0012); }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // iOS: stop page-level pinch zoom / rubber banding
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.target === canvas) e.preventDefault(); }, { passive: false });

  const keys = new Set();
  window.addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; keys.add(e.key.toLowerCase()); h.key && h.key(e.key.toLowerCase(), e); });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  return {
    update(dt) {
      if (!keys.size) return;
      const sp = cam.dist * 0.9 * dt, s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
      let fx = 0, fz = 0;
      if (keys.has('w') || keys.has('arrowup')) fz -= 1;
      if (keys.has('s') || keys.has('arrowdown')) fz += 1;
      if (keys.has('a') || keys.has('arrowleft')) fx -= 1;
      if (keys.has('d') || keys.has('arrowright')) fx += 1;
      cam.target.x += (fx * c + fz * s) * sp; cam.target.z += (fz * c - fx * s) * sp;
      if (keys.has('q')) cam.yaw += dt * 1.4; if (keys.has('e')) cam.yaw -= dt * 1.4;
    },
  };
}
