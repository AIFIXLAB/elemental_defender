/* ELEMENTAL DEFENDERS — visual effects: particles, beams, lightning, rings, damage text, screen shake */
'use strict';
(function () {
  const FX = ED.FX = { list: [], texts: [], shakeT: 0, shakeA: 0, quality: 1 };
  const glowCache = {};
  FX.glowSprite = function (key) {
    if (glowCache[key]) return glowCache[key];
    const el = ED.ELEMENT[key]; const col = el ? el.color : key, hi = el ? el.glow : '#ffffff';
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.18, hi); gr.addColorStop(0.45, col + 'aa'); gr.addColorStop(1, col + '00');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return glowCache[key] = c;
  };
  const softCache = {};
  FX.smokeSprite = function (col) {
    if (softCache[col]) return softCache[col];
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, col + 'cc'); gr.addColorStop(1, col + '00');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return softCache[col] = c;
  };
  const MAX = 1400;
  FX.add = function (p) {
    if (FX.list.length > MAX * FX.quality) return;
    p.t = 0; p.life = p.life || 0.6; FX.list.push(p); return p;
  };
  const R = Math.random;
  FX.burst = function (x, y, el, n, spd, size, opt) {
    n = Math.ceil(n * FX.quality); opt = opt || {};
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, s = spd * (0.3 + R() * 0.9);
      FX.add({ k: 'glow', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (opt.up || 0), el, size: size * (0.5 + R()), life: (opt.life || 0.55) * (0.6 + R() * 0.7), drag: opt.drag || 3, grav: opt.grav || 0 });
    }
  };
  FX.sparks = function (x, y, el, n, spd) {
    n = Math.ceil(n * FX.quality);
    for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, s = spd * (0.5 + R()); FX.add({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, el, life: 0.3 + R() * 0.3, drag: 4, grav: 300, w: 2 + R() * 2 }); }
  };
  FX.smoke = function (x, y, col, n, size, life) {
    n = Math.ceil(n * FX.quality);
    for (let i = 0; i < n; i++) FX.add({ k: 'smoke', x: x + (R() - 0.5) * size, y: y + (R() - 0.5) * size * 0.5, vx: (R() - 0.5) * 30, vy: -20 - R() * 30, col, size: size * (0.6 + R() * 0.6), life: life * (0.7 + R() * 0.6), grow: 1.8 });
  };
  FX.ring = function (x, y, el, r0, r1, life, w, flat) { FX.add({ k: 'ring', x, y, el, r0, r1, life, w: w || 6, flat: flat == null ? 0.45 : flat }); };
  FX.beam = function (x1, y1, x2, y2, el, w, life) { FX.add({ k: 'beam', x: x1, y: y1, x2, y2, el, w, life: life || 0.25 }); };
  FX.lightning = function (pts, el, life, w) {
    // jagged polyline
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i]; const segs = 6;
      for (let s = 1; s < segs; s++) { const t = s / segs; out.push([ax + (bx - ax) * t + (R() - 0.5) * 26, ay + (by - ay) * t + (R() - 0.5) * 26]); }
      out.push(pts[i]);
    }
    FX.add({ k: 'bolt', pts: out, el, life: life || 0.28, w: w || 4 });
  };
  FX.sprite = function (x, y, part, size, life, opt) { opt = opt || {}; FX.add({ k: 'sprite', x, y, part, size, life, rot: opt.rot || R() * 6.28, spin: opt.spin || 2, grow: opt.grow || 1.5, add: opt.add !== false }); };
  FX.pillar = function (x, y, el, w, h, life) { FX.add({ k: 'pillar', x, y, el, w, h, life }); };
  FX.text = function (x, y, str, col, size, opt) {
    opt = opt || {};
    if (FX.texts.length > 120) FX.texts.shift();
    FX.texts.push({ x: x + (R() - 0.5) * 16, y, str, col, size: size || 22, t: 0, life: opt.life || 0.9, vy: opt.vy || -70, bold: opt.bold, stroke: opt.stroke || 'rgba(0,0,0,0.85)' });
  };
  FX.shake = function (a, t) { FX.shakeA = Math.max(FX.shakeA, a * (ED.settings ? ED.settings.shake : 1)); FX.shakeT = Math.max(FX.shakeT, t || 0.25); };
  FX.clear = function () { FX.list.length = 0; FX.texts.length = 0; FX.shakeT = 0; };

  FX.update = function (dt) {
    const L = FX.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i]; p.t += dt;
      if (p.t >= p.life) { L[i] = L[L.length - 1]; L.pop(); continue; }
      if (p.vx != null) {
        const d = Math.exp(-(p.drag || 0) * dt); p.vx *= d; p.vy *= d; p.vy += (p.grav || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      }
    }
    for (let i = FX.texts.length - 1; i >= 0; i--) { const q = FX.texts[i]; q.t += dt; q.y += q.vy * dt; q.vy *= Math.exp(-2.5 * dt); if (q.t > q.life) FX.texts.splice(i, 1); }
    if (FX.shakeT > 0) { FX.shakeT -= dt; if (FX.shakeT <= 0) FX.shakeA = 0; }
  };
  FX.shakeOffset = function () { if (FX.shakeT <= 0) return [0, 0]; const a = FX.shakeA * Math.min(1, FX.shakeT * 4); return [(R() - 0.5) * a, (R() - 0.5) * a]; };

  FX.draw = function (ctx) {
    ctx.save();
    for (const p of FX.list) {
      const k = p.t / p.life, inv = 1 - k;
      switch (p.k) {
        case 'smoke': {
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = inv * 0.55;
          const s = p.size * (1 + k * (p.grow || 1)); ctx.drawImage(FX.smokeSprite(p.col), p.x - s / 2, p.y - s / 2, s, s); break;
        }
        case 'glow': {
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = inv;
          const s = p.size * (0.4 + inv * 0.8); ctx.drawImage(FX.glowSprite(p.el), p.x - s / 2, p.y - s / 2, s, s); break;
        }
        case 'spark': {
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = inv; ctx.strokeStyle = ED.ELEMENT[p.el] ? ED.ELEMENT[p.el].glow : p.el; ctx.lineWidth = p.w;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke(); break;
        }
        case 'ring': {
          ctx.globalCompositeOperation = 'lighter'; const r = p.r0 + (p.r1 - p.r0) * (1 - Math.pow(inv, 2.2));
          ctx.globalAlpha = inv; ctx.strokeStyle = ED.ELEMENT[p.el].color; ctx.lineWidth = p.w * inv + 1;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * (p.flat || 1), 0, 0, 7); ctx.stroke();
          ctx.strokeStyle = ED.ELEMENT[p.el].glow; ctx.lineWidth = Math.max(1, p.w * inv * 0.35);
          ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * (p.flat || 1), 0, 0, 7); ctx.stroke(); break;
        }
        case 'beam': {
          ctx.globalCompositeOperation = 'lighter'; const E = ED.ELEMENT[p.el];
          ctx.lineCap = 'round';
          ctx.globalAlpha = inv * 0.5; ctx.strokeStyle = E.color; ctx.lineWidth = p.w * 2.4 * (0.6 + inv * 0.4);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.stroke();
          ctx.globalAlpha = inv; ctx.strokeStyle = E.glow; ctx.lineWidth = p.w;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = p.w * 0.35; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.stroke(); break;
        }
        case 'bolt': {
          ctx.globalCompositeOperation = 'lighter'; const E = ED.ELEMENT[p.el]; ctx.lineJoin = 'round';
          for (const [w, col, a] of [[p.w * 3, E.color, 0.45], [p.w, E.glow, 1], [p.w * 0.4, '#fff', 1]]) {
            ctx.globalAlpha = inv * a; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); p.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
          }
          break;
        }
        case 'pillar': {
          ctx.globalCompositeOperation = 'lighter'; const E = ED.ELEMENT[p.el];
          const w = p.w * (k < 0.15 ? k / 0.15 : inv);
          const gr = ctx.createLinearGradient(p.x - w, 0, p.x + w, 0); gr.addColorStop(0, E.color + '00'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, E.color + '00');
          ctx.globalAlpha = Math.min(1, inv * 1.5); ctx.fillStyle = gr; ctx.fillRect(p.x - w, p.y - p.h, w * 2, p.h);
          ctx.drawImage(FX.glowSprite(p.el), p.x - w * 2, p.y - w * 1.2, w * 4, w * 2.4); break;
        }
        case 'sprite': {
          ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over'; ctx.globalAlpha = inv;
          const s = p.size * (1 + k * (p.grow - 1)); const P = p.part;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + p.spin * p.t); ctx.drawImage(ED.IMG[P.fam], P.x, P.y, P.w, P.h, -s / 2, -s / 2 * P.h / P.w, s, s * P.h / P.w); ctx.restore(); break;
        }
      }
    }
    ctx.restore();
  };
  FX.drawTexts = function (ctx) {
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const q of FX.texts) {
      const k = q.t / q.life; const pop = k < 0.12 ? 0.6 + k / 0.12 * 0.6 : 1.2 - Math.min(0.2, (k - 0.12));
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.font = `${q.bold ? 900 : 700} ${Math.round(q.size * pop)}px "Kanit", "Prompt", sans-serif`;
      ctx.lineWidth = 5; ctx.strokeStyle = q.stroke; ctx.strokeText(q.str, q.x, q.y); ctx.fillStyle = q.col; ctx.fillText(q.str, q.x, q.y);
    }
    ctx.restore();
  };

  /* ---------- projectile renderers (per element) ---------- */
  FX.drawProjectile = function (ctx, p, time) {
    const E = ED.ELEMENT[p.el]; const ang = Math.atan2(p.vy, p.vx);
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.globalCompositeOperation = 'lighter';
    const s = p.size || 1;
    switch (p.el) {
      case 'FIRE':
        ctx.drawImage(FX.glowSprite('FIRE'), -26 * s, -26 * s, 52 * s, 52 * s);
        ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(0, 0, 6 * s, 0, 7); ctx.fill(); break;
      case 'WIND':
        ctx.rotate(time * 18); ctx.strokeStyle = E.glow; ctx.lineWidth = 4 * s; ctx.globalAlpha = 0.95;
        ctx.beginPath(); ctx.arc(0, 0, 11 * s, 0, 4.2); ctx.stroke(); ctx.strokeStyle = E.color; ctx.lineWidth = 7 * s; ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.arc(0, 0, 11 * s, 0, 4.2); ctx.stroke();
        break;
      case 'LIGHT':
        ctx.rotate(ang); ctx.drawImage(FX.glowSprite('LIGHT'), -22 * s, -14 * s, 44 * s, 28 * s); ctx.fillStyle = '#fff'; ctx.fillRect(-12 * s, -2 * s, 24 * s, 4 * s); break;
      case 'DARK':
        ctx.drawImage(FX.glowSprite('DARK'), -24 * s, -24 * s, 48 * s, 48 * s); ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#12002a'; ctx.beginPath(); ctx.arc(0, 0, 7 * s, 0, 7); ctx.fill(); ctx.strokeStyle = E.glow; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 9 * s, time * 6, time * 6 + 4); ctx.stroke(); break;
      case 'EARTH':
        ctx.globalCompositeOperation = 'source-over'; ctx.rotate(time * 8);
        ctx.fillStyle = '#7a5530'; ctx.strokeStyle = '#2a1808'; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28, r = (10 + (i % 3) * 3) * s; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(r, 0); }
        ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#b8874f'; ctx.beginPath(); ctx.arc(-3 * s, -3 * s, 4 * s, 0, 7); ctx.fill(); break;
      case 'WATER':
        ctx.rotate(ang); ctx.drawImage(FX.glowSprite('WATER'), -22 * s, -16 * s, 44 * s, 32 * s);
        ctx.fillStyle = '#e6f7ff'; ctx.beginPath(); ctx.moveTo(12 * s, 0); ctx.lineTo(-8 * s, -6 * s); ctx.lineTo(-4 * s, 0); ctx.lineTo(-8 * s, 6 * s); ctx.closePath(); ctx.fill(); break;
    }
    ctx.restore();
  };
  // trail particles per frame
  FX.trail = function (p) {
    if (R() > 0.8 * FX.quality) return;
    switch (p.el) {
      case 'FIRE': FX.add({ k: 'glow', x: p.x, y: p.y, vx: (R() - .5) * 30, vy: -30, el: 'FIRE', size: 22, life: 0.35 }); if (R() < 0.3) FX.smoke(p.x, p.y, '#3a2a2a', 1, 14, 0.5); break;
      case 'WIND': FX.add({ k: 'glow', x: p.x, y: p.y, vx: 0, vy: 0, el: 'WIND', size: 14, life: 0.25 }); break;
      case 'LIGHT': FX.add({ k: 'glow', x: p.x, y: p.y, vx: (R() - .5) * 20, vy: (R() - .5) * 20, el: 'LIGHT', size: 12, life: 0.3 }); break;
      case 'DARK': FX.smoke(p.x, p.y, '#3b1466', 1, 18, 0.45); break;
      case 'EARTH': if (R() < 0.4) FX.add({ k: 'glow', x: p.x, y: p.y, vx: 0, vy: 0, el: 'EARTH', size: 10, life: 0.25 }); break;
      case 'WATER': FX.add({ k: 'glow', x: p.x, y: p.y, vx: (R() - .5) * 20, vy: 20, el: 'WATER', size: 12, life: 0.3, grav: 80 }); break;
    }
  };
  /* impact per element */
  FX.impact = function (x, y, el, big) {
    const b = big ? 1.6 : 1;
    switch (el) {
      case 'FIRE': FX.burst(x, y, 'FIRE', 10 * b, 160 * b, 30 * b, { up: 40 }); FX.ring(x, y + 10, 'FIRE', 6, 55 * b, 0.35, 6); FX.smoke(x, y, '#2a1a1a', 3, 30, 0.8); FX.sparks(x, y, 'FIRE', 5, 220); break;
      case 'WIND': FX.burst(x, y, 'WIND', 6 * b, 120, 18); FX.ring(x, y, 'WIND', 4, 30 * b, 0.25, 3, 1); break;
      case 'LIGHT': FX.burst(x, y, 'LIGHT', 7 * b, 120, 22); FX.sparks(x, y, 'LIGHT', 6, 200); break;
      case 'DARK': FX.burst(x, y, 'DARK', 7 * b, 90, 26); FX.smoke(x, y, '#2a0a4a', 3, 34, 0.7); FX.ring(x, y, 'DARK', 40 * b, 4, 0.3, 4, 1); break;
      case 'EARTH': FX.ring(x, y + 12, 'EARTH', 8, 60 * b, 0.4, 8); FX.smoke(x, y + 10, '#7a6040', 5, 34, 0.7);
        for (let i = 0; i < 6 * FX.quality; i++) { const a = -Math.PI * R(); FX.add({ k: 'spark', x, y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 220, el: 'EARTH', life: 0.5, drag: 1, grav: 700, w: 4 }); } break;
      case 'WATER': FX.burst(x, y, 'WATER', 8 * b, 140, 18, { grav: 300, up: 60 }); FX.ring(x, y + 8, 'WATER', 4, 40 * b, 0.35, 4); break;
    }
  };
})();
