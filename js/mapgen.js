/* ELEMENTAL DEFENDERS — Procedural map generation
   ทุกครั้งที่ผ่านด่านจะสุ่มแผนที่ใหม่: ภาพพื้นหลัง/ชุดทางเดิน/ของตกแต่งตามไบโอม,
   เส้นทางเดินแบบ self-avoiding walk ที่สั้นลงและมีทางเข้ามากขึ้นตามความยาก                 */
'use strict';
(function () {
  const U = ED.U;
  /* scenery = ของตกแต่งถาวร (บล็อกช่อง), tufts = ของเล็กไม่บล็อก, ground = พื้นผิวทับพื้นหลัง */
  ED.BIOMES = [
    { id: 'meadow', th: 'ทุ่งหญ้าเขียวขจี', maps: [1, 2, 3, 4, 5], path: 'tile005', ground: 'tile006', groundA: 0.32, edge: '#5b3b1c', glow: 'rgba(255,240,180,0.10)', scenery: [91, 92, 93, 95, 120, 83, 97, 96], tufts: [96, 97, 89] },
    { id: 'village', th: 'หมู่บ้านชายแดน', maps: [6, 7, 8, 9, 10], path: 'tile002', ground: 'tile004', groundA: 0.3, edge: '#3d3a3a', glow: 'rgba(255,230,170,0.10)', scenery: [91, 95, 106, 107, 119, 97, 120, 96], tufts: [96, 97, 89] },
    { id: 'desert', th: 'ซากปรักหักพังทะเลทราย', maps: [11, 12, 13], path: 'tile018', ground: 'tile005', groundA: 0.3, edge: '#7a5426', glow: 'rgba(255,190,110,0.12)', scenery: [83, 86, 87, 119, 120, 111, 108, 117], tufts: [85, 73] },
    { id: 'volcano', th: 'ภูเขาไฟเพลิงนรก', maps: [14, 15], path: 'tile012', ground: 'tile002', groundA: 0.28, edge: '#2a0d06', glow: 'rgba(255,90,30,0.14)', scenery: [89, 83, 86, 108, 107], tufts: [85, 73] },
    { id: 'ice', th: 'ธารน้ำแข็งนิรันดร์', maps: [16, 17, 18, 19, 20], path: 'tile013', ground: 'tile013', groundA: 0.22, edge: '#2d4f7a', glow: 'rgba(180,230,255,0.12)', scenery: [94, 83, 44, 95, 94], tufts: [44, 85] },
    { id: 'mystic', th: 'ถ้ำคริสตัลลึกลับ', maps: [21, 22, 23, 24], path: 'tile014', ground: 'tile014', groundA: 0.2, edge: '#2a1450', glow: 'rgba(200,120,255,0.12)', scenery: [109, 112, 83, 97, 96], tufts: [112, 97] },
    { id: 'haunted', th: 'สุสานต้องสาป', maps: [25], path: 'tile014', ground: 'tile002', groundA: 0.25, edge: '#1a1030', glow: 'rgba(140,120,255,0.10)', scenery: [86, 87, 117, 118, 116, 109, 110], tufts: [86, 85] },
    { id: 'sky', th: 'นครลอยฟ้า', maps: [26, 27, 28], path: 'tile001', ground: 'tile017', groundA: 0.28, edge: '#5a6a80', glow: 'rgba(255,255,220,0.12)', scenery: [119, 120, 107, 108, 106, 96], tufts: [96, 97] },
    { id: 'cosmic', th: 'ห้วงจักรวาล', maps: [29, 30], path: 'tile015', ground: 'tile014', groundA: 0.22, edge: '#160a30', glow: 'rgba(170,110,255,0.14)', scenery: [109, 112, 70, 69, 83], tufts: [112] },
  ];
  /* สมบัติ/วัตถุที่ยิงแตกได้ */
  ED.LOOT = {
    crate:    { th: 'ลังเสบียง',   icon: '🪙', props: [101, 102, 103, 105], hp: 1.0, el: 'EARTH', w: 34, desc: 'ทองเล็กน้อย' },
    chest:    { th: 'หีบสมบัติ',   icon: '💰', props: [104], hp: 2.4, el: 'LIGHT', w: 18, desc: 'ทองก้อนใหญ่ + โอกาส 35% ได้หอฟรี' },
    crystal:  { th: 'ผลึกธาตุ',    icon: '🏯', props: null, hp: 2.8, el: null, w: 24, desc: 'ได้หอ Tier Ⅱ ธาตุนั้นฟรี ณ จุดที่แตก' },
    mushroom: { th: 'เห็ดเยียวยา', icon: '❤', props: [99, 98], hp: 0.8, el: 'WIND', w: 14, desc: 'ฟื้นเลือดปราสาท +8' },
    fountain: { th: 'น้ำพุมนตรา',  icon: '⚗', props: [76], hp: 2.0, el: 'WATER', w: 10, desc: 'ได้ตั๋วผสมฟรี 1 ใบ + ฟื้นปราสาท +4' },
  };
  ED.CRYSTAL_PROP = { WATER: [77, 79], DARK: [78, 80], FIRE: [81], LIGHT: [82], EARTH: [84], WIND: [88] };
  ED.makeLoot = function (rng, c, r) {
    const keys = Object.keys(ED.LOOT); let tot = keys.reduce((a, k) => a + ED.LOOT[k].w, 0), x = rng() * tot, kind = keys[0];
    for (const k of keys) { x -= ED.LOOT[k].w; if (x <= 0) { kind = k; break; } }
    const L = ED.LOOT[kind]; const el = L.el || rng.pick(ED.EL);
    const pid = kind === 'crystal' ? rng.pick(ED.CRYSTAL_PROP[el]) : rng.pick(L.props);
    return { c, r, kind, el, prop: 'prop' + String(pid).padStart(3, '0') };
  };


  const DIRS = [[1, 0], [0, 1], [0, -1], [-1, 0]];

  /* เดินบนโครงตาข่ายหยาบ (ทุก 2 ช่อง) — รับประกันว่าทางเดินไม่ชิดกันเอง */
  function coarseWalk(rng, CW, CH, blocked, start, isGoal, minL, maxL) {
    const path = [start]; const seen = new Set([start.join(',')]); let budget = 6000;
    function rec() {
      if (--budget < 0) return false;
      const [x, y] = path[path.length - 1];
      if (path.length >= minL && isGoal(x, y)) return true;
      if (path.length >= maxL) return false;
      const w = DIRS.map(d => ({ d, w: (d[0] === 1 ? 1.6 : d[0] === -1 ? 0.7 : 1.2) * (0.3 + rng()) })).sort((a, b) => b.w - a.w);
      for (const { d } of w) {
        const nx = x + d[0], ny = y + d[1], k = nx + ',' + ny;
        if (nx < 0 || ny < 0 || nx >= CW || ny >= CH || seen.has(k) || (blocked && blocked.has(k))) continue;
        path.push([nx, ny]); seen.add(k);
        if (rec()) return true;
        path.pop(); seen.delete(k);
      }
      return false;
    }
    return rec() ? path : null;
  }
  function expand(cpath, ox, oy) {   // แปลงโหนดหยาบ → ช่องจริง (เติมช่องเชื่อมตรงกลาง)
    const out = [];
    cpath.forEach(([x, y], i) => {
      const fx = ox + x * 2, fy = oy + y * 2;
      if (i > 0) { const [px, py] = cpath[i - 1]; out.push([ox + px * 2 + (x - px), oy + py * 2 + (y - py)]); }
      out.push([fx, fy]);
    });
    return out;
  }

  ED.generateMap = function (stage, seed) {
    const C = ED.CONFIG, cols = C.COLS, rows = C.ROWS;
    const rng = U.rng(seed);
    const biome = ED.BIOMES[Math.floor((stage - 1) / 2) % ED.BIOMES.length];
    const mapImg = rng.pick(biome.maps);
    // ความยาวเป้าหมาย: ด่านแรกทางยาวคดเคี้ยว ด่านหลังสั้นลง
    const target = Math.round(Math.max(26, 52 - stage * 0.9));
    const oy = rng() < 0.5 ? 0 : 1;                       // แถวโหนด 0,2,4,6,8 หรือ 1,3,5,7
    const CW = 8, CH = oy ? 4 : 5;                          // โหนดคอลัมน์ x=0..14 (เข้าทางซ้าย) ปราสาทที่ x=15
    let main = null, best = null;
    for (let tries = 0; tries < 30 && !main; tries++) {
      const minL = Math.max(8, Math.round((target - 2) / 2) - 2 - Math.floor(tries / 6));
      const cp = coarseWalk(rng, CW, CH, null, [0, rng.int(CH)], (x, y) => x === CW - 1 && (oy + y * 2) >= 1, minL, minL + 6);
      if (cp) main = cp; else if (!best) best = null;
    }
    if (!main) { main = []; for (let x = 0; x < CW; x++) main.push([x, 1]); }
    const mainC = main;
    let mainF = expand(mainC, 0, oy); const last = mainF[mainF.length - 1]; mainF.push([last[0] + 1, last[1]]);
    const grid = []; for (let r = 0; r < rows; r++) grid.push(new Array(cols).fill(0));
    mainF.forEach(([c, r]) => grid[r][c] = 1);
    const paths = [mainF];
    let spawnCount = 1;
    if (stage >= 6 && (stage % 3 === 0 || stage >= 15)) spawnCount = 2;
    if (stage >= 25 && stage % 4 === 0) spawnCount = 3;
    const blocked = new Set(mainC.map(p => p.join(',')));
    for (let s = 1; s < spawnCount; s++) {
      let ex = null;
      for (let tries = 0; tries < 40 && !ex; tries++) {
        const top = rng() < 0.5; const sx = 1 + rng.int(CW - 3), sy = top ? 0 : CH - 1;
        if (blocked.has(sx + ',' + sy)) continue;
        const goal = (x, y) => DIRS.some(([dx, dy]) => { const i = mainC.findIndex(p => p[0] === x + dx && p[1] === y + dy); return i > 0 && i < mainC.length - 2; });
        ex = coarseWalk(rng, CW, CH, blocked, [sx, sy], goal, 2, 7);
      }
      if (!ex) break;
      const end = ex[ex.length - 1];
      let ji = -1; for (const [dx, dy] of DIRS) { const i = mainC.findIndex(p => p[0] === end[0] + dx && p[1] === end[1] + dy); if (i > 0 && i < mainC.length - 2 && (ji < 0 || i < ji)) ji = i; }
      ex.forEach(p => blocked.add(p.join(',')));
      // ต่อเข้ากับเส้นหลัก
      const exF = expand(ex.concat([mainC[ji]]), 0, oy);
      exF.pop();
      // ช่องขอบ: เริ่มจากขอบจอจริง
      const st = exF[0];
      if (st[1] === 1) exF.unshift([st[0], 0]); else if (st[1] === rows - 2) exF.unshift([st[0], rows - 1]);
      exF.forEach(([c, r]) => grid[r][c] = 1);
      const jF = mainF.findIndex(p => p[0] === mainC[ji][0] * 2 && p[1] === oy + mainC[ji][1] * 2);
      paths.push(exF.concat(mainF.slice(jF)));
    }
    // ทางเข้าหลัก: ถ้าเริ่มที่แถวที่ไม่ใช่ขอบให้เริ่มที่คอลัมน์ 0 อยู่แล้ว
    const main_ = mainF;
    const end = main_[main_.length - 1];
    const castle = { c: end[0], r: end[1] };
    // ช่องปราสาท: ช่องเหนือปราสาทถูกบล็อก
    if (castle.r - 1 >= 0 && grid[castle.r - 1][castle.c] === 0) grid[castle.r - 1][castle.c] = 3;
    // ระยะห่างจากทางเดิน (BFS)
    const dist = []; for (let r = 0; r < rows; r++) dist.push(new Array(cols).fill(99));
    const q = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (grid[r][c] === 1) { dist[r][c] = 0; q.push([c, r]); }
    while (q.length) { const [c, r] = q.shift(); for (const [dx, dy] of DIRS) { const nc = c + dx, nr = r + dy; if (nc >= 0 && nr >= 0 && nc < cols && nr < rows && dist[nr][nc] > dist[r][c] + 1) { dist[nr][nc] = dist[r][c] + 1; q.push([nc, nr]); } } }
    const nearCastle = (c, r) => Math.abs(c - castle.c) <= 1 && Math.abs(r - castle.r) <= 1;
    // ฉากตกแต่ง: จับกลุ่มเป็นดง วางห่างทางเดินและชิดขอบ
    const decor = [];
    const nDecor = Math.min(18, 7 + Math.floor(stage / 3));
    const score = (c, r) => (dist[r][c] >= 2 ? 2 : dist[r][c] === 1 ? 0.15 : 0) + (c === 0 || r === 0 || c === cols - 1 || r === rows - 1 ? 1 : 0) + rng() * 0.8;
    const place = (c, r, pid) => { grid[r][c] = 2; decor.push({ c, r, prop: 'prop' + String(pid).padStart(3, '0'), s: rng.range(0.9, 1.15), ox: rng.range(-10, 10), oy: rng.range(-6, 6), flip: rng() < 0.5 }); };
    let guard = 0;
    while (decor.length < nDecor && guard++ < 400) {
      let best = null, bs = -1;
      for (let i = 0; i < 14; i++) { const c = rng.int(cols), r = rng.int(rows); if (grid[r][c] !== 0 || nearCastle(c, r)) continue; const sc = score(c, r); if (sc > bs) { bs = sc; best = [c, r]; } }
      if (!best || bs < 0.5) continue;
      const theme = rng.pick(biome.scenery);
      place(best[0], best[1], theme);
      // เติมดงรอบๆ 1-2 ชิ้น (ต้นไม้/หินชนิดใกล้เคียง)
      const grow = rng.int(3);
      for (let g = 0; g < grow && decor.length < nDecor; g++) {
        const [dx, dy] = rng.pick(DIRS); const nc = best[0] + dx, nr = best[1] + dy;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || grid[nr][nc] !== 0 || dist[nr][nc] < 2 || nearCastle(nc, nr)) continue;
        place(nc, nr, rng() < 0.6 ? theme : rng.pick(biome.scenery));
      }
    }
    // สมบัติที่ยิงแตกได้ วางใกล้ทางเดิน (ในระยะหอ)
    const loot = [];
    const nLoot = Math.min(7, 3 + Math.floor(stage / 5));
    guard = 0;
    while (loot.length < nLoot && guard++ < 400) {
      const c = rng.int(cols), r = rng.int(rows);
      if (grid[r][c] !== 0 || nearCastle(c, r) || dist[r][c] < 1 || dist[r][c] > 2) continue;
      if (loot.some(l => Math.abs(l.c - c) + Math.abs(l.r - r) < 3)) continue;
      grid[r][c] = 2; loot.push(ED.makeLoot(rng, c, r));
    }
    // หญ้า/ดอกไม้เล็ก ไม่บล็อก ตามขอบทางเดิน
    const tufts = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (grid[r][c] === 1 || rng() > 0.22) continue;
      const corner = rng.int(4);
      tufts.push({ x: c * C.CELL + (corner % 2 ? 84 : 16) + rng.range(-4, 4), y: r * C.CELL + (corner > 1 ? 94 : 30), prop: 'prop' + String(rng.pick(biome.tufts)).padStart(3, '0'), s: rng.range(0.36, 0.5), flip: rng() < 0.5 });
    }
    const sparkles = []; for (let i = 0; i < 40; i++) sparkles.push({ x: rng() * cols * C.CELL, y: rng() * rows * C.CELL, p: rng() * 6.28, s: rng.range(0.5, 1.2) });
    return { stage, seed, cols, rows, grid, paths, castle, decor, loot, tufts, dist, biome, mapImg, spawnCount: paths.length, sparkles };
  };

})();
