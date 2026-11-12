/* ELEMENTAL DEFENDERS — asset loading & procedural sprite composition */
'use strict';
(function () {
  const M = ED_MANIFEST;
  const IMG = {};
  ED.IMG = IMG;
  ED.loadAssets = function (onProgress) {
    const list = [['tower', 'assets/atlas_tower.png'], ['monster', 'assets/atlas_monster.png'], ['env', 'assets/atlas_env.png'], ['title', 'assets/ui/title.jpg']];
    for (let i = 1; i <= 30; i++) list.push(['map' + i, 'assets/maps/map' + String(i).padStart(2, '0') + '.jpg']);
    let done = 0;
    return Promise.all(list.map(([k, src]) => new Promise(res => {
      const im = new Image(); im.onload = im.onerror = () => { done++; onProgress && onProgress(done / list.length); res(); };
      im.src = src; IMG[k] = im;
    })));
  };

  // ---------- part lookup ----------
  const byName = {};
  for (const fam of ['tower', 'monster', 'env']) for (const g in M[fam]) for (const e of M[fam][g]) byName[fam + ':' + e[0]] = { fam, g, n: e[0], x: e[1], y: e[2], w: e[3], h: e[4], el: e[5] };
  ED.part = (fam, name) => byName[fam + ':' + name];
  const POOL_FALLBACK = { FIRE: ['FIRE', 'EARTH'], LIGHT: ['LIGHT', 'EARTH', 'FIRE'], WIND: ['WIND', 'WATER'], DARK: ['DARK'], EARTH: ['EARTH'], WATER: ['WATER'] };
  function pool(fam, g, el) {
    const all = M[fam][g];
    for (let i = 0; i < POOL_FALLBACK[el].length; i++) {
      const pe = POOL_FALLBACK[el].slice(0, i + 1);
      const l = all.filter(e => pe.includes(e[5]));
      if (l.length >= 2 || i === POOL_FALLBACK[el].length - 1) return l.length ? l : all;
    }
    return all;
  }
  function pick(fam, g, el, h) { const l = pool(fam, g, el); const e = l[h % l.length]; return byName[fam + ':' + e[0]]; }
  ED.drawPart = function (ctx, p, x, y, w, h) { ctx.drawImage(IMG[p.fam], p.x, p.y, p.w, p.h, x, y, w, h); };

  // tinted copy of a part (element colour wash)
  const tintCache = new Map();
  function tinted(p, color, amt) {
    const k = p.fam + p.n + color + amt; if (tintCache.has(k)) return tintCache.get(k);
    const c = document.createElement('canvas'); c.width = p.w; c.height = p.h; const g = c.getContext('2d');
    g.drawImage(IMG[p.fam], p.x, p.y, p.w, p.h, 0, 0, p.w, p.h);
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = amt; g.fillStyle = color; g.fillRect(0, 0, p.w, p.h);
    tintCache.set(k, c); return c;
  }
  ED.tinted = tinted;

  /* ================= TOWER LOOK =================
     ชิ้นส่วน: ฐาน + แกน + หัวป้อม/คริสตัล + คริสตัลธาตุรอง + วงแหวน (T3+) + ปีก (T4+) + ออร่า (T5)  */
  const towerCache = new Map();
  ED.towerLook = function (spec) {
    if (towerCache.has(spec.key)) return towerCache.get(spec.key);
    const h = ED.U.hash(spec.key);
    const d = spec.dom, s = spec.sec || spec.dom, t3 = spec.third;
    const look = {
      base: pick('tower', 'Bases', d, h),
      core: pick('tower', 'Cores', d, h >>> 3),
      top: (spec.pattern === 'splash' || spec.pattern === 'quake' || spec.pattern === 'multi') && spec.tier >= 2
        ? pick('tower', 'Turrets', d, h >>> 5) : pick('tower', 'Tops', spec.tier >= 2 ? d : d, h >>> 5),
      crystal: spec.tier >= 2 ? pick('tower', 'Crystals', s, h >>> 7) : null,
      crystal3: t3 ? pick('tower', 'Crystals', t3, h >>> 11) : null,
      ring: spec.tier >= 3 ? pick('tower', 'Rings', d, h >>> 9) : null,
      wings: spec.tier >= 4 ? pick('tower', 'Wings_Emblems', s, h >>> 13) : null,
      aura: spec.tier >= 5 ? pick('tower', 'Effects', d, h >>> 15) : null,
      addon: spec.tier >= 3 && (h & 1) ? pick('tower', 'Structure_Addons', d, h >>> 17) : null,
      scale: 0.62 + 0.06 * spec.tier,
    };
    // pre-compose static body
    const W = 150, H = 190, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const col = ED.ELEMENT[d].color;
    const cx = W / 2, by = H - 12; // base bottom
    if (look.wings) { const p = look.wings; const ww = 120, wh = ww * p.h / p.w; g.globalAlpha = 0.95; g.drawImage(tinted(p, ED.ELEMENT[s].color, 0.18), cx - ww / 2, by - 125 - wh / 2, ww, wh); g.globalAlpha = 1; }
    const bw = 84, bh = bw * look.base.h / look.base.w;
    if (look.addon) { const p = look.addon; const aw = 34, ah = aw * p.h / p.w; g.drawImage(IMG.tower, p.x, p.y, p.w, p.h, cx + 22, by - bh - ah * 0.55, aw, ah); }
    const cw = 50, ch = Math.min(80, cw * look.core.h / look.core.w);
    const coreY = by - bh * 0.62 - ch;
    g.drawImage(tinted(look.core, col, 0.16), cx - cw / 2, coreY, cw, ch);
    g.drawImage(tinted(look.base, col, 0.12), cx - bw / 2, by - bh, bw, bh);
    const tw = look.top === look.core ? 0 : 54, th = tw * look.top.h / look.top.w;
    g.drawImage(tinted(look.top, col, 0.14), cx - tw / 2, coreY - th * 0.72, tw, th);
    look.canvas = c; look.W = W; look.H = H; look.topY = coreY - th * 0.72 - H + 12; // relative to base bottom
    look.muzzleY = coreY - th * 0.3 - (H - 12);
    towerCache.set(spec.key, look);
    return look;
  };

  /* วาดหอ (มีแอนิเมชันลอยตัว คริสตัล วงแหวน ออร่า) */
  ED.drawTower = function (ctx, spec, x, y, t, opts) {
    const look = ED.towerLook(spec); const sc = look.scale * (opts && opts.scale || 1);
    const el = ED.ELEMENT[spec.dom];
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    // เงา
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, -6, 40, 13, 0, 0, Math.PI * 2); ctx.fill();
    if (look.ring) { // วงแหวนเวทใต้ฐาน
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 3);
      ctx.scale(1, 0.38); ctx.rotate(t * 0.8); const p = look.ring; const rw = 118; ED.drawPart(ctx, p, -rw / 2, -rw / 2 - 18, rw, rw); ctx.restore();
    }
    if (look.aura) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 + 0.2 * Math.sin(t * 2.3);
      ctx.translate(0, -95); ctx.rotate(t * 0.6); const p = look.aura; ED.drawPart(ctx, p, -60, -60, 120, 120); ctx.restore();
    }
    // glow
    const glow = ED.FX.glowSprite(spec.dom);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.12 * Math.sin(t * 2.5 + x);
    ctx.drawImage(glow, -55, look.topY - 30, 110, 110); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    const recoil = opts && opts.recoil ? opts.recoil * 5 : 0;
    ctx.drawImage(look.canvas, -look.W / 2, -look.H + 12 + recoil);
    // คริสตัลลอย (ธาตุรอง) + ธาตุที่ 3
    const fy = look.topY - 26 + Math.sin(t * 2 + x * 0.01) * 5;
    if (look.crystal) { const p = look.crystal; const w = 26, h = w * p.h / p.w; ctx.drawImage(tinted(p, ED.ELEMENT[spec.sec || spec.dom].color, 0.1), -w / 2, fy - h, w, h); }
    if (look.crystal3) {
      for (let i = 0; i < 2; i++) { const a = t * 1.6 + i * Math.PI; const p = look.crystal3; const w = 15, h = w * p.h / p.w; ctx.drawImage(IMG.tower, p.x, p.y, p.w, p.h, Math.cos(a) * 34 - w / 2, fy + 18 + Math.sin(a) * 8 - h, w, h); }
    }
    // ลูกแก้วธาตุโคจร (แสดงองค์ประกอบ)
    if (spec.u > 1) {
      ctx.globalCompositeOperation = 'lighter';
      let i = 0; const n = Math.min(spec.u, 16);
      for (let e = 0; e < 6; e++) for (let k = 0; k < spec.counts[e]; k++) {
        const a = t * 1.2 + (i / n) * Math.PI * 2; const ox = Math.cos(a) * 44, oy = -40 + Math.sin(a) * 12;
        ctx.drawImage(ED.FX.glowSprite(ED.EL[e]), ox - 8, oy - 8, 16, 16); i++;
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    return look;
  };

  /* ================= MONSTER LOOK ================= */
  ED.drawMonster = function (ctx, m, t) {
    const sp = m.sp; const Mm = M.monster;
    const core = byName['monster:' + Mm[sp.coreType][sp.core][0]];
    const sz = m.size * 1.35;
    const ch = 62 * sz, cw = ch * core.w / core.h;
    const bob = m.flying ? Math.sin(t * 5 + m.id) * 5 - 16 : Math.abs(Math.sin(t * 8 * m.spdMul + m.id)) * -4;
    const squash = m.flying ? 1 : 1 + Math.sin(t * 16 * m.spdMul + m.id) * 0.04;
    const el = ED.ELEMENT[sp.el];
    ctx.save(); ctx.translate(m.x, m.y + 14);
    // เงา + วงธาตุ
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0, cw * 0.45, 8 * sz, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = el.color; ctx.globalAlpha = 0.7; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, cw * 0.5, 9 * sz, 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    if (m.stealthed) ctx.globalAlpha = 0.35;
    ctx.translate(0, bob);
    const face = m.face || 1; ctx.scale(face, 1);
    if (sp.aura >= 0) {
      const p = byName['monster:' + Mm.Effects[sp.aura][0]];
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (m.stealthed ? 0.2 : 0.55); const aw = cw * 1.5, ah = aw * p.h / p.w;
      ctx.drawImage(IMG.monster, p.x, p.y, p.w, p.h, -aw / 2, -ch * 0.5 - ah / 2, aw, ah); ctx.restore();
    }
    if (sp.tail >= 0) { const p = byName['monster:' + Mm.Tail[sp.tail][0]]; const w = cw * 0.6, h = w * p.h / p.w; ctx.drawImage(IMG.monster, p.x, p.y, p.w, p.h, -cw * 0.55 - w * 0.4, -h * 0.9, w, h); }
    if (sp.wings >= 0) {
      const p = byName['monster:' + Mm.Wings[sp.wings][0]]; const flap = 0.75 + 0.25 * Math.sin(t * (m.flying ? 18 : 6) + m.id);
      const w = cw * 1.7, h = w * p.h / p.w;
      ctx.save(); ctx.translate(0, -ch * 0.62); ctx.scale(flap, 1); ctx.drawImage(tinted(p, el.color, 0.25), -w / 2, -h / 2, w, h); ctx.restore();
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = m.stealthed ? 0.15 : 0.45; ctx.drawImage(ED.FX.glowSprite(sp.el), -cw * 0.9, -ch * 1.15, cw * 1.8, ch * 1.4); ctx.restore();
    ctx.save(); ctx.scale(1 / squash, squash);
    ctx.drawImage(tinted(core, el.color, sp.tint), -cw / 2, -ch, cw, ch);
    if (m.hitFlash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = m.hitFlash * 3; ctx.drawImage(tinted(core, '#ffffff', 1), -cw / 2, -ch, cw, ch); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
    if (sp.horns >= 0) { const p = byName['monster:' + Mm.Horns[sp.horns][0]]; const w = cw * 0.8, h = w * p.h / p.w; ctx.drawImage(IMG.monster, p.x, p.y, p.w, p.h, -w / 2, -ch - h * 0.55, w, h); }
    if (sp.acc >= 0 && (m.elite || m.boss)) { const p = byName['monster:' + Mm.Accessories[sp.acc][0]]; const w = cw * (m.boss ? 0.62 : 0.5), h = w * p.h / p.w; ctx.drawImage(IMG.monster, p.x, p.y, p.w, p.h, -w / 2, -ch - h * 0.55, w, h); }
    ctx.restore();
    return { ch: ch - bob, cw };
  };

  /* ================= MAP BACKGROUND (cached) ================= */
  ED.buildMapCanvas = function (map) {
    const C = ED.CONFIG, W = map.cols * C.CELL, H = map.rows * C.CELL;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const bg = IMG['map' + map.mapImg];
    // cover
    const s = Math.max(W / bg.width, H / bg.height); const dw = bg.width * s, dh = bg.height * s;
    g.filter = 'blur(6px) saturate(1.2) brightness(0.9)'; g.drawImage(bg, (W - dw) / 2 - 6, (H - dh) / 2 - 6, dw + 12, dh + 12); g.filter = 'none';
    // พื้นผิวไบโอม (ชิ้นส่วน Terrain) ทับพื้นหลังให้เป็นพื้นดินจริง
    const gt = ED.part('env', map.biome.ground || map.biome.path);
    if (gt) {
      const gc = document.createElement('canvas'); gc.width = gc.height = 120; gc.getContext('2d').drawImage(IMG.env, gt.x + 3, gt.y + 3, gt.w - 6, gt.h - 6, 0, 0, 120, 120);
      g.save(); g.globalAlpha = Math.min(0.62, (map.biome.groundA || 0.25) * 1.8); g.fillStyle = g.createPattern(gc, 'repeat'); g.fillRect(0, 0, W, H); g.restore();
    }
    // ไล่สีให้เป็นพื้นดิน: มืดลงด้านล่าง + vignette
    let gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(10,8,20,0.10)'); gr.addColorStop(1, 'rgba(10,8,20,0.38)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // เงาพื้นใต้ดงของตกแต่ง
    for (const d of map.decor) { const x = d.c * C.CELL + 50, y = d.r * C.CELL + 60; const rg = g.createRadialGradient(x, y, 5, x, y, 75); rg.addColorStop(0, 'rgba(10,20,5,0.35)'); rg.addColorStop(1, 'rgba(10,20,5,0)'); g.fillStyle = rg; g.fillRect(x - 80, y - 80, 160, 160); }
    // ทางเดิน: texture pattern stroke (ชิ้นส่วนทางเดินจาก Terrain pack)
    const tile = ED.part('env', map.biome.path);
    const tc = document.createElement('canvas'); tc.width = tc.height = C.CELL; tc.getContext('2d').drawImage(IMG.env, tile.x + 2, tile.y + 2, tile.w - 4, tile.h - 4, 0, 0, C.CELL, C.CELL);
    const pat = g.createPattern(tc, 'repeat');
    const strokePaths = (w, style, alpha) => {
      g.save(); g.globalAlpha = alpha; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = w; g.strokeStyle = style;
      for (const p of map.paths) { g.beginPath(); p.forEach(([cc, rr], i) => { const x = cc * C.CELL + 50, y = rr * C.CELL + 50; i ? g.lineTo(x, y) : g.moveTo(x - (cc === 0 ? 60 : 0), y - (rr === 0 && i === 0 ? 60 : 0) + (rr === map.rows - 1 && i === 0 ? 60 : 0)); }); g.stroke(); }
      g.restore();
    };
    strokePaths(100, 'rgba(0,0,0,0.45)', 1);
    strokePaths(92, map.biome.edge, 1);
    strokePaths(80, pat, 1);
    strokePaths(80, 'rgba(0,0,0,0.12)', 1);
    strokePaths(22, map.biome.glow, 1);
    // หญ้า/ดอกไม้เล็ก
    for (const t of (map.tufts || [])) {
      const p = ED.part('env', t.prop); if (!p) continue;
      const w = p.w * t.s * 1.1, h = p.h * t.s * 1.1;
      g.save(); g.translate(t.x, t.y); if (t.flip) g.scale(-1, 1); g.globalAlpha = 0.95; g.drawImage(IMG.env, p.x, p.y, p.w, p.h, -w / 2, -h, w, h); g.restore();
    }
    // ของตกแต่ง
    const items = map.decor.slice().sort((a, b) => a.r - b.r);
    for (const d of items) {
      const p = ED.part('env', d.prop); if (!p) continue;
      const maxW = 96 * d.s, maxH = 120 * d.s; const sc = Math.min(maxW / p.w, maxH / p.h);
      const w = p.w * sc, h = p.h * sc, x = d.c * C.CELL + 50 + d.ox, y = d.r * C.CELL + 92 + (d.oy || 0);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x, y - 4, w * 0.38, 10, 0, 0, 7); g.fill();
      g.save(); g.translate(x, y); if (d.flip) g.scale(-1, 1); g.drawImage(IMG.env, p.x, p.y, p.w, p.h, -w / 2, -h, w, h); g.restore();
    }
    return c;
  };
  /* ช่องที่สร้างได้ (แคชแยก — สร้างใหม่เมื่อสมบัติแตกแล้วช่องว่างขึ้น) */
  ED.buildSlotCanvas = function (map) {
    const C = ED.CONFIG, W = map.cols * C.CELL, H = map.rows * C.CELL;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    for (let r = 0; r < map.rows; r++) for (let col = 0; col < map.cols; col++) {
      if (map.grid[r][col] !== 0) continue;
      const x = col * C.CELL, y = r * C.CELL;
      g.fillStyle = 'rgba(20,12,40,0.13)'; roundRect(g, x + 10, y + 10, C.CELL - 20, C.CELL - 20, 16); g.fill();
      g.strokeStyle = 'rgba(255,240,200,0.24)'; g.lineWidth = 2.5; const a = 16, m = 12;
      g.beginPath();
      g.moveTo(x + m, y + m + a); g.lineTo(x + m, y + m); g.lineTo(x + m + a, y + m);
      g.moveTo(x + C.CELL - m - a, y + m); g.lineTo(x + C.CELL - m, y + m); g.lineTo(x + C.CELL - m, y + m + a);
      g.moveTo(x + m, y + C.CELL - m - a); g.lineTo(x + m, y + C.CELL - m); g.lineTo(x + m + a, y + C.CELL - m);
      g.moveTo(x + C.CELL - m - a, y + C.CELL - m); g.lineTo(x + C.CELL - m, y + C.CELL - m); g.lineTo(x + C.CELL - m, y + C.CELL - m - a);
      g.stroke();
    }
    return c;
  };
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  ED.roundRect = roundRect;
})();
