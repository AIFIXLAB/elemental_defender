/* ELEMENTAL DEFENDERS — UI, input, screens, main loop */
'use strict';
(function () {
  const $ = (s) => document.querySelector(s);
  const C = ED.CONFIG, U = ED.U, EL = ED.EL;
  const ui = ED.ui = { mode: 'idle', placing: null, mergeList: [], selected: null, game: null, view: {}, speed: 1, paused: false };
  let cv, ctx, dpr = 1, k = 1, last = 0;

  /* ================= SCREENS ================= */
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    if (id === 'scr-title' || id === 'scr-world' || id === 'scr-bye') ED.Audio.music('title');
  }
  function click() { ED.Audio.init(); ED.Audio.play('click'); }

  /* ================= MODAL ================= */
  function modal(html, cls) {
    const box = $('#modal-box'); box.className = 'modal ' + (cls || ''); box.innerHTML = html; $('#modal').classList.remove('hidden');
    return box;
  }
  function closeModal() { $('#modal').classList.add('hidden'); $('#modal-box').innerHTML = ''; }
  ui.closeModal = closeModal;
  function confirmBox(title, text, okLabel, onOk, danger) {
    const b = modal(`<h2>${title}</h2><p>${text}</p><div class="acts"><button class="btn ghost" data-a="no">ยกเลิก</button><button class="btn ${danger ? 'red' : 'gold'}" data-a="ok">${okLabel}</button></div>`, 'small');
    b.querySelector('[data-a=no]').onclick = () => { click(); closeModal(); };
    b.querySelector('[data-a=ok]').onclick = () => { click(); closeModal(); onOk(); };
  }

  /* ================= TITLE ================= */
  function initTitle() {
    $('#t-new').onclick = () => {
      click();
      if (ED.save.hasProgress() && (ED.save.data.highest > 1 || Object.keys(ED.save.data.discovered).length > 6))
        confirmBox('เริ่มเกมใหม่?', `มีข้อมูลเซฟเดิม (ผ่านถึงด่าน ${ED.save.data.highest - 1}, ⭐${ED.save.totalStars()}) การเริ่มใหม่จะลบเซฟเดิมทั้งหมด`, 'เริ่มใหม่', () => { ED.save.newGame(); openWorld(); briefing(1); }, true);
      else { ED.save.newGame(); openWorld(); briefing(1); }
    };
    $('#t-load').onclick = () => {
      click();
      if (!ED.save.hasProgress()) { confirmBox('ยังไม่มีเซฟ', 'ยังไม่พบข้อมูลเกมในเบราว์เซอร์นี้ เริ่มเกมใหม่เลยไหม?', 'เริ่มเกม', () => { ED.save.newGame(); openWorld(); briefing(1); }); return; }
      openWorld();
    };
    $('#t-set').onclick = () => { click(); settings(); };
    $('#t-exit').onclick = () => { click(); confirmBox('ออกจากเกม?', 'ความคืบหน้าถูกบันทึกไว้ในเบราว์เซอร์นี้แล้ว', 'ออกเกม', () => { show('scr-bye'); try { window.close(); } catch (e) { } }); };
    $('#bye-back').onclick = () => { click(); show('scr-title'); };
  }

  /* ================= SETTINGS ================= */
  function settings(fromGame) {
    const S = ED.settings;
    const seg = (key, opts) => `<div class="seg" data-k="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${S[key] == v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const b = modal(`<button class="close">×</button><h2>⚙ ตั้งค่า</h2>
      <div class="set-row"><span>🎵 เพลงประกอบ</span>${seg('music', [[true, 'เปิด'], [false, 'ปิด']])}</div>
      <div class="set-row"><span>ระดับเพลง</span><input type="range" min="0" max="1" step="0.05" value="${S.mvol}" id="s-mvol"></div>
      <div class="set-row"><span>🔊 เสียงเอฟเฟกต์</span>${seg('sound', [[true, 'เปิด'], [false, 'ปิด']])}</div>
      <div class="set-row"><span>ระดับเอฟเฟกต์</span><input type="range" min="0" max="1" step="0.05" value="${S.vol}" id="s-vol"></div>
      <div class="set-row"><span>คุณภาพเอฟเฟกต์</span>${seg('quality', [[0.5, 'ต่ำ'], [1, 'ปกติ'], [1.5, 'สูง']])}</div>
      <div class="set-row"><span>สั่นหน้าจอ</span>${seg('shake', [[1, 'เปิด'], [0, 'ปิด']])}</div>
      <div class="set-row"><span>ข้อมูลเซฟ</span><button class="btn red" id="s-wipe">ลบข้อมูลเซฟทั้งหมด</button></div>
      <p style="font-size:12px">เซฟเกมเก็บไว้ในเบราว์เซอร์ของคุณ (localStorage) อัตโนมัติ — คนอื่นที่เปิดเว็บเดียวกันจะไม่เห็นเซฟของคุณ ไม่ต้องตั้งรหัส</p>
      <div class="acts"><button class="btn gold" id="s-ok">ตกลง</button></div>`, 'small');
    b.querySelectorAll('.seg').forEach(sg => sg.querySelectorAll('button').forEach(bt => bt.onclick = () => {
      const key = sg.dataset.k; let v = bt.dataset.v; v = v === 'true' ? true : v === 'false' ? false : parseFloat(v);
      S[key] = v; sg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === bt)); applySettings(); click();
    }));
    b.querySelector('#s-vol').oninput = (e) => { S.vol = parseFloat(e.target.value); applySettings(); };
    b.querySelector('#s-mvol').oninput = (e) => { S.mvol = parseFloat(e.target.value); applySettings(); };
    b.querySelector('#s-wipe').onclick = () => confirmBox('ลบเซฟทั้งหมด?', 'ข้อมูลด่าน ดาว และสมุดค้นพบจะหายทั้งหมด', 'ลบเลย', () => { ED.save.wipe(); if (!fromGame) show('scr-title'); }, true);
    const done = () => { click(); closeModal(); if (fromGame) pauseMenu(); };
    b.querySelector('#s-ok').onclick = done; b.querySelector('.close').onclick = done;
  }
  function applySettings() { ED.Audio.apply(); ED.FX.quality = ED.settings.quality; ED.save.saveSettings(); resize(); }

  /* ================= WORLD MAP ================= */
  function openWorld() {
    show('scr-world');
    const d = ED.save.data;
    $('#world-bg').style.backgroundImage = `url(assets/maps/map${String(21 + (d.highest * 7) % 10).padStart(2, '0')}.jpg)`;
    $('#w-sub').textContent = `⭐ ${ED.save.totalStars()} ดาว · ค้นพบหอ ${Object.keys(d.discovered).length.toLocaleString()} / ${ED.countAllTowerForms().toLocaleString()} แบบ`;
    const cont = $('#w-continue');
    if (d.current && d.current.snap) {
      cont.classList.remove('hidden');
      cont.innerHTML = `<span>⚔ มีด่านที่เล่นค้างไว้: <b>ด่าน ${d.current.stage}</b> · เวฟ ${d.current.snap.waveIdx}/${d.current.snap.waveCount === 0 ? '∞' : (d.current.snap.waveCount || 50)} · ทอง ${d.current.snap.gold} · หอ ${d.current.snap.towers.length} ต้น</span><span><button class="btn ghost" id="c-drop">ทิ้ง</button> <button class="btn gold" id="c-go">เล่นต่อ ▶</button></span>`;
      $('#c-go').onclick = () => { click(); startStage(d.current.stage, d.current.seed, d.current.snap); };
      $('#c-drop').onclick = () => { click(); ED.save.clearCurrent(); openWorld(); };
    } else cont.classList.add('hidden');
    const grid = $('#stage-grid'); grid.innerHTML = '';
    const maxShow = Math.max(d.highest + 6, 12);
    for (let s = 1; s <= maxShow; s++) {
      const bio = ED.BIOMES[Math.floor((s - 1) / 2) % ED.BIOMES.length];
      const st = d.stars[s] || 0, locked = s > d.highest;
      const b = document.createElement('button');
      b.className = 'stage' + (locked ? ' locked' : '') + (s === d.highest ? ' next' : '');
      b.style.backgroundImage = `url(assets/maps/map${String(bio.maps[s % bio.maps.length]).padStart(2, '0')}.jpg)`;
      const spawns = s >= 6 && (s % 3 === 0 || s >= 15) ? (s >= 25 && s % 4 === 0 ? 3 : 2) : 1;
      b.innerHTML = `<span class="num">${s}</span>${spawns > 1 ? `<span class="tag">ทางเข้า ×${spawns}</span>` : s % 5 === 0 ? '<span class="tag">บอสคู่</span>' : ''}<span class="bio">${bio.th}</span><span class="stars">${[1, 2, 3].map(i => `<span class="${i <= st ? 'on' : 'off'}">★</span>`).join('')}</span>`;
      b.onclick = () => { click(); briefing(s); };
      grid.appendChild(b);
    }
    const nx = grid.querySelector('.next'); if (nx) nx.scrollIntoView({ block: 'center' });
  }

  const waveLabel = (n) => n ? String(n) : '∞';
  function briefing(stage) {
    const seed = ED.save.seedFor(stage); ED.save.persist();
    const mode = ED.save.data.waveMode != null ? ED.save.data.waveMode : 50;
    const map = ED.generateMap(stage, seed);
    const waves = ED.makeWaves(stage, seed, map.paths.length, mode || Infinity);
    const tl = ED.timeLimitFor(waves);
    const gem = e => `<span class="gem" style="color:${ED.ELEMENT[e].color};background:${ED.ELEMENT[e].color}"></span>`;
    const show = Math.min(30, isFinite(waves.length) ? waves.length : 30);
    let rows = ''; for (let i = 0; i < show; i++) { const w = waves[i]; rows += `<div${w.boss ? ' class="bossrow"' : ''}><b style="width:52px">เวฟ ${i + 1}</b>${w.elements.map(gem).join('')}<span>${w.groups.map(g => (g.boss === true ? '👑' : g.boss ? '♛' : g.elite ? '★' : '') + ED.TRAITS[g.sp.trait].th + '×' + g.n).join(' · ')}</span></div>`; }
    rows += `<div style="opacity:.75">… ${mode ? `ต่อไปจนถึงเวฟ ${mode}` : 'ต่อไปเรื่อยๆ ไม่มีที่สิ้นสุด'} — เวฟถัดไปจะสุ่มสร้างใหม่ตอนเล่นถึง</div>`;
    const best = (ED.save.data.best || {})[stage];
    const b = modal(`<button class="close">×</button><h2>ด่าน ${stage} · ${map.biome.th}</h2>
      <div class="wmode"><span>จำนวนเวฟ</span>${ED.WAVE_MODES.map(n => `<button data-n="${n}" class="${n === mode ? 'on' : ''}">${waveLabel(n)}</button>`).join('')}</div>
      <div class="brief"><div><div class="pic" style="background-image:url(assets/maps/map${String(map.mapImg).padStart(2, '0')}.jpg)"></div>
      <p>🏰 เลือดปราสาท <b>${C.CASTLE_HP}</b> · ⏳ เวลา <b>${isFinite(tl) ? fmtTime(tl) : 'ไม่จำกัด'}</b> · ⚔ <b>${waveLabel(mode)}</b> เวฟ · 🚪 ทางเข้า <b>${map.paths.length}</b> · 🛤 ทางยาว <b>${map.paths[0].length}</b> ช่อง</p>
      <p style="font-size:13px">♛ มินิบอสทุก 10 เวฟ · 👑 บอสใหญ่ทุก 25 เวฟ${mode ? ' และเวฟสุดท้าย' : ''} (เวฟ 100+ มาเป็นฝูงบอส) · 💰 สมบัติ <b>${map.loot.length}</b> ชิ้น เกิดใหม่ทุก 10 เวฟ</p>
      <p style="font-size:13px">${mode ? '⭐⭐⭐ เลือด ≥80% และไม่เกินเวลา · ⭐⭐ ≥40% · ⭐ รอด (เกินเวลา = สูงสุด 1 ดาว)' : `โหมดไม่จำกัด: รอดให้นานที่สุด · ⭐ 50 เวฟ · ⭐⭐ 100 · ⭐⭐⭐ 200${best ? ` · สถิติเดิม <b>${best}</b> เวฟ` : ''}`}</p></div>
      <div><b>มอนสเตอร์ที่คาดว่าจะเจอ</b><div class="wave-list">${rows}</div></div></div>
      <div class="acts"><button class="btn ghost" id="b-new">🎲 สุ่มแผนที่ใหม่</button><button class="btn gold big" id="b-go">⚔ เริ่มด่าน</button></div>`);
    b.querySelectorAll('.wmode button').forEach(x => x.onclick = () => { click(); ED.save.data.waveMode = +x.dataset.n; ED.save.persist(); briefing(stage); });
    b.querySelector('.close').onclick = () => { click(); closeModal(); };
    b.querySelector('#b-new').onclick = () => { click(); delete ED.save.data.seeds[stage]; briefing(stage); };
    b.querySelector('#b-go').onclick = () => { click(); closeModal(); startStage(stage, seed, null, mode); };
  }

  /* ================= GAME START ================= */
  function startStage(stage, seed, resume, waveCount) {
    ED.FX.clear();
    closeModal();
    const g = ui.game = new ED.Game({ stage, seed, resume, waveCount: resume ? (resume.waveCount != null ? resume.waveCount : 50) : (waveCount != null ? waveCount : 50) });
    ui.mode = 'idle'; ui.placing = null; ui.mergeList = []; ui.selected = null; ui.view = {}; ui.paused = false;
    ui.speed = 1; $('#h-speed').textContent = '×1';
    show('scr-game'); buildDock(); hidePanel(); hideRadial(); resize();
    $('#h-stage').textContent = `ด่าน ${stage} · ${g.map.biome.th} · ${g.endless ? '∞' : g.waveCount} เวฟ`;
    ED.save.autosave(g); ED.Audio.music('battle'); ED.Audio.setDuck(false);
    banner(`ด่าน ${stage}`, '#ffd25a');
    hint('วางหอบนแผ่นหินรูน แล้วกด ▶ เริ่มเวฟ · ผสมหอด้วยการลากหอทับกัน หรือแตะหอ → ⚗ ผสม');
  }
  ui.startStage = startStage;

  /* ================= CANVAS / LOOP ================= */
  function resize() {
    if (!ui.game) return;
    const play = $('#play'); const W = ui.game.W, H = ui.game.H;
    const aw = play.clientWidth, ah = play.clientHeight; if (!aw || !ah) return;
    const s = Math.min(aw / W, ah / H); const cw = Math.floor(W * s), ch = Math.floor(H * s);
    dpr = Math.min(window.devicePixelRatio || 1, ED.settings.quality >= 1.5 ? 2 : ED.settings.quality <= 0.5 ? 1 : 1.75);
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); k = cv.width / W;
  }
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    const g = ui.game; if (!g || !$('#scr-game').classList.contains('active')) return;
    if (!ui.paused && g.state !== 'won' && g.state !== 'lost') {
      for (let i = 0; i < ui.speed; i++) g.update(dt);
      ED.save.data.totals.playTime += dt;
    } else if (g.state === 'won' || g.state === 'lost') ED.FX.update(dt);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ui.view.selected = ui.selected; ui.view.merge = ui.mode === 'merge' ? ui.mergeList : null;
    ui.view.showSlots = ui.mode === 'place' || (ui.view.drag && !ui.view.dragTower);
    g.render(ctx, ui.view);
    if (g.state === 'run' && ED.Music) ED.Music.setIntensity(0.25 + 0.6 * Math.min(1, g.waveIdx / Math.min(g.waves.length, 100)) + Math.min(0.25, g.monsters.length / 120));
    if (g.state === 'run') { const boss = g.monsters.some(m => m.boss && m.alive); const want = boss ? 'boss' : 'battle'; if (ED.Audio.cur !== want && (ED.Audio.cur === 'battle' || ED.Audio.cur === 'boss' || !ED.Audio.cur)) ED.Audio.music(want); }
    hud();
    if (ui.selected && ui.mode === 'idle' && !$('#panel').classList.contains('hidden')) refreshPanelLive();
  }

  /* ================= HUD ================= */
  const hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
  function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function hud() {
    const g = ui.game;
    setText('#h-hp', String(Math.max(0, Math.ceil(g.castleHp))));
    const pct = Math.max(0, g.castleHp / g.castleMax * 100) + '%'; if (hudCache.hpw !== pct) { hudCache.hpw = pct; $('#h-hpfill').style.width = pct; $('#h-hpfill').style.background = g.castleHp / g.castleMax > 0.5 ? '' : g.castleHp / g.castleMax > 0.25 ? 'linear-gradient(90deg,#ffb02e,#ffd25a)' : 'linear-gradient(90deg,#ff3a3a,#ff7a5a)'; }
    setText('#h-gold', U.fmt(g.gold));
    if (hudCache.tok !== g.freeMerges) { hudCache.tok = g.freeMerges; $('#h-tokchip').classList.toggle('hidden', !g.freeMerges); $('#h-tok').textContent = g.freeMerges; }
    if (ui.view.selectedLoot) { const q = $('#panel .quick b'); if (q) q.textContent = U.fmt(Math.max(0, ui.view.selectedLoot.hp)); }
    setText('#h-wave', `${g.waveIdx}/${g.endless ? '∞' : g.waves.length}`);
    setText('#h-time', g.endless ? '∞' : g.overtime ? 'เกินเวลา!' : fmtTime(g.timeLeft));
    const warn = !g.endless && (g.overtime || (g.started && g.timeLeft < 30)); if (hudCache.warn !== warn) { hudCache.warn = warn; $('#h-timechip').classList.toggle('warn', warn); }
    // next wave preview
    const nw = g.waves[g.waveIdx];
    const key = g.waveIdx + ':' + (nw ? 1 : 0);
    if (hudCache.next !== key) {
      hudCache.next = key;
      $('#h-next').innerHTML = nw ? `<span style="color:var(--mut)">ถัดไป</span>` + nw.groups.map(gr => `<span class="gem" style="color:${ED.ELEMENT[gr.sp.el].color};background:${ED.ELEMENT[gr.sp.el].color}"></span><span>${gr.boss ? '👑' : gr.elite ? '★' : ''}${ED.TRAIT_ICON[gr.sp.trait] || '•'}×${gr.n}</span>`).join(' ') : '<span style="color:var(--mut)">เวฟสุดท้ายแล้ว!</span>';
    }
    let label, dis = false;
    if (!g.started) label = '▶ เริ่มเวฟ 1';
    else if (g.waveIdx >= g.waves.length) { label = '✔ ครบทุกเวฟ'; dis = true; }
    else { const bonus = Math.floor(g.nextWaveTimer * C.EARLY_CALL_BONUS * Math.pow(C.GOLD_GROWTH, g.stage - 1)); label = `⏩ เวฟ ${g.waveIdx + 1} · ${Math.ceil(g.nextWaveTimer)}s +${bonus}🪙`; }
    setText('#h-call', label);
    if (hudCache.dis !== dis) { hudCache.dis = dis; $('#h-call').disabled = dis; }
    // dock affordability
    const poor = g.gold < C.TOWER_COST; if (hudCache.poor !== poor) { hudCache.poor = poor; document.querySelectorAll('.bbtn').forEach(b => b.classList.toggle('poor', poor)); }
  }

  /* ================= DOCK ================= */
  function buildDock() {
    const d = $('#build'); d.innerHTML = '';
    EL.forEach(e => {
      const E = ED.ELEMENT[e]; const b = document.createElement('button');
      b.className = 'bbtn'; b.style.setProperty('--c', E.color); b.dataset.el = e;
      b.innerHTML = `<span class="em">${E.icon}</span><span class="nm">${E.th}</span><span class="cost">🪙${C.TOWER_COST}</span>`;
      b.onpointerdown = (ev) => { ED.Audio.init(); ui.dockDrag = { el: e, sx: ev.clientX, sy: ev.clientY, moved: false }; ev.preventDefault(); };
      d.appendChild(b);
    });
  }
  function setPlacing(e) {
    ui.placing = e; ui.mode = e ? 'place' : 'idle';
    document.querySelectorAll('.bbtn').forEach(b => b.classList.toggle('on', b.dataset.el === e));
    if (e) { hidePanel(); hideRadial(); ui.selected = null; hint(`กำลังวาง <b>หอ${ED.ELEMENT[e].th}</b> — แตะช่องสีเขียวเพื่อสร้าง (แตะปุ่มเดิมเพื่อยกเลิก)`); }
    else hint('แตะช่องว่างเพื่อสร้างหอ · แตะหอเพื่อดูข้อมูล · <b>ลากหอไปวางบนหออื่นเพื่อผสม</b>');
  }
  function hint(h) { $('#hint').innerHTML = h; }

  /* ================= INPUT ================= */
  function toLogical(ev) { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width * ui.game.W, (ev.clientY - r.top) / r.height * ui.game.H]; }
  function cellOf(x, y) { return [Math.floor(x / C.CELL), Math.floor(y / C.CELL)]; }
  function initInput() {
    let press = null;
    cv.addEventListener('pointerdown', (ev) => {
      if (!ui.game) return; ED.Audio.init();
      const [x, y] = toLogical(ev); const [c, r] = cellOf(x, y);
      press = { x, y, c, r, t: ui.game.towerAt(c, r), moved: false, sx: ev.clientX, sy: ev.clientY };
      cv.setPointerCapture(ev.pointerId);
    });
    window.addEventListener('pointermove', (ev) => {
      if (!ui.game) return;
      if (ui.dockDrag) {
        const dd = ui.dockDrag; if (!dd.moved && Math.hypot(ev.clientX - dd.sx, ev.clientY - dd.sy) > 10) dd.moved = true;
        if (dd.moved) { const [x, y] = toLogical(ev); ui.view.drag = { spec: ED.towerSpec(ED.basicCounts(dd.el)), x, y }; ui.view.dragTower = null; ui.view.hoverCell = cellOf(x, y); const spec = ui.view.drag.spec; ui.view.range = { x: Math.floor(x / 100) * 100 + 50, y: Math.floor(y / 100) * 100 + 50, r: spec.range * C.CELL, el: dd.el, ok: ui.game.cellFree(...ui.view.hoverCell) }; }
        return;
      }
      if (!press) return;
      const [x, y] = toLogical(ev);
      if (!press.moved && Math.hypot(ev.clientX - press.sx, ev.clientY - press.sy) > 12) press.moved = true;
      if (press.moved && press.t && ui.mode !== 'place') {
        ui.view.drag = { spec: press.t.spec, x, y }; ui.view.dragTower = press.t; hideRadial();
        const [c, r] = cellOf(x, y); const tgt = ui.game.towerAt(c, r);
        ui.view.range = tgt && tgt !== press.t ? { x: tgt.x, y: tgt.y, r: 60, el: tgt.spec.dom, ok: ED.mergeCheck([tgt, press.t], ui.game.gold).ok } : null;
      }
    });
    window.addEventListener('pointerup', (ev) => {
      if (!ui.game) return;
      if (ui.dockDrag) {
        const dd = ui.dockDrag; ui.dockDrag = null;
        if (dd.moved) {
          const [x, y] = toLogical(ev); const [c, r] = cellOf(x, y);
          ui.view.drag = null; ui.view.range = null; ui.view.hoverCell = null;
          if (x >= 0 && y >= 0 && x < ui.game.W && y < ui.game.H) doBuild(c, r, dd.el);
        } else { click(); setPlacing(ui.placing === dd.el ? null : dd.el); }
        return;
      }
      if (!press) return;
      const p = press; press = null;
      const [x, y] = toLogical(ev);
      if (p.moved && p.t && ui.view.dragTower) {
        ui.view.drag = null; ui.view.dragTower = null; ui.view.range = null;
        const [c, r] = cellOf(x, y); const tgt = ui.game.towerAt(c, r);
        if (tgt && tgt !== p.t) { ui.mode = 'merge'; ui.mergeList = [tgt, p.t]; ui.selected = tgt; mergePanel(); }
        return;
      }
      if (p.moved) return;
      tap(p.c, p.r, p.x, p.y);
    });
    window.addEventListener('resize', () => setTimeout(resize, 50));
    window.addEventListener('keydown', (e) => {
      if (!ui.game || !$('#scr-game').classList.contains('active')) return;
      if (e.key === 'Escape') { if (ui.mode !== 'idle') { setPlacing(null); ui.mode = 'idle'; ui.mergeList = []; hidePanel(); } else pauseMenu(); }
      if (e.key === ' ') { e.preventDefault(); callWave(); }
      const n = parseInt(e.key); if (n >= 1 && n <= 6) setPlacing(ui.placing === EL[n - 1] ? null : EL[n - 1]);
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && ui.game && $('#scr-game').classList.contains('active') && ui.game.state === 'run' && !ui.paused) pauseMenu(); });
  }
  function tap(c, r, x, y) {
    const g = ui.game; const t = g.towerAt(c, r);
    if (ui.mode === 'merge') {
      if (t) {
        click();
        if (t === ui.mergeList[0]) { ui.mode = 'idle'; ui.mergeList = []; towerPanel(t); return; }
        const i = ui.mergeList.indexOf(t);
        if (i >= 0) ui.mergeList.splice(i, 1);
        else if (ui.mergeList.length < C.MERGE_MAX) ui.mergeList.push(t);
        else { ED.Audio.play('error'); toastMsg(`ผสมได้สูงสุด ${C.MERGE_MAX} หอ`); }
        mergePanel();
      }
      return;
    }
    if (ui.mode === 'place') {
      if (t) { setPlacing(null); select(t); return; }
      if (g.lootAt(c, r)) { setPlacing(null); lootPanel(g.lootAt(c, r)); return; }
      doBuild(c, r, ui.placing); return;
    }
    hideRadial();
    if (t) { click(); select(t); return; }
    const L = g.lootAt(c, r); if (L) { click(); ui.selected = null; lootPanel(L); return; }
    if (g.cellFree(c, r)) { click(); ui.selected = null; hidePanel(); openRadial(c, r); return; }
    ui.selected = null; hidePanel(); ui.view.range = null;
  }
  function doBuild(c, r, el) {
    const res = ui.game.build(c, r, el);
    if (!res.ok) { ED.Audio.play('error'); toastMsg(res.msg); }
  }
  function select(t) { ui.selected = t; ui.mode = 'idle'; ui.mergeList = []; towerPanel(t); }

  /* ---------- radial build ---------- */
  function openRadial(c, r) {
    const rd = $('#radial'); const rect = cv.getBoundingClientRect(), prect = $('#play').getBoundingClientRect();
    const s = rect.width / ui.game.W;
    let px = rect.left - prect.left + (c * C.CELL + 50) * s, py = rect.top - prect.top + (r * C.CELL + 50) * s;
    const R = 74; px = U.clamp(px, R + 34, prect.width - R - 34); py = U.clamp(py, R + 34, prect.height - R - 34);
    rd.style.left = px + 'px'; rd.style.top = py + 'px'; rd.innerHTML = '';
    EL.forEach((e, i) => {
      const a = -Math.PI / 2 + i / 6 * Math.PI * 2; const E = ED.ELEMENT[e];
      const b = document.createElement('button'); b.className = 'rb' + (ui.game.gold < C.TOWER_COST ? ' poor' : ''); b.style.setProperty('--c', E.color);
      b.style.left = Math.cos(a) * R + 'px'; b.style.top = Math.sin(a) * R + 'px'; b.style.animationDelay = i * 0.025 + 's';
      b.innerHTML = `<span class="em">${E.icon}</span>${E.th}`;
      b.onpointerenter = () => { ui.view.range = { x: c * 100 + 50, y: r * 100 + 50, r: ED.towerSpec(ED.basicCounts(e)).range * C.CELL, el: e }; };
      b.onclick = () => { hideRadial(); doBuild(c, r, e); };
      rd.appendChild(b);
    });
    const x = document.createElement('button'); x.className = 'rc'; x.textContent = '×'; x.onclick = () => { click(); hideRadial(); }; rd.appendChild(x);
    rd.classList.remove('hidden');
    ui.view.range = { x: c * 100 + 50, y: r * 100 + 50, r: 2.7 * C.CELL, el: 'LIGHT' };
  }
  function hideRadial() { $('#radial').classList.add('hidden'); ui.view.range = null; }

  /* ================= TOWER PANEL ================= */
  function thumb(spec, w, h) {
    const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; const g = c.getContext('2d');
    const s = (h * 2) / 200; g.scale(s, s); ED.drawTower(g, spec, (w * 2 / s) / 2, 190, 0.6); return c;
  }
  ui.thumb = thumb;
  function effRow(spec) {
    return `<div class="eff">${EL.map(e => { let m = 0; spec.shares.forEach((s, i) => m += s * ED.mult(EL[i], e)); const cls = m >= 1.3 ? 'g' : m < 0.8 ? 'b' : ''; return `<div><span style="color:${ED.ELEMENT[e].color}">${ED.ELEMENT[e].icon}</span><br><span class="${cls}">×${m.toFixed(2)}</span></div>`; }).join('')}</div>`;
  }
  function specHTML(spec, t) {
    const comp = EL.map((e, i) => spec.counts[i] ? `<span style="--c:${ED.ELEMENT[e].color}">${ED.ELEMENT[e].icon} ${ED.ELEMENT[e].th} ×${spec.counts[i]}</span>` : '').join('');
    const P = spec.P, md = spec.mod;
    const pat = ED.PROFILE[spec.dom].pth + (spec.pattern === 'splash' ? ` (รัศมี ${U.fmt1(P.splash)})` : spec.pattern === 'multi' ? ` (${P.targets} เป้า)` : spec.pattern === 'frost' ? ` (ช้า ${Math.round(P.frostSlow * 100)}%)` : spec.pattern === 'curse' ? ` (DoT ${Math.round(P.curse * 100)}%)` : spec.pattern === 'quake' ? ` (มึน ${Math.round(P.quakeStun * 100)}%)` : '');
    const mods = [];
    if (md.burn) mods.push(`🔥 เผา ${Math.round(md.burn * 100)}%/วิ`); if (md.extra && spec.pattern !== 'multi') mods.push(`🌪 +${md.extra} เป้า`);
    if (md.crit > 0.06) mods.push(`✦ คริ ${Math.round(md.crit * 100)}%`); if (md.armorDown) mods.push(`☾ ลดเกราะ ${Math.round(md.armorDown * 100)}%`);
    if (md.stun) mods.push(`⛰ มึน ${Math.round(md.stun * 100)}%`); if (md.slow) mods.push(`💧 ช้า ${Math.round(md.slow * 100)}%`);
    if (spec.seeStealth) mods.push('👁 มองเห็นล่องหน');
    return `<div class="comp">${comp}</div>
      <div class="stats"><div>ดาเมจ/ครั้ง <b>${U.fmt(spec.damage)}</b></div><div>ยิง/วิ <b>${spec.rate.toFixed(2)}</b></div>
      <div>DPS <b>${U.fmt(spec.dps)}</b></div><div>ระยะ <b>${spec.range.toFixed(1)}</b></div>
      <div>หน่วยธาตุ <b>${spec.u}/${C.MAX_UNITS}</b></div><div>Tier <b>${ED.TIER_NAMES[spec.tier]} ${ED.TIER_TITLES[spec.tier]}</b></div>
      ${t ? `<div>สังหาร <b>${t.kills}</b></div><div>ดาเมจรวม <b>${U.fmt(t.dmg || 0)}</b></div>` : ''}</div>
      <div class="sec"><h4>รูปแบบการโจมตี</h4>${pat}${mods.length ? '<br>' + mods.join(' · ') : ''}</div>
      <div class="sec"><h4>${spec.skill ? '🌟 สกิล: ' + spec.skill.th + ' <small style="color:var(--mut)">' + spec.skill.en + '</small>' : '🌟 สกิล'}</h4>${spec.skill ? spec.skill.desc : 'หอ Tier Ⅰ ยังไม่มีสกิล — ผสม 2 หน่วยขึ้นไปเพื่อปลดล็อก'}</div>
      <div class="sec"><h4>ตัวคูณดาเมจต่อมอนสเตอร์แต่ละธาตุ</h4>${effRow(spec)}</div>`;
  }
  /* แผงข้อมูลวางฝั่งตรงข้ามกับหอที่เลือก และพับเก็บได้ เพื่อไม่บังสนาม */
  function showPanel(p, worldX) {
    p.classList.toggle('left', worldX > ui.game.W * 0.5);
    p.classList.toggle('collapsed', !!ui.panelCollapsed);
    p.classList.remove('hidden'); p.scrollTop = 0;
    const mn = p.querySelector('.mn'); if (mn) mn.onclick = () => { click(); ui.panelCollapsed = !ui.panelCollapsed; p.classList.toggle('collapsed', ui.panelCollapsed); mn.textContent = ui.panelCollapsed ? '▾' : '–'; };
    const dt = p.querySelector('.det-t'); if (dt) dt.onclick = () => { click(); ui.detailsOpen = !ui.detailsOpen; p.querySelector('.det').classList.toggle('hidden', !ui.detailsOpen); dt.textContent = ui.detailsOpen ? 'ซ่อนรายละเอียด ▴' : 'ดูรายละเอียด ▾'; };
  }
  const headBtns = () => `<div class="pbtns"><button class="mn" title="พับ/ขยาย">${ui.panelCollapsed ? '▾' : '–'}</button><button class="x" title="ปิด">×</button></div>`;
  const detToggle = () => `<button class="det-t">${ui.detailsOpen ? 'ซ่อนรายละเอียด ▴' : 'ดูรายละเอียด ▾'}</button>`;
  function towerPanel(t) {
    const p = $('#panel'); const spec = t.spec;
    const modes = [['first', 'ตัวหน้าสุด'], ['last', 'ตัวท้าย'], ['strong', 'HP มาก'], ['weak', 'HP น้อย'], ['elem', 'ธาตุได้เปรียบ']];
    p.innerHTML = `${headBtns()}<div class="mini"><span id="p-th"></span><div><h3>${spec.name}</h3><div class="sub">${ED.TIER_TITLES[spec.tier]} · ${ED.ELEMENT[spec.dom].th}${spec.sec ? '+' + ED.ELEMENT[spec.sec].th : ''} · <span style="color:var(--gold)">มูลค่า ${t.value}</span></div></div></div>
      <div class="pbody">
      <div class="quick"><span>DPS <b>${U.fmt(spec.dps)}</b></span><span>ระยะ <b>${spec.range.toFixed(1)}</b></span><span>${spec.u}/${C.MAX_UNITS} หน่วย</span></div>
      ${spec.skill ? `<div class="skillline">🌟 <b>${spec.skill.th}</b> · ${spec.skill.desc.split(' · ')[0]}</div>` : '<div class="skillline mut">ผสม 2 หน่วยขึ้นไปเพื่อปลดล็อกสกิล</div>'}
      <div class="row"><button class="btn gold" id="p-merge">⚗ ผสม</button><button class="btn red" id="p-sell">ขาย +${Math.floor(t.value * C.SELL_REFUND)}</button></div>
      ${detToggle()}
      <div class="det ${ui.detailsOpen ? '' : 'hidden'}">${specHTML(spec, t)}
      <div class="sec"><h4>เลือกเป้าหมาย</h4><div class="modes">${modes.map(([m, l]) => `<button data-m="${m}" class="${t.mode === m ? 'on' : ''}">${l}</button>`).join('')}</div></div></div></div>`;
    p.querySelector('#p-th').appendChild(thumb(spec, 52, 66));
    p.querySelector('.x').onclick = () => { click(); ui.selected = null; hidePanel(); };
    p.querySelectorAll('.modes button').forEach(b => b.onclick = () => { click(); t.mode = b.dataset.m; p.querySelectorAll('.modes button').forEach(x => x.classList.toggle('on', x === b)); });
    p.querySelector('#p-merge').onclick = () => { click(); ui.mode = 'merge'; ui.mergeList = [t]; mergePanel(); };
    p.querySelector('#p-sell').onclick = () => { ui.game.sell(t); ui.selected = null; hidePanel(); };
    showPanel(p, t.x);
    ui.view.range = { x: t.x, y: t.y, r: spec.range * C.CELL, el: spec.dom };
    ui.panelTower = t; ui.panelKills = t.kills;
    hint('แตะ <b>⚗ ผสม</b> แล้วเลือกหออื่น หรือ <b>ลากหอนี้ไปวางบนหออื่น</b> เพื่อผสม');
  }
  function refreshPanelLive() {
    const t = ui.selected; if (!t || ui.panelTower !== t) return;
    if (!ui.game.towers.includes(t)) { ui.selected = null; hidePanel(); return; }
    if (t.kills !== ui.panelKills) { ui.panelKills = t.kills; const el = $('#panel .stats'); if (el) { const divs = el.querySelectorAll('div'); if (divs[6]) divs[6].innerHTML = `สังหาร <b>${t.kills}</b>`; if (divs[7]) divs[7].innerHTML = `ดาเมจรวม <b>${U.fmt(t.dmg || 0)}</b>`; } }
  }
  function mergePanel() {
    const p = $('#panel'); const list = ui.mergeList; const g = ui.game;
    const chk = ED.mergeCheck(list, g.gold, g.freeMerges);
    const anchor = list[0];
    ui.view.range = anchor ? { x: anchor.x, y: anchor.y, r: (chk.spec ? chk.spec.range : anchor.spec.range) * C.CELL, el: chk.spec ? chk.spec.dom : anchor.spec.dom, ok: chk.ok } : null;
    const items = list.map((t, i) => `<span style="--c:${ED.ELEMENT[t.spec.dom].color}">${i === 0 ? '⚑ ' : ''}${t.spec.name}</span>`).join('');
    const u = ED.unitsOf(chk.counts), kk = ED.distinctOf(chk.counts);
    const cond = (ok, txt) => `<span class="cond ${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${txt}</span>`;
    const ready = chk.spec && list.length >= 2;
    p.innerHTML = `${headBtns()}<h3>⚗ ผสมหอคอย <small>${list.length}/${C.MERGE_MAX}</small></h3>
      <div class="pbody">
      <div class="sub">${list.length < 2 ? '👉 <b style="color:#ffe9a8">แตะหออื่นบนแผนที่</b> เพื่อเลือกมาผสม' : 'แตะหอเพิ่ม/เอาออกได้ · หอใหม่เกิดที่ ⚑'}</div>
      <div class="comp">${items}</div>
      <div class="conds">${cond(list.length >= C.MERGE_MIN, `${C.MERGE_MIN}–${C.MERGE_MAX} หอ`)}${cond(u <= C.MAX_UNITS, `หน่วย ${u}/${C.MAX_UNITS}`)}${cond(kk <= C.MAX_DISTINCT, `ธาตุ ${kk}/${C.MAX_DISTINCT}`)}${chk.free ? cond(true, '⚗ ใช้ตั๋วฟรี') : cond(g.gold >= chk.fee, `ค่าผสม ${chk.fee}🪙`)}</div>
      ${chk.reasons.length && list.length >= 2 ? `<div class="reasons">${chk.reasons.join('<br>')}</div>` : ''}
      ${ready ? `<div class="mini result"><span id="p-th"></span><div><div class="sub">ผลลัพธ์ ${ED.save.data.discovered[chk.spec.key] ? '' : '<b style="color:#7dffb0">✦ หอใหม่!</b>'}</div><h3>${chk.spec.name}</h3><div class="sub">DPS ${U.fmt(list.reduce((a, t) => a + t.spec.dps, 0))} → <b style="color:#7dffb0">${U.fmt(chk.spec.dps)}</b>${chk.spec.skill ? ' · 🌟 ' + chk.spec.skill.th : ''}</div></div></div>` : ''}
      <div class="row"><button class="btn ghost" id="m-cancel">ยกเลิก</button><button class="btn green" id="m-go" ${chk.ok ? '' : 'disabled'}>ผสมเลย ${chk.free ? '(ฟรี)' : '−' + chk.fee + '🪙'}</button></div>
      ${ready ? detToggle() + `<div class="det ${ui.detailsOpen ? '' : 'hidden'}">${specHTML(chk.spec)}</div>` : ''}</div>`;
    if (ready) p.querySelector('#p-th').appendChild(thumb(chk.spec, 52, 66));
    const cancel = () => { click(); ui.mode = 'idle'; ui.mergeList = []; if (anchor) select(anchor); else hidePanel(); };
    p.querySelector('.x').onclick = cancel; p.querySelector('#m-cancel').onclick = cancel;
    p.querySelector('#m-go').onclick = () => {
      const res = g.merge(list, anchor);
      if (!res.ok) { ED.Audio.play('error'); toastMsg(res.msg); return; }
      ui.mode = 'idle'; ui.mergeList = []; select(res.tower);
    };
    showPanel(p, anchor ? anchor.x : 0);
    hint('⚗ โหมดผสม: แตะหอที่ต้องการรวม แล้วกด <b>ผสมเลย</b>');
  }
  function lootPanel(L) {
    const p = $('#panel'); const D = ED.LOOT[L.kind]; const g = ui.game; const E = ED.ELEMENT[L.el];
    const focused = g.focusLoot === L;
    const best = ED.EL.find(e => ED.beats(e, L.el));
    p.innerHTML = `${headBtns()}<h3>${D.icon} ${D.th}${L.kind === 'crystal' ? ' ' + E.th : ''}</h3>
      <div class="pbody">
      <div class="sub">ธาตุ <b style="color:${E.color}">${E.icon} ${E.th}</b> · ยิงด้วยธาตุ${ED.ELEMENT[best].th}ได้ดาเมจ ×${C.ADV_MULT}</div>
      <div class="quick"><span>HP <b>${U.fmt(L.hp)}</b> / ${U.fmt(L.maxHp)}</span></div>
      <div class="skillline">🎁 รางวัล: <b>${D.desc}</b></div>
      <div class="sub">หอในระยะจะยิงวัตถุนี้เองเมื่อไม่มีมอนสเตอร์ · ตั้งเป็นเป้าโฟกัสเพื่อให้ยิงทันทีแม้มีมอนอยู่ (ระวังมอนหลุด!) · แตกแล้วช่องนี้สร้างหอได้</div>
      <div class="row"><button class="btn ${focused ? 'ghost' : 'red'}" id="l-focus">${focused ? 'ยกเลิกโฟกัส' : '🎯 โจมตีเป้านี้'}</button></div></div>`;
    p.querySelector('.x').onclick = () => { click(); ui.view.selectedLoot = null; hidePanel(); };
    p.querySelector('#l-focus').onclick = () => { click(); g.focusLoot = focused ? null : L; lootPanel(L); };
    showPanel(p, L.x);
    ui.view.selectedLoot = L;
  }
  function hidePanel() { $('#panel').classList.add('hidden'); ui.view.range = null; ui.view.selectedLoot = null; ui.panelTower = null; if (ui.mode !== 'place') hint('แตะช่องว่างเพื่อสร้างหอ · แตะหอเพื่อดูข้อมูล · <b>ลากหอไปวางบนหออื่นเพื่อผสม</b> · แตะ 💰สมบัติ เพื่อสั่งยิง'); }

  /* ================= TOASTS / BANNERS ================= */
  function toast(html, canvas) {
    const box = $('#toasts'); const d = document.createElement('div'); d.className = 'toast';
    if (canvas) d.appendChild(canvas); const s = document.createElement('span'); s.innerHTML = html; d.appendChild(s);
    box.appendChild(d); while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, 3200);
  }
  function toastMsg(m) { toast(`<span style="color:#ffb3a8">${m}</span>`); }
  ui.onLoot = function (L, msg) { toast(`${ED.LOOT[L.kind].icon} ทำลาย<b>${ED.LOOT[L.kind].th}</b>! ${msg}`); if (ui.view.selectedLoot === L) hidePanel(); };
  ui.onDiscover = function (spec) {
    if (spec.u === 1) return;
    toast(`✦ ค้นพบหอใหม่! <b>${spec.name}</b><br><small>${Object.keys(ED.save.data.discovered).length.toLocaleString()} / ${ED.countAllTowerForms().toLocaleString()} แบบ</small>`, thumb(spec, 40, 50));
  };
  function banner(text, color) { const b = $('#banner'); b.textContent = text; b.style.color = color || '#fff'; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
  ui.banner = banner;

  /* ================= PAUSE / RESULT ================= */
  function callWave() {
    const g = ui.game; if (!g || g.state === 'won' || g.state === 'lost' || g.waveIdx >= g.waves.length) return;
    const bonus = g.callWave(); click();
    banner(`เวฟ ${g.waveIdx}${g.endless ? '' : ' / ' + g.waves.length}`, '#ffd25a');
    if (bonus > 0) toast(`โบนัสเวฟ <b>+${bonus}</b> 🪙`);
  }
  function pauseMenu() {
    if (!ui.game) return; ui.paused = true; ED.Audio.setDuck(true);
    const g = ui.game;
    const b = modal(`<h2>❚❚ หยุดชั่วคราว</h2><p>ด่าน ${g.stage} · ${g.map.biome.th} · เวฟ ${g.waveIdx}/${g.endless ? '∞' : g.waves.length}</p>
      <p style="font-size:12px">การบันทึกจะเก็บสถานะล่าสุดที่สนามว่าง (ระหว่างเวฟ)</p>
      <div class="acts" style="flex-direction:column;align-items:stretch">
      <button class="btn green" id="pz-go">▶ เล่นต่อ</button><button class="btn" id="pz-codex">📖 สมุดบันทึก / ตารางธาตุ</button><button class="btn" id="pz-set">⚙ ตั้งค่า</button>
      <button class="btn" id="pz-restart">↻ เริ่มด่านนี้ใหม่ (แผนที่เดิม)</button><button class="btn red" id="pz-quit">💾 บันทึกและออกไปแผนที่โลก</button></div>`, 'small');
    b.querySelector('#pz-go').onclick = () => { click(); closeModal(); ui.paused = false; ED.Audio.setDuck(false); };
    b.querySelector('#pz-codex').onclick = () => { click(); codex('towers', true); };
    b.querySelector('#pz-set').onclick = () => { click(); settings(true); };
    b.querySelector('#pz-restart').onclick = () => { click(); ED.Audio.setDuck(false); confirmBox('เริ่มด่านใหม่?', 'หอและทองในด่านนี้จะถูกรีเซ็ต', 'เริ่มใหม่', () => { ED.save.clearCurrent(); startStage(g.stage, g.seed, null, g.waveCount); }); };
    b.querySelector('#pz-quit').onclick = () => { click(); ED.Audio.setDuck(false); g.refreshSnapshot(); ED.save.autosave(g); ED.save.persist(); closeModal(); ui.game = null; openWorld(); };
  }
  ui.onEnd = function (g, win, stars) {
    ED.Audio.music(win || stars ? 'victory' : 'defeat');
    setTimeout(() => {
      const nd = g.newDiscoveries.filter(s => s.u > 1).length;
      const b = modal(`<div style="text-align:center"><h2 style="font-size:36px;color:${win || stars ? '#ffd25a' : '#ff6a6a'}">${win ? '🏆 ชัยชนะ!' : g.endless ? '⚔ จบการท้าทายไม่จำกัด' : '💀 ปราสาทพังทลาย'}</h2>
        ${g.endless ? '' : win ? `<div class="big-stars">${[1, 2, 3].map(i => `<span class="${i <= stars ? 'on' : ''}" style="animation-delay:${i * 0.25}s">★</span>`).join('')}</div>` : '<p>ลองผสมหอใหม่ หรือใช้ธาตุที่ชนะทางมอนสเตอร์ดูสิ</p>'}
        ${g.endless ? `<h2 style="margin:4px 0">รอดได้ ${g.survived} เวฟ</h2><div class="big-stars">${[1, 2, 3].map(i => `<span class="${i <= stars ? 'on' : ''}" style="animation-delay:${i * 0.25}s">★</span>`).join('')}</div><p>${g.survived > (g.prevBest || 0) ? '🏆 สถิติใหม่!' : 'สถิติเดิม ' + g.prevBest + ' เวฟ'} · ⭐ 50 · ⭐⭐ 100 · ⭐⭐⭐ 200 เวฟ</p>` : ''}
        <div class="res-grid"><div><b>${g.stats.kills}</b>สังหาร</div><div><b>${g.stats.merges}</b>ผสม</div><div><b>${nd}</b>หอใหม่</div><div><b>${Math.max(0, Math.ceil(g.castleHp))}</b>เลือดปราสาท</div></div>
        <p>${g.endless ? '' : g.overtime ? '⏰ เกินเวลา (สูงสุด 1 ดาว)' : 'เวลาที่เหลือ ' + fmtTime(g.timeLeft)}</p>
        ${win ? '<p style="font-size:13px">ด่านต่อไปจะสร้างแผนที่ใหม่จากชิ้นส่วนแบบสุ่ม และยากขึ้น</p>' : ''}</div>
        <div class="acts"><button class="btn ghost" id="r-map">🗺 แผนที่โลก</button>${win || stars ? '<button class="btn gold" id="r-next">ด่านต่อไป ▶</button>' : ''}<button class="btn ${win || stars ? 'ghost' : 'gold'}" id="r-retry">↻ ${win ? 'เล่นด่านนี้อีกครั้ง' : 'ลองใหม่'}</button></div>`, 'small');
      b.querySelector('#r-map').onclick = () => { click(); closeModal(); ui.game = null; openWorld(); };
      if (win || stars) b.querySelector('#r-next').onclick = () => { click(); closeModal(); ui.game = null; openWorld(); briefing(g.stage + 1); };
      b.querySelector('#r-retry').onclick = () => { click(); closeModal(); if (win) { ui.game = null; openWorld(); briefing(g.stage); } else startStage(g.stage, g.seed, null, g.waveCount); };
    }, win ? 900 : 1200);
    banner(win ? 'ชัยชนะ!' : 'พ่ายแพ้…', win ? '#ffd25a' : '#ff5a5a');
  };

  /* ================= CODEX ================= */
  function codex(tab, fromGame) {
    const d = ED.save.data; tab = tab || 'towers';
    const tabs = [['towers', '🏯 หอที่ค้นพบ'], ['lab', '⚗ ห้องทดลองผสม'], ['chart', '☯ ตารางธาตุ'], ['mons', '👹 มอนสเตอร์'], ['rank', '🏆 สถิติ']];
    const b = modal(`<button class="close">×</button><h2>📖 สมุดบันทึกผู้พิทักษ์</h2><div class="tabs">${tabs.map(([k, l]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div><div id="cx-body"></div>`);
    b.querySelector('.close').onclick = () => { click(); closeModal(); if (fromGame) pauseMenu(); };
    b.querySelectorAll('.tabs button').forEach(x => x.onclick = () => { click(); codex(x.dataset.t, fromGame); });
    const body = b.querySelector('#cx-body');
    if (tab === 'towers') {
      const keys = Object.keys(d.discovered).map(k => ED.towerSpec(ED.keyToCounts(k))).sort((a, b) => b.u - a.u || b.dps - a.dps);
      body.innerHTML = `<p>ค้นพบ <b>${keys.length.toLocaleString()}</b> จาก <b>${ED.countAllTowerForms().toLocaleString()}</b> รูปแบบ (≤${C.MAX_UNITS} หน่วย, ≤${C.MAX_DISTINCT} ธาตุ) · แต่ละรูปแบบมีค่าพลัง สกิล และรูปร่างต่างกัน</p><div class="codex-grid" id="cx-grid"></div><div class="acts"><button class="btn" id="cx-more">แสดงเพิ่ม</button></div>`;
      let shown = 0; const grid = body.querySelector('#cx-grid');
      const more = () => {
        keys.slice(shown, shown + 60).forEach(s => {
          const it = document.createElement('div'); it.className = 'cx'; it.appendChild(thumb(s, 44, 56));
          const t = document.createElement('div'); t.innerHTML = `<b>${s.name}</b>${EL.map((e, i) => s.counts[i] ? ED.ELEMENT[e].icon + s.counts[i] : '').join(' ')}<br>DPS ${U.fmt(s.dps)}`; it.appendChild(t);
          it.onclick = () => { click(); codexLab(s.counts.slice(), fromGame); };
          grid.appendChild(it);
        });
        shown += 60; if (shown >= keys.length) body.querySelector('#cx-more').classList.add('hidden');
      };
      body.querySelector('#cx-more').onclick = more; more();
    } else if (tab === 'lab') { codexLab(null, fromGame, body); }
    else if (tab === 'chart') {
      body.innerHTML = `<div class="cycle">${EL.map(e => `<span class="pill" style="--c:${ED.ELEMENT[e].color}">${ED.ELEMENT[e].icon} ${ED.ELEMENT[e].th}</span>`).join(' ›› ')} ›› <span class="pill" style="--c:${ED.ELEMENT.FIRE.color}">🔥 ไฟ</span></div>
        <p>ชนะทาง ×${C.ADV_MULT} · แพ้ทาง ×${C.DIS_MULT} · ธาตุเดียวกัน ×${C.SAME_MULT} · อื่นๆ ×${C.NEUTRAL_MULT} — หอผสมคิดตัวคูณตามสัดส่วนธาตุ เช่น ไฟ2+น้ำ1 โจมตีมอนลม = (2×2.0 + 1×1.0)/3 = ×1.67</p>
        <p><b>Elemental Interaction</b> (แยกจากตัวคูณ): ทุกการโจมตีมีโอกาสกระตุ้นปฏิกิริยา <span style="color:#7dffb0">เขียว = ดีต่อผู้เล่น</span> <span style="color:#ff8a8a">แดง = กระตุ้นมอนสเตอร์</span> · แตะช่องเพื่ออ่าน</p>
        <table class="it"><tr><th>หอ ＼ มอน</th>${EL.map(e => `<th style="color:${ED.ELEMENT[e].color}">${ED.ELEMENT[e].icon}${ED.ELEMENT[e].th}</th>`).join('')}</tr>
        ${EL.map(a => `<tr><th style="color:${ED.ELEMENT[a].color}">${ED.ELEMENT[a].icon}${ED.ELEMENT[a].th}</th>${EL.map(dd => { const it = ED.INTERACT[a + '>' + dd]; const m = ED.mult(a, dd); return `<td class="${a === dd ? 's' : it.good ? 'g' : 'b'}" data-k="${a}>${dd}"><b>×${m}</b><br>${it.th}</td>`; }).join('')}</tr>`).join('')}</table>
        <p id="it-desc" style="min-height:24px"></p>`;
      body.querySelectorAll('td[data-k]').forEach(td => td.onclick = () => { const it = ED.INTERACT[td.dataset.k]; const [a, dd] = td.dataset.k.split('>'); body.querySelector('#it-desc').innerHTML = `<b>${ED.ELEMENT[a].th} → มอน${ED.ELEMENT[dd].th}: ${it.th}</b> — ${it.desc} (โอกาส ${Math.round(ED.procChance(ED.relation(a, dd)) * 100)}% × สัดส่วนธาตุ)`; });
    } else if (tab === 'mons') {
      const seen = Object.keys(d.seen);
      body.innerHTML = `<p>พบมอนสเตอร์แล้ว <b>${seen.length.toLocaleString()}</b> จาก <b>${ED.countAllSpecies().toLocaleString()}</b> สายพันธุ์ (ร่างสมบูรณ์ ${ED.GOOD_PARTS.Body.length + ED.GOOD_PARTS.Head.length} แบบ × ธาตุ 6 × นิสัย ${ED.TRAIT_KEYS.length}) แต่ละตัวมีสีธาตุ ขนาด ปีกคู่ ออร่า และมงกุฎ (อีลีท/บอส) ต่างกัน</p>
        <table class="it"><tr><th>นิสัย</th><th>HP</th><th>ความเร็ว</th><th>เกราะ</th><th>ตีปราสาท</th><th>ความสามารถ</th><th>ปลดล็อก</th></tr>
        ${ED.TRAIT_KEYS.map(k => { const T = ED.TRAITS[k]; const ab = { fast: 'วิ่งเร็ว', swarm: 'มาเป็นฝูงใหญ่', tank: 'เกราะ 25% เดินช้า', flyer: 'บิน: ไม่โดนแผ่นดินไหว', regen: 'ฟื้น HP 2.5%/วิ', shield: 'โล่ 50% ฟื้นเมื่อไม่โดนตี', armored: 'เกราะ 45%', split: 'ตายแล้วแตกเป็น 2', dash: 'พุ่ง ×3 ทุก 3.5 วิ', healer: 'รักษาพวก 4%', stealth: 'ล่องหน (แสงมองเห็น)', berserk: 'HP<50% เร็ว ×1.6' }[k] || '-'; return `<tr><td>${ED.TRAIT_ICON[k] || '•'} ${T.th}</td><td>×${T.hp}</td><td>×${T.spd}</td><td>${Math.round(T.armor * 100)}%</td><td>${T.leak}</td><td>${ab}</td><td>ด่าน ${T.unlock}</td></tr>`; }).join('')}</table>
        <p style="font-size:12px">HP พื้นฐาน = ${C.MON_BASE_HP} × ${C.HP_GROWTH}^(ด่าน−1) × (1 + ${C.MON_WAVE_HP}×เวฟ) × ตัวคูณนิสัย · อีลีท ×4 · บอส ×(11 + 0.6×ด่าน)</p>`;
    } else if (tab === 'rank') {
      const T = d.totals;
      body.innerHTML = `<div class="res-grid"><div><b>${d.highest - 1}</b>ด่านสูงสุดที่ผ่าน</div><div><b>⭐${ED.save.totalStars()}</b>ดาวรวม</div><div><b>${T.wins}</b>ชนะ</div><div><b>${T.losses}</b>แพ้</div>
        <div><b>${U.fmt(T.kills)}</b>สังหารรวม</div><div><b>${T.merges}</b>ผสมรวม</div><div><b>${Object.keys(d.discovered).length}</b>หอที่ค้นพบ</div><div><b>${Math.floor(T.playTime / 60)}</b>นาทีที่เล่น</div></div>
        <p>เซฟนี้อยู่ในเบราว์เซอร์ของคุณเท่านั้น</p>`;
    }
  }
  function codexLab(counts, fromGame, body) {
    if (!body) { codex('lab', fromGame); body = $('#cx-body'); }
    const st = counts || ui.labCounts || [2, 1, 0, 0, 0, 0]; ui.labCounts = st;
    const render = () => {
      const u = ED.unitsOf(st), kk = ED.distinctOf(st);
      const bad = []; if (u < 1) bad.push('ต้องมีอย่างน้อย 1 หน่วย'); if (u > C.MAX_UNITS) bad.push(`หน่วยรวม ${u} เกิน ${C.MAX_UNITS}`); if (kk > C.MAX_DISTINCT) bad.push(`ธาตุ ${kk} ชนิด เกิน ${C.MAX_DISTINCT} (ไม่เสถียร)`);
      const spec = bad.length ? null : ED.towerSpec(st);
      body.innerHTML = `<p>ปรับจำนวนหน่วยธาตุเพื่อคำนวณหอที่จะได้จากการผสม (ผสมได้ครั้งละ 2–4 หอ รวมกันได้หลายรอบ)</p>
        <div class="lab">${EL.map((e, i) => `<div class="el" style="--c:${ED.ELEMENT[e].color}"><span>${ED.ELEMENT[e].icon} ${ED.ELEMENT[e].th}</span><span class="n">${st[i]}</span><div class="pm"><button data-i="${i}" data-d="-1">−</button><button data-i="${i}" data-d="1">+</button></div></div>`).join('')}</div>
        ${bad.length ? `<div class="reasons">${bad.join('<br>')}</div>` : `<div class="mini"><span id="lab-th"></span><div><h3 style="margin:0;color:var(--gold)">${spec.name}</h3><div class="sub">${ED.save.data.discovered[spec.key] ? '✔ ค้นพบแล้ว' : '✦ ยังไม่ค้นพบ'} · ต้องใช้หอพื้นฐาน ${u} ต้น (${u * C.TOWER_COST}🪙) · ค่าผสมรอบสุดท้าย ${C.MERGE_FEE_PER_UNIT * u + C.MERGE_FEE_PER_ELEM * (kk - 1)}🪙</div></div></div>${specHTML(spec)}`}`;
      if (spec) body.querySelector('#lab-th').appendChild(thumb(spec, 72, 90));
      body.querySelectorAll('.pm button').forEach(bt => bt.onclick = () => { click(); const i = +bt.dataset.i; st[i] = U.clamp(st[i] + +bt.dataset.d, 0, C.MAX_UNITS); render(); });
    };
    render();
  }

  /* ================= BOOT ================= */
  function boot() {
    cv = $('#cv'); ctx = cv.getContext('2d');
    ED.save.load(); ED.FX.quality = ED.settings.quality;
    initTitle(); initInput();
    const unlock = () => { ED.Audio.init(); ED.Audio.preload(); ED.Audio.apply(); };
    document.addEventListener('pointerdown', unlock, { capture: true }); document.addEventListener('keydown', unlock, { capture: true });
    $('#w-back').onclick = () => { click(); show('scr-title'); };
    $('#w-codex').onclick = () => { click(); codex('rank'); };
    $('#h-call').onclick = callWave;
    $('#h-pause').onclick = () => { click(); pauseMenu(); };
    $('#h-speed').onclick = () => { click(); ui.speed = ui.speed === 1 ? 2 : ui.speed === 2 ? 3 : 1; $('#h-speed').textContent = '×' + ui.speed; };
    $('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal' && !ui.paused && !(ui.game && (ui.game.state === 'won' || ui.game.state === 'lost'))) closeModal(); });
    ED.loadAssets(p => { $('#load-fill').style.width = Math.round(p * 100) + '%'; }).then(() => {
      $('#load-txt').textContent = 'พร้อมแล้ว!';
      setTimeout(() => show('scr-title'), 250);
      requestAnimationFrame(loop);
    });
  }
  ui._test = { tap, startStage, openWorld, briefing, codex, settings, pauseMenu, callWave, setPlacing, select, mergePanel };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
