/* ELEMENTAL DEFENDERS — Game simulation & rendering of a stage */
'use strict';
(function () {
  const C = ED.CONFIG, U = ED.U, FX = ED.FX, CELL = C.CELL;
  let UID = 1;

  class Game {
    constructor(opts) {
      this.stage = opts.stage; this.seed = opts.seed;
      this.map = ED.generateMap(this.stage, this.seed);
      this.mapCanvas = ED.buildMapCanvas(this.map);
      this.W = this.map.cols * CELL; this.H = this.map.rows * CELL;
      this.paths = this.map.paths.map(cells => this.buildPolyline(cells));
      this.waveCount = opts.waveCount != null ? opts.waveCount : (opts.resume && opts.resume.waveCount != null ? opts.resume.waveCount : 50);
      this.endless = !this.waveCount;
      this.waves = ED.makeWaves(this.stage, this.seed, this.paths.length, this.waveCount || Infinity);
      this.towers = []; this.monsters = []; this.projectiles = []; this.zones = []; this.spawners = [];
      this.gold = Math.round(C.START_GOLD * Math.pow(C.START_GOLD_GROWTH, this.stage - 1) / 10) * 10;
      this.castleMax = C.CASTLE_HP; this.castleHp = this.castleMax;
      this.waveIdx = 0; this.nextWaveTimer = 0; this.time = 0; this.started = false;
      this.timeLimit = ED.timeLimitFor(this.waves);
      this.timeLeft = this.timeLimit; this.overtime = false;
      this.state = 'prep';
      this.stats = { kills: 0, leaked: 0, merges: 0, built: 0, dmg: 0 };
      this.newDiscoveries = [];
      this.castleHit = 0;
      this.paused = false;
      this.freeMerges = 0; this.focusLoot = null;
      this.loots = this.map.loot.map(l => this.makeLootEnt(l));
      this.slotCanvas = ED.buildSlotCanvas(this.map);
      if (opts.resume) this.restore(opts.resume);
      this.waveKills = 0; this.leakSince = false; this.noLeakRun = 0;
      ED.T && ED.T.onStart(this, !!opts.resume);
      this.snapshot = this.serialize();
    }

    /* ---------------- path helpers ---------------- */
    buildPolyline(cells) {
      const pts = cells.map(([c, r]) => [c * CELL + CELL / 2, r * CELL + CELL / 2]);
      const [c0, r0] = cells[0];
      if (c0 === 0) pts.unshift([-60, pts[0][1]]);
      else if (r0 === 0) pts.unshift([pts[0][0], -60]);
      else if (r0 === this.map.rows - 1) pts.unshift([pts[0][0], this.map.rows * CELL + 60]);
      const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      return { pts, cum, len: cum[cum.length - 1], cells };
    }
    posAt(path, d) {
      const { pts, cum } = path; d = U.clamp(d, 0, path.len);
      let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
      const t = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t, pts[i][0] - pts[i - 1][0]];
    }

    /* ---------------- building / merging ---------------- */
    cellFree(c, r) { return c >= 0 && r >= 0 && c < this.map.cols && r < this.map.rows && this.map.grid[r][c] === 0 && !this.towerAt(c, r); }
    towerAt(c, r) { return this.towers.find(t => t.c === c && t.r === r); }
    canAfford(n) { return this.gold >= n; }
    build(c, r, el) {
      if (!this.cellFree(c, r)) return { ok: false, msg: 'สร้างที่นี่ไม่ได้' };
      if (this.gold < C.TOWER_COST) return { ok: false, msg: 'ทองไม่พอ' };
      this.gold -= C.TOWER_COST;
      const t = this.addTower(ED.basicCounts(el), c, r, C.TOWER_COST);
      this.stats.built++; ED.T.add('builds'); ED.T.add('trades'); ED.T.set('elemBuilt', el); ED.T.max('maxTowersField', this.towers.length); this.refreshSnapshot();
      FX.ring(t.x, t.y + 30, el, 10, 60, 0.5, 6); FX.burst(t.x, t.y, el, 14, 140, 26, { up: 80 });
      ED.Audio.play('build');
      this.discover(t.spec);
      return { ok: true, tower: t };
    }
    addTower(counts, c, r, value) {
      const spec = ED.towerSpec(counts);
      const t = { id: UID++, c, r, x: c * CELL + CELL / 2, y: r * CELL + CELL / 2, counts: counts.slice(), spec, value, cd: 0.3, skillCd: spec.skill ? spec.skill.cd * 0.5 : 0, mode: 'first', born: this.time, recoil: 0, kills: 0, dmg: 0, aim: 0 };
      this.towers.push(t); return t;
    }
    sell(t) {
      const refund = Math.floor(t.value * C.SELL_REFUND);
      this.gold += refund; this.towers = this.towers.filter(x => x !== t); this.stats.sells = (this.stats.sells || 0) + 1; ED.T.add('sellGold', refund); ED.T.add('trades');
      FX.text(t.x, t.y - 40, '+' + refund, '#ffd84a', 26, { bold: 1 }); FX.burst(t.x, t.y, 'LIGHT', 10, 120, 20);
      ED.Audio.play('sell'); this.refreshSnapshot();
    }
    merge(list, anchor) {
      const chk = ED.mergeCheck(list, this.gold, this.freeMerges);
      if (!chk.ok) return { ok: false, msg: chk.reasons.join(' · ') };
      anchor = anchor || list[0];
      if (chk.free) { this.freeMerges--; ED.T.add('freeMergesUsed'); } else this.gold -= chk.fee;
      const value = list.reduce((a, t) => a + t.value, 0) + chk.fee;
      // เอฟเฟกต์: พลังงานพุ่งเข้าหาหอหลัก
      list.forEach(t => {
        if (t !== anchor) { FX.lightning([[t.x, t.y - 50], [anchor.x, anchor.y - 50]], t.spec.dom, 0.5, 5); FX.burst(t.x, t.y - 30, t.spec.dom, 16, 160, 26); }
      });
      this.towers = this.towers.filter(t => !list.includes(t));
      const nt = this.addTower(chk.counts, anchor.c, anchor.r, value);
      nt.mode = anchor.mode; nt.kills = list.reduce((a, t) => a + t.kills, 0);
      nt.mergeFx = 1.2;
      const el = nt.spec.dom;
      FX.pillar(nt.x, nt.y + 30, el, 46, 600, 0.9);
      FX.ring(nt.x, nt.y + 30, el, 10, 160, 0.8, 10); FX.ring(nt.x, nt.y + 30, nt.spec.sec || el, 10, 120, 0.6, 6);
      FX.burst(nt.x, nt.y - 40, el, 40, 260, 34, { up: 120 });
      FX.shake(8, 0.3);
      this.stats.merges++; ED.T.add('merges'); if (nt.spec.tier >= 3) ED.T.add('tier3made'); if (nt.spec.tier >= 5) ED.T.add('tier5made'); if (nt.spec.k >= 3) ED.T.add('triMade');
      ED.Audio.play('merge');
      this.discover(nt.spec); this.refreshSnapshot();
      return { ok: true, tower: nt, fee: chk.fee };
    }
    discover(spec) {
      const d = ED.save.data.discovered;
      if (!d[spec.key]) { d[spec.key] = 1; this.newDiscoveries.push(spec); if (spec.u > 1) ED.Audio.play('discover'); ED.ui && ED.ui.onDiscover(spec); }
    }

    /* ---------------- waves ---------------- */
    callWave() {
      if (this.waveIdx >= this.waves.length) return 0;
      let bonus = 0;
      if (this.started && this.nextWaveTimer > 0) bonus = Math.floor(this.nextWaveTimer * C.EARLY_CALL_BONUS * Math.pow(C.GOLD_GROWTH, this.stage - 1));
      this.gold += bonus; if (bonus > 0) { ED.T.add('earlyCalls'); ED.T.add('goldEarned', bonus); }
      this.waveKills = 0; if (!this.started) this.startT = this.time;
      const w = this.waves[this.waveIdx];
      this.spawners.push({ w, i: 0, t: 0, idx: this.waveIdx });
      this.waveIdx++;
      this.nextWaveTimer = this.waveIdx < this.waves.length ? C.WAVE_GAP + Math.min(25, w.duration) : 0;
      if (this.waveIdx > 1) { const wb = Math.round((C.WAVE_CLEAR_GOLD + 0.6 * this.waveIdx) * Math.pow(C.GOLD_GROWTH, this.stage - 1)); this.gold += wb; bonus += wb; ED.T.add('goldEarned', wb); ED.T.add('waveBonuses'); }
      this.started = true; this.state = 'run';
      ED.Audio.play('wave');
      w.groups.forEach(g => { ED.save.data.seen[g.sp.key] = 1; });
      if (w.groups.some(g => g.boss === true)) { ED.ui && ED.ui.banner('⚠ บอสใหญ่ปรากฏตัว!', '#ff5a5a'); ED.Audio.play('boss'); }
      else if (w.groups.some(g => g.boss === 'mini')) { ED.ui && ED.ui.banner('⚠ มินิบอส!', '#ffb02e'); ED.Audio.play('boss'); }
      if (this.waveIdx % 10 === 0 && this.waveIdx < this.waves.length) this.spawnLoot(1 + (Math.random() < 0.5 ? 1 : 0));
      return bonus;
    }
    spawnMonster(q) {
      const path = this.paths[q.path % this.paths.length];
      const st = ED.monsterStats(q.sp, this.stage, q.waveIdx || 0, q.elite, q.boss);
      const T = ED.TRAITS[q.sp.trait];
      const m = {
        id: UID++, sp: q.sp, path, d: q.d || 0, x: 0, y: 0, hp: st.hp * (q.hpMul || 1), maxHp: st.hp * (q.hpMul || 1), baseSpd: st.spd * (q.spdMul || 1), armor: st.armor,
        gold: Math.max(1, Math.round(st.gold * (q.goldMul || 1))), leak: q.child ? 1 : st.leak, size: st.size * (q.sizeMul || 1), elite: q.elite, boss: q.boss, child: q.child,
        flying: !!T.fly, trait: q.sp.trait, el: q.sp.el, shield: T.shield ? st.hp * T.shield : 0, shieldMax: T.shield ? st.hp * T.shield : 0,
        st: {}, icd: {}, lastHit: -9, dashT: 0, dashCd: 2 + Math.random() * 2, healCd: 2.5, hitFlash: 0, spdMul: 1, face: 1, alive: true, lastTower: null,
      };
      if (m.boss) { m.shieldMax += m.maxHp * 0.15; m.shield += m.maxHp * 0.15; }
      const p = this.posAt(path, m.d); m.x = p[0]; m.y = p[1];
      this.monsters.push(m);
      if (q.boss) { FX.shake(10, 0.5); FX.ring(m.x, m.y + 20, m.el, 10, 140, 0.8, 10); }
      return m;
    }

    /* ---------------- damage & status ---------------- */
    setT(m, key, amt, dur) {
      if (key === 'stun' || key === 'root') { dur *= Math.pow(0.75, m.ten || 0); m.ten = (m.ten || 0) + 1; if (dur < 0.05) return; }
      const s = m.st[key]; if (!s) m.st[key] = [amt, dur]; else { s[0] = Math.max(s[0], amt); s[1] = Math.max(s[1], dur); } }
    stat(m, key) { const s = m.st[key]; return s && s[1] > 0 ? s[0] : 0; }
    /* amount = ดาเมจพื้นฐาน; shares = สัดส่วนธาตุของแหล่งดาเมจ */
    hit(m, amount, src, opts) {
      if (!m.alive) return 0;
      opts = opts || {};
      const spec = src && src.spec;
      const shares = opts.shares || (spec ? spec.shares : [0, 0, 0, 0, 0, 0]);
      // หลบหลีก
      const ev = this.stat(m, 'evade');
      if (!opts.pure && ev > 0 && Math.random() < ev) { if (!opts.noText) FX.text(m.x, m.y - 50, 'หลบ!', '#cfd8ff', 18); return 0; }
      let mult = 0;
      if (opts.forceMult) mult = opts.forceMult;
      else for (let i = 0; i < 6; i++) if (shares[i]) mult += shares[i] * ED.mult(ED.EL[i], m.el);
      if (opts.pure) mult = Math.max(mult, 0.4);
      const vuln = 1 + this.stat(m, 'vuln') + this.stat(m, 'curse');
      const armor = Math.max(0, m.armor - this.stat(m, 'armorDown'));
      let crit = false;
      if (!opts.pure && spec && Math.random() < spec.mod.crit) crit = true;
      let dmg = amount * mult * vuln * (1 - armor) * (crit ? 2 : 1) * (this.overtime ? 1 : 1);
      if (m.shield > 0) { const a = Math.min(m.shield, dmg); m.shield -= a; dmg -= a; if (a > 0 && Math.random() < 0.3) FX.ring(m.x, m.y - 30, 'WATER', 20, 34, 0.2, 3, 1); }
      m.hp -= dmg; m.lastHit = this.time; m.hitFlash = 0.12;
      if (src) { src.dmg = (src.dmg || 0) + dmg; m.lastTower = src; }
      this.stats.dmg += dmg;
      if (!opts.noText) {
        const total = dmg + 0;
        const rel = spec ? ED.relation(spec.dom, m.el) : 'neu';
        const col = crit ? '#ff4fd8' : rel === 'adv' ? '#ffb02e' : rel === 'dis' ? '#9aa3b5' : '#ffffff';
        const sz = crit ? 30 : rel === 'adv' ? 26 : rel === 'dis' ? 17 : 21;
        FX.text(m.x, m.y - 46 * m.size, U.fmt(total) + (crit ? '!' : ''), col, sz, { bold: crit || rel === 'adv' });
        if (rel === 'adv' && Math.random() < 0.35) FX.text(m.x + 26, m.y - 70 * m.size, '×' + C.ADV_MULT, '#ffcc4a', 16);
        if (rel === 'dis' && Math.random() < 0.25) FX.text(m.x + 26, m.y - 70 * m.size, '×' + C.DIS_MULT, '#8892a6', 15);
      }
      if (spec && !opts.pure && !opts.noText) { const rl = ED.relation(spec.dom, m.el); if (rl === 'adv') ED.T.add('advHits'); else if (rl === 'dis') ED.T.add('disHits'); }
      // Elemental Interaction (แยกจากตัวคูณ)
      if (!opts.noProc && spec) {
        for (let i = 0; i < 6; i++) {
          if (!shares[i]) continue; const e = ED.EL[i];
          if ((m.icd[e] || 0) > this.time) continue;
          const rel = ED.relation(e, m.el);
          if (Math.random() < ED.procChance(rel) * shares[i] * (opts.procMul || 1)) {
            m.icd[e] = this.time + C.PROC_ICD;
            this.interact(m, ED.INTERACT[e + '>' + m.el], dmg / Math.max(0.05, mult), src);
          }
        }
      }
      // on-hit modifiers
      if (opts.mods && spec) this.applyMods(m, spec, dmg, opts.modScale || 1);
      if (opts.extra) this.applyExtra(m, opts.extra, dmg);
      if (m.hp <= 0) this.kill(m);
      return dmg;
    }
    applyMods(m, spec, dmg, k) {
      const md = spec.mod, P = spec.P;
      if (md.burn) this.setT(m, 'burn', dmg * md.burn * k, 2);
      if (md.armorDown) this.setT(m, 'armorDown', md.armorDown, 3);
      if (md.stun && Math.random() < md.stun * k && !m.boss) this.setT(m, 'stun', 1, 0.35);
      if (md.slow) this.setT(m, 'slow', md.slow, 1.5);
      if (spec.pattern === 'frost') this.setT(m, 'slow', P.frostSlow, P.frostDur);
      if (spec.pattern === 'curse') { this.setT(m, 'poison', dmg * P.curse / 3, 3); this.setT(m, 'armorDown', 0.1, 3); }
      if (spec.pattern === 'quake' && !m.flying && !m.boss && Math.random() < P.quakeStun) this.setT(m, 'stun', 1, 0.4);
    }
    applyExtra(m, x, dmg) {
      if (x.burn) this.setT(m, 'burn', dmg * x.burn, x.dur || 3);
      if (x.vuln) this.setT(m, 'vuln', x.vuln, x.dur || 3);
      if (x.armorDown) this.setT(m, 'armorDown', x.armorDown, x.dur || 4);
      if (x.stun && (!m.boss || x.bossOK)) this.setT(m, 'stun', 1, x.stun * (m.boss ? 0.4 : 1));
      if (x.slow) this.setT(m, 'slow', x.slow, x.dur || 2);
      if (x.root && !m.boss) this.setT(m, 'root', 1, x.root);
      if (x.poison) this.setT(m, 'poison', x.poison, x.dur || 5);
      if (x.plague) m.plague = x.plague;
      if (x.knock) { m.d = Math.max(0, m.d - x.knock * CELL * (m.boss ? 0.35 : 1) * Math.pow(0.75, m.ten || 0)); m.ten = (m.ten || 0) + 1; }
      if (x.curse) this.setT(m, 'curse', x.curse, x.dur || 4);
    }
    riderExtra(sk) {
      switch (sk.rider) {
        case 'FIRE': return { burn: 0.3, dur: 3 };
        case 'LIGHT': return { vuln: 0.15, dur: 3 };
        case 'DARK': return { armorDown: 0.3, dur: 4 };
        case 'EARTH': return { stun: 0.4 };
        case 'WATER': return { slow: 0.3, dur: 2 };
        default: return null;
      }
    }
    interact(m, it, base, src) {
      if (!it) return;
      const f = it.fx;
      ED.T.add('interactions'); ED.T.set('interTypes', it.id + ':' + m.el + '<' + (src && src.spec ? src.spec.dom : ''));
      const col = it.good ? '#7dffb0' : '#ff7a7a';
      FX.text(m.x, m.y - 80 * m.size, it.th, col, 17, { life: 1.1, vy: -40 });
      if (f.burn) { this.setT(m, 'burn', base * f.burn, f.dur); FX.burst(m.x, m.y - 20, 'FIRE', 8, 90, 24, { up: 60 }); }
      if (f.poison) this.setT(m, 'poison', base * f.poison, f.dur);
      if (f.slow) this.setT(m, 'slow', f.slow, f.dur);
      if (f.stun && !m.boss) { this.setT(m, 'stun', 1, f.stun); FX.ring(m.x, m.y - 10, 'EARTH', 10, 30, 0.3, 3, 1); }
      if (f.vuln) this.setT(m, 'vuln', f.vuln, f.dur);
      if (f.armorDown) this.setT(m, 'armorDown', f.armorDown, f.dur);
      if (f.reveal) this.setT(m, 'reveal', 1, f.dur || 3);
      if (f.evadeClear && m.st.evade) m.st.evade[1] = 0;
      if (f.shieldBreak && m.shield > 0) { m.shield = 0; FX.burst(m.x, m.y - 30, 'WIND', 10, 150, 20); }
      if (f.calm) { if (m.st.enrage) m.st.enrage[1] = 0; this.setT(m, 'weaken', 0.5, 3); }
      if (f.enrage) { this.setT(m, 'enrage', f.enrage, f.dur); FX.burst(m.x, m.y - 30, 'FIRE', 12, 120, 26, { up: 90 }); }
      if (f.haste) this.setT(m, 'haste', f.haste, f.dur);
      if (f.evade) { this.setT(m, 'evade', f.evade, f.dur); if (f.cloud) { FX.smoke(m.x, m.y - 20, '#e8f2ff', 6, 60, 1.2); this.monsters.forEach(o => { if (o !== m && U.dist(o.x, o.y, m.x, m.y) < CELL) this.setT(o, 'evade', f.evade, f.dur); }); } }
      if (f.shieldGain) { m.shield += m.maxHp * f.shieldGain; m.shieldMax = Math.max(m.shieldMax, m.shield); }
      if (f.burstAoe) { FX.ring(m.x, m.y - 20, 'LIGHT', 10, 90, 0.35, 5, 1); FX.ring(m.x, m.y - 20, 'DARK', 10, 70, 0.35, 4, 1); this.monsters.forEach(o => { if (o !== m && U.dist(o.x, o.y, m.x, m.y) < CELL * 0.9) this.hit(o, base * f.burstAoe, src, { noProc: true, pure: true, noText: false }); }); }
      if (f.heal && !this.stat(m, 'healBlock')) { m.hp = Math.min(m.maxHp, m.hp + m.maxHp * f.heal); FX.text(m.x - 20, m.y - 60, '+' + U.fmt(m.maxHp * f.heal), '#62ff8a', 16); }
      if (f.cleanse) { m.shield = 0; this.setT(m, 'healBlock', 1, 3); }
      if (f.healBlock) this.setT(m, 'healBlock', 1, f.dur);
      if (f.weaken) this.setT(m, 'weaken', f.weaken, f.dur);
      if (f.ground && m.flying) this.setT(m, 'ground', 1, f.dur);
      if (f.knock) { m.d = Math.max(0, m.d - f.knock * CELL * (m.boss ? 0.3 : 1) * Math.pow(0.75, m.ten || 0)); m.ten = (m.ten || 0) + 1; }
    }
    kill(m) {
      if (!m.alive) return; m.alive = false;
      this.gold += m.gold; this.stats.kills++; ED.T.add('goldEarned', m.gold); ED.T.add('kills'); ED.T.set('speciesKilled', m.sp.key);
      this.waveKills++; ED.T.max('maxKillsWave', this.waveKills);
      if (m.boss) { ED.T.add('bossKills'); ED.T.set('bossTraits', m.trait); if (m.boss === true) { ED.T.add('bigBossKills'); if (this.towers.length <= 5) ED.T.max('bossFew5', 1); if (this.towers.length <= 3) ED.T.max('bossFew3', 1); if (this.castleHp >= this.castleMax) ED.T.add('bossNoDamage'); } }
      if (m.lastTower) m.lastTower.kills++;
      FX.text(m.x, m.y - 20, '+' + m.gold, '#ffd84a', 18, { vy: -50 }); if (m.elite || m.boss) ED.Audio.play('coin');
      FX.impact(m.x, m.y - 20, m.el, m.boss || m.elite);
      FX.burst(m.x, m.y - 20, m.el, m.boss ? 40 : 12, m.boss ? 300 : 150, m.boss ? 50 : 26);
      FX.smoke(m.x, m.y - 10, '#2a2238', m.boss ? 10 : 3, m.boss ? 80 : 36, 0.9);
      if (m.boss) { FX.shake(14, 0.6); ED.Audio.play('boom'); } else ED.Audio.play('die');
      // แตกตัว
      if (ED.TRAITS[m.trait].split && !m.child) {
        for (let i = 0; i < 2; i++) {
          const c = this.spawnMonster({ sp: m.sp, path: this.paths.indexOf(m.path), d: Math.max(0, m.d - 20 - i * 26), elite: false, boss: false, child: true, hpMul: 0.35 * (m.boss ? 0.3 : 1) * (m.maxHp / ED.monsterStats(m.sp, this.stage, 0).hp) / 1, sizeMul: 0.7, goldMul: 0.3, spdMul: 1.2 });
          c.maxHp = c.hp = m.maxHp * 0.35; c.shield = c.shieldMax = 0;
        }
      }
      // โรคระบาดแพร่
      if (m.plague) {
        const near = this.monsters.filter(o => o.alive && o !== m && U.dist(o.x, o.y, m.x, m.y) < CELL * 2).sort((a, b) => U.dist(a.x, a.y, m.x, m.y) - U.dist(b.x, b.y, m.x, m.y)).slice(0, 2);
        near.forEach(o => { this.setT(o, 'poison', m.plague, 5); o.plague = m.plague; FX.lightning([[m.x, m.y - 20], [o.x, o.y - 20]], 'DARK', 0.4, 3); });
      }
    }

    /* ---------------- loot (สมบัติ/วัตถุที่ยิงแตกได้) ---------------- */
    makeLootEnt(l) {
      const L = ED.LOOT[l.kind];
      const maxHp = l.maxHp || Math.round(C.LOOT_BASE_HP * Math.pow(C.HP_GROWTH, this.stage - 1) * (1 + 0.06 * (this.waveIdx || 0)) * L.hp);
      return { id: UID++, c: l.c, r: l.r, kind: l.kind, el: l.el, prop: l.prop, x: l.c * CELL + 50, y: l.r * CELL + 50, maxHp, hp: l.hp != null ? l.hp : maxHp, alive: true, size: 1, isLoot: true, hitT: 0 };
    }
    lootAt(c, r) { return this.loots.find(l => l.alive && l.c === c && l.r === r); }
    spawnLoot(n) {
      const d = this.map.dist; const cells = [];
      for (let r = 0; r < this.map.rows; r++) for (let c = 0; c < this.map.cols; c++) {
        if (this.map.grid[r][c] !== 0 || this.towerAt(c, r) || d[r][c] < 1 || d[r][c] > 2) continue;
        if (Math.abs(c - this.map.castle.c) <= 1 && Math.abs(r - this.map.castle.r) <= 1) continue;
        cells.push([c, r]);
      }
      const rng = U.rng((this.seed ^ (this.waveIdx * 7919)) >>> 0);
      let made = 0;
      for (let i = 0; i < n && cells.length; i++) {
        const [c, r] = cells.splice(rng.int(cells.length), 1)[0];
        const L = this.makeLootEnt(ED.makeLoot(rng, c, r)); this.map.grid[r][c] = 2; this.loots.push(L); made++;
        FX.pillar(L.x, L.y + 40, L.el, 30, 300, 0.8); FX.burst(L.x, L.y, 'LIGHT', 20, 160, 24, { up: 80 });
      }
      if (made) { this.slotCanvas = ED.buildSlotCanvas(this.map); ED.ui && ED.ui.banner('✦ สมบัติปรากฏ!', '#ffd25a'); }
    }
    hitLoot(L, amount, t) {
      if (!L.alive) return;
      let mult = 0; const sh = t.spec.shares; for (let i = 0; i < 6; i++) if (sh[i]) mult += sh[i] * ED.mult(ED.EL[i], L.el);
      const dmg = amount * mult; L.hp -= dmg; L.hitT = 0.18; t.dmg = (t.dmg || 0) + dmg;
      const rel = ED.relation(t.spec.dom, L.el);
      FX.text(L.x, L.y - 40, U.fmt(dmg), rel === 'adv' ? '#ffb02e' : rel === 'dis' ? '#9aa3b5' : '#fff2c0', rel === 'adv' ? 24 : 19, { bold: rel === 'adv' });
      if (Math.random() < 0.5) FX.sparks(L.x, L.y, 'LIGHT', 3, 160);
      if (L.hp <= 0) this.breakLoot(L, t);
    }
    breakLoot(L, t) {
      L.alive = false; this.loots = this.loots.filter(x => x !== L);
      if (this.focusLoot === L) this.focusLoot = null;
      this.map.grid[L.r][L.c] = 0; this.slotCanvas = ED.buildSlotCanvas(this.map);
      const gs = Math.pow(C.GOLD_GROWTH, this.stage - 1) * (1 + 0.03 * this.waveIdx);
      let msg = '';
      ED.T.add('lootBroken'); ED.T.set('lootKinds', L.kind); if (L.kind === 'chest') ED.T.add('chests'); if (L.kind === 'crystal') { ED.T.add('crystals'); ED.T.set('crystalElems', L.el); } if (L.kind === 'fountain') ED.T.add('fountains');
      FX.pillar(L.x, L.y + 40, L.kind === 'crystal' ? L.el : 'LIGHT', 40, 520, 0.8);
      FX.ring(L.x, L.y + 40, L.kind === 'crystal' ? L.el : 'LIGHT', 10, 130, 0.6, 10);
      FX.burst(L.x, L.y, 'LIGHT', 30, 240, 28, { up: 140, grav: 200 });
      FX.smoke(L.x, L.y + 20, '#6a5236', 6, 50, 0.9); FX.shake(5, 0.2);
      for (let i = 0; i < 10 * FX.quality; i++) FX.add({ k: 'glow', x: L.x, y: L.y, vx: (Math.random() - 0.5) * 300, vy: -200 - Math.random() * 200, el: 'LIGHT', size: 18, life: 0.9, drag: 1, grav: 600 });
      switch (L.kind) {
        case 'crate': { const g = Math.round(C.LOOT_GOLD * gs); this.gold += g; ED.T.add('goldEarned', g); msg = `+${g} 🪙`; break; }
        case 'chest': {
          const g = Math.round(C.LOOT_GOLD * 3.5 * gs); this.gold += g; ED.T.add('goldEarned', g); msg = `+${g} 🪙`;
          if (Math.random() < 0.35) { const e = ED.EL[Math.floor(Math.random() * 6)]; const nt = this.addTower(ED.basicCounts(e), L.c, L.r, C.TOWER_COST); this.discover(nt.spec); msg += ` + หอ${ED.ELEMENT[e].th}ฟรี!`; }
          break;
        }
        case 'crystal': {
          const cnt = [0, 0, 0, 0, 0, 0]; cnt[ED.ELI[L.el]] = 2;
          const nt = this.addTower(cnt, L.c, L.r, C.TOWER_COST * 2); nt.mergeFx = 1.2; this.discover(nt.spec);
          msg = `ได้หอ ${nt.spec.name} ฟรี!`; break;
        }
        case 'mushroom': { const h = Math.min(8, this.castleMax - this.castleHp); this.castleHp += h; msg = `ปราสาท +${Math.round(h)} ❤`; break; }
        case 'fountain': { this.freeMerges++; const h = Math.min(4, this.castleMax - this.castleHp); this.castleHp += h; msg = `ตั๋วผสมฟรี +1 ⚗`; break; }
      }
      FX.text(L.x, L.y - 70, msg, '#ffe27a', 26, { bold: 1, life: 1.6, vy: -50 });
      ED.Audio.play('break'); ED.Audio.play('coin');
      ED.ui && ED.ui.onLoot && ED.ui.onLoot(L, msg);
      this.refreshSnapshot();
    }
    fireLoot(t, L) {
      const s = t.spec, lk = ED.towerLook(s);
      const mx = t.x, my = t.y + 40 + (lk.topY + 14) * lk.scale;
      t.recoil = 1; ED.Audio.play('shoot', s.dom); FX.burst(mx, my, s.dom, 3, 60, 20);
      this.shoot(t, L, mx, my, 1, s.pattern === 'beam' ? 'LIGHT' : s.dom);
    }

    /* ---------------- targeting ---------------- */
    canSee(t, m) {
      if (!m.alive) return false;
      if (m.trait === 'stealth' && !this.stat(m, 'reveal')) { if (!t.spec.seeStealth && U.dist(t.x, t.y, m.x, m.y) > CELL * 1.6) return false; }
      return true;
    }
    inRange(t, rangeMul) {
      const R = t.spec.range * CELL * (rangeMul || 1);
      return this.monsters.filter(m => m.alive && m.d > 10 && U.dist(t.x, t.y, m.x, m.y) <= R && this.canSee(t, m));
    }
    rank(t, list) {
      const rem = m => m.path.len - m.d;
      switch (t.mode) {
        case 'first': return list.sort((a, b) => rem(a) - rem(b));
        case 'last': return list.sort((a, b) => rem(b) - rem(a));
        case 'strong': return list.sort((a, b) => b.hp - a.hp);
        case 'weak': return list.sort((a, b) => a.hp - b.hp);
        case 'elem': return list.sort((a, b) => this.effMult(t, b) - this.effMult(t, a) || rem(a) - rem(b));
      }
      return list;
    }
    effMult(t, m) { let s = 0; for (let i = 0; i < 6; i++) if (t.spec.shares[i]) s += t.spec.shares[i] * ED.mult(ED.EL[i], m.el); return s; }

    /* ---------------- tower attacks ---------------- */
    fire(t, targets) {
      const s = t.spec, P = s.P, el = s.dom;
      const main = targets[0];
      t.aim = Math.atan2(main.y - t.y, main.x - t.x); t.recoil = 1;
      const lk = ED.towerLook(s); const mx = t.x, my = t.y + 40 + (lk.topY + 14) * lk.scale;
      ED.Audio.play('shoot', el);
      FX.burst(mx, my, el, 3, 60, 20);
      const extraN = s.pattern === 'multi' ? 0 : Math.min(s.mod.extra, targets.length - 1);
      switch (s.pattern) {
        case 'splash': case 'curse': case 'frost':
          for (let i = 0; i <= extraN; i++) this.shoot(t, targets[i], mx, my, i ? 0.7 : 1);
          break;
        case 'multi':
          for (let i = 0; i < Math.min(P.targets, targets.length); i++) this.shoot(t, targets[i], mx, my, 1);
          break;
        case 'beam':
          for (let i = 0; i <= extraN; i++) this.beam(t, targets[i], mx, my, i ? 0.7 : 1);
          break;
        case 'quake': {
          const ground = targets.filter(m => !m.flying || this.stat(m, 'ground'));
          if (!ground.length) { this.shoot(t, main, mx, my, 1, 'EARTH'); break; }
          FX.ring(t.x, t.y + 30, 'EARTH', 20, s.range * CELL, 0.45, 9);
          FX.ring(t.x, t.y + 30, s.sec || 'EARTH', 10, s.range * CELL * 0.7, 0.35, 5);
          FX.smoke(t.x, t.y + 30, '#6a5236', 6, 50, 0.8); FX.shake(2.5, 0.15);
          ground.forEach((m, i) => { this.hit(m, s.damage * (i ? 0.7 : 1), t, { mods: true }); FX.impact(m.x, m.y, 'EARTH', false); });
          break;
        }
      }
    }
    shoot(t, m, x, y, k, elOverride) {
      const s = t.spec;
      const el = elOverride || s.dom;
      const spd = { FIRE: 620, WIND: 900, DARK: 560, EARTH: 520, WATER: 760, LIGHT: 1100 }[el];
      this.projectiles.push({ t, m, x, y, el, spd, dmg: s.damage * k, vx: 0, vy: 0, arc: el === 'EARTH', sx: x, sy: y, prog: 0, size: 0.8 + s.tier * 0.12, sec: s.sec });
    }
    beam(t, m, x, y, k) {
      const s = t.spec; const R = s.range * CELL;
      const a = Math.atan2(m.y - 20 - y, m.x - x); const ex = x + Math.cos(a) * R * 1.05, ey = y + Math.sin(a) * R * 1.05;
      FX.beam(x, y, ex, ey, 'LIGHT', 6 + s.tier * 1.5, 0.22);
      if (s.sec) FX.beam(x, y, ex, ey, s.sec, 3, 0.2);
      let n = 0;
      this.monsters.forEach(o => {
        if (!o.alive || !this.canSee(t, o)) return;
        if (segDist(o.x, o.y - 20, x, y, ex, ey) < 30 * o.size + 8) { this.hit(o, s.damage * k * (n ? 0.75 : 1), t, { mods: true }); FX.burst(o.x, o.y - 20, 'LIGHT', 4, 100, 18); n++; }
      });
    }
    projectileHit(p) {
      if (p.m && p.m.isLoot) { FX.impact(p.x, p.y, p.el, false); this.hitLoot(p.m, p.dmg, p.t); return; }
      const s = p.t.spec, m = p.m;
      FX.impact(p.x, p.y, p.el, s.tier >= 4);
      if (p.sec && p.sec !== p.el) FX.burst(p.x, p.y, p.sec, 5, 110, 18);
      ED.Audio.play('hit');
      if (s.pattern === 'splash' || (s.pattern === 'frost' && s.P.splash)) {
        const R = s.P.splash * CELL;
        if (s.pattern === 'splash') FX.ring(p.x, p.y + 10, 'FIRE', 10, R, 0.3, 5);
        this.monsters.forEach(o => {
          if (!o.alive) return; const d = U.dist(o.x, o.y, p.x, p.y);
          if (o === m) return; if (d < R) this.hit(o, p.dmg * (s.pattern === 'splash' ? 0.6 : 0.5), p.t, { mods: true, modScale: 0.6, procMul: 0.5 });
        });
      }
      if (m && m.alive) this.hit(m, p.dmg, p.t, { mods: true });
    }

    /* ---------------- skills (21 ตระกูล) ---------------- */
    densest(list, r) {
      let best = null, bn = -1;
      list.forEach(m => { const n = list.filter(o => U.dist(o.x, o.y, m.x, m.y) < r).length; if (n > bn) { bn = n; best = m; } });
      return best;
    }
    cast(t) {
      const s = t.spec, sk = s.skill; if (!sk) return false;
      const inR = this.rank(t, this.inRange(t, sk.fam === 'WIND+EARTH' ? 1 : 1.1));
      if (!inR.length) return false;
      const el = s.dom, R = sk.radius * CELL, P = sk.power, ex = this.riderExtra(sk);
      const opt = (o) => Object.assign({ procMul: 0.6 }, o || {}, ex ? { extra: Object.assign({}, ex, (o && o.extra) || {}) } : {});
      FX.text(t.x, t.y - 120, sk.th + '!', ED.ELEMENT[el].glow, 24, { bold: 1, life: 1.2, vy: -40 });
      ED.Audio.play('skill');
      t.castFx = 0.6; ED.T.add('skills'); ED.T.set('skillFams', sk.fam);
      const main = inR[0];
      switch (sk.fam) {
        case 'FIRE': {
          FX.ring(t.x, t.y + 20, 'FIRE', 20, R, 0.6, 14); FX.ring(t.x, t.y + 20, 'LIGHT', 10, R * 0.8, 0.5, 6);
          FX.burst(t.x, t.y, 'FIRE', 50, R * 2.2, 40, { up: 60 }); FX.smoke(t.x, t.y, '#3a2020', 10, 70, 1); FX.shake(6, 0.3);
          this.monsters.forEach(m => { if (m.alive && U.dist(m.x, m.y, t.x, t.y) < R) this.hit(m, P, t, opt({ extra: { burn: 0.3, dur: 3 } })); });
          break;
        }
        case 'WIND': {
          for (let i = 0; i < sk.count; i++) { const m = inR[i % inR.length]; const a = (i / sk.count) * 6.28; this.projectiles.push({ t, m, x: t.x + Math.cos(a) * 40, y: t.y - 60 + Math.sin(a) * 20, el: 'WIND', spd: 950, dmg: P, skill: 1, size: 1.6, extra: ex }); }
          FX.ring(t.x, t.y - 40, 'WIND', 10, 90, 0.4, 6, 1); break;
        }
        case 'LIGHT': {
          const m = inR.slice().sort((a, b) => b.hp - a.hp)[0];
          FX.pillar(m.x, m.y + 10, 'LIGHT', 40, 900, 0.7); FX.ring(m.x, m.y + 10, 'LIGHT', 10, 90, 0.5, 8); FX.sparks(m.x, m.y, 'LIGHT', 20, 320); FX.shake(4, 0.2);
          this.hit(m, P, t, opt({ extra: { vuln: 0.25, dur: 4 } })); break;
        }
        case 'DARK': {
          FX.ring(t.x, t.y + 20, 'DARK', s.range * CELL, 20, 0.6, 10);
          inR.forEach(m => { this.applyExtra(m, { curse: 0.3, dur: sk.dur * 2, poison: P / sk.dur }, 0); FX.smoke(m.x, m.y - 20, '#3b1466', 4, 40, 1); FX.ring(m.x, m.y - 30, 'DARK', 30, 8, 0.5, 4, 1); if (ex) this.applyExtra(m, ex, P * 0.2); });
          break;
        }
        case 'EARTH': {
          FX.ring(t.x, t.y + 30, 'EARTH', 20, s.range * CELL * 1.1, 0.7, 16); FX.ring(t.x, t.y + 30, 'EARTH', 10, s.range * CELL * 0.6, 0.5, 8); FX.shake(12, 0.45);
          FX.smoke(t.x, t.y + 20, '#7a6040', 14, 80, 1.2);
          inR.forEach(m => { if (m.flying && !this.stat(m, 'ground')) return; this.hit(m, P, t, opt({ extra: { stun: sk.dur, bossOK: 1 } })); FX.impact(m.x, m.y, 'EARTH', true); });
          break;
        }
        case 'WATER': {
          FX.ring(t.x, t.y + 20, 'WATER', 20, s.range * CELL * 1.1, 0.7, 18); FX.burst(t.x, t.y, 'WATER', 40, 300, 30, { grav: 200, up: 120 });
          inR.forEach(m => { this.hit(m, P, t, opt({ extra: { knock: 1.2, slow: 0.4, dur: 2 } })); FX.burst(m.x, m.y - 10, 'WATER', 8, 140, 22, { grav: 300, up: 80 }); });
          break;
        }
        case 'FIRE+WIND': {
          this.zones.push({ type: 'tornado', el: 'FIRE', el2: 'WIND', t, path: main.path, d: main.d, x: main.x, y: main.y, r: CELL * 0.85, dur: sk.dur * 2, age: 0, dps: P, ex });
          break;
        }
        case 'FIRE+LIGHT': {
          const x = t.x, y = t.y - 70; const a = Math.atan2(main.y - 20 - y, main.x - x); const L = s.range * CELL * 1.4;
          const ex2 = x + Math.cos(a) * L, ey2 = y + Math.sin(a) * L;
          FX.beam(x, y, ex2, ey2, 'FIRE', 26, 0.55); FX.beam(x, y, ex2, ey2, 'LIGHT', 12, 0.5); FX.shake(5, 0.25);
          this.monsters.forEach(m => { if (m.alive && segDist(m.x, m.y - 20, x, y, ex2, ey2) < 46) { this.hit(m, P, t, opt({ extra: { burn: 0.25, dur: 3 } })); FX.burst(m.x, m.y - 20, 'FIRE', 8, 140, 26); } });
          break;
        }
        case 'FIRE+DARK': case 'FIRE+WATER': {
          const c = this.densest(inR, R);
          this.zones.push({ type: sk.fam === 'FIRE+DARK' ? 'hellfire' : 'steam', el: sk.fam === 'FIRE+DARK' ? 'FIRE' : 'WATER', el2: sk.fam === 'FIRE+DARK' ? 'DARK' : 'FIRE', t, x: c.x, y: c.y, r: R, dur: sk.dur * 2, age: 0, dps: P, ex });
          break;
        }
        case 'FIRE+EARTH': {
          const c = this.densest(inR, R);
          this.zones.push({ type: 'meteor', el: 'FIRE', t, x: c.x, y: c.y, r: R, dur: 0.7, age: 0, dmg: P, ex });
          break;
        }
        case 'WIND+LIGHT': {
          const hitSet = new Set([main]); const pts = [[t.x, t.y - 70], [main.x, main.y - 25]];
          let cur = main, dmg = P; this.hit(cur, dmg, t, opt());
          for (let i = 0; i < sk.count + 1; i++) {
            const nx = this.monsters.filter(o => o.alive && !hitSet.has(o) && U.dist(o.x, o.y, cur.x, cur.y) < CELL * 2.2).sort((a, b) => U.dist(a.x, a.y, cur.x, cur.y) - U.dist(b.x, b.y, cur.x, cur.y))[0];
            if (!nx) break; hitSet.add(nx); pts.push([nx.x, nx.y - 25]); dmg *= 0.9; this.hit(nx, dmg, t, opt()); cur = nx;
          }
          FX.lightning(pts, 'LIGHT', 0.35, 5); FX.lightning(pts, 'WIND', 0.3, 3); pts.forEach(([x, y]) => FX.burst(x, y, 'LIGHT', 5, 120, 20));
          break;
        }
        case 'WIND+DARK': {
          const c = this.densest(inR, R);
          this.zones.push({ type: 'vortex', el: 'DARK', el2: 'WIND', t, x: c.x, y: c.y, r: R, dur: sk.dur, age: 0, dps: P / sk.dur, ex });
          break;
        }
        case 'WIND+EARTH': {
          this.zones.push({ type: 'sandstorm', el: 'EARTH', el2: 'WIND', t, x: t.x, y: t.y, r: s.range * CELL, dur: sk.dur * 2, age: 0, dps: P, ex });
          break;
        }
        case 'WIND+WATER': {
          FX.ring(t.x, t.y + 20, 'WATER', 20, s.range * CELL * 1.1, 0.8, 14); FX.shake(4, 0.3);
          for (let i = 0; i < 60 * FX.quality; i++) { const a = Math.random() * 6.28, r = Math.random() * s.range * CELL; FX.add({ k: 'glow', x: t.x + Math.cos(a) * r, y: t.y + Math.sin(a) * r * 0.6 - 80, vx: -40, vy: 120, el: 'WATER', size: 12, life: 0.9, drag: 0 }); }
          inR.forEach(m => { this.hit(m, P, t, opt({ extra: { stun: sk.dur, bossOK: 1, slow: 0.3, dur: sk.dur + 1.5 } })); m.frozen = sk.dur * (m.boss ? 0.4 : 1) * Math.pow(0.75, m.ten || 0); FX.burst(m.x, m.y - 20, 'WATER', 6, 90, 22); });
          break;
        }
        case 'LIGHT+DARK': {
          const th = (8 + s.tier * 2) / 100; let executed = 0;
          inR.forEach(m => {
            if (!m.boss && m.hp / m.maxHp < th) { FX.pillar(m.x, m.y + 10, 'DARK', 30, 500, 0.5); FX.text(m.x, m.y - 80, 'ประหาร!', '#e0c2ff', 22, { bold: 1 }); m.hp = 0; m.lastTower = t; this.kill(m); executed++; }
          });
          if (!executed) { const m = inR.slice().sort((a, b) => b.hp - a.hp)[0]; FX.ring(m.x, m.y - 30, 'DARK', 60, 6, 0.5, 10, 1); FX.ring(m.x, m.y - 30, 'LIGHT', 70, 10, 0.5, 4, 1); this.hit(m, P, t, opt()); }
          break;
        }
        case 'LIGHT+EARTH': {
          const path = main.path; const pts = [];
          for (let d = 0; d < path.len; d += CELL * 0.5) { const p = this.posAt(path, d); if (U.dist(p[0], p[1], t.x, t.y) < s.range * CELL) pts.push(p); }
          const sel = pts.sort(() => Math.random() - 0.5).slice(0, sk.count);
          sel.forEach(([x, y], i) => {
            this.zones.push({ type: 'spike', el: 'LIGHT', t, x, y, r: CELL * 0.6, dur: 0.15 + i * 0.07, age: 0, dmg: P, ex });
          });
          break;
        }
        case 'LIGHT+WATER': {
          inR.slice(0, 6).forEach((m, i) => {
            const best = ED.EL.find(e => ED.beats(e, m.el));
            FX.beam(t.x, t.y - 70, m.x, m.y - 20, best, 8, 0.4); FX.burst(m.x, m.y - 20, best, 8, 140, 24);
            this.hit(m, P, t, opt({ forceMult: C.ADV_MULT, shares: ED.basicCounts(best) }));
          });
          break;
        }
        case 'DARK+EARTH': {
          const m = inR.slice().sort((a, b) => b.hp - a.hp)[0];
          FX.smoke(m.x, m.y - 20, '#5a7a2a', 8, 50, 1.2); FX.burst(m.x, m.y - 20, 'DARK', 12, 100, 24);
          this.applyExtra(m, { poison: P, dur: 5, plague: P * 0.7 }, 0); if (ex) this.applyExtra(m, ex, P);
          break;
        }
        case 'DARK+WATER': {
          const m = inR[0];
          FX.lightning([[t.x, t.y - 60], [m.x, m.y - 20]], 'DARK', 0.5, 6); FX.ring(m.x, m.y, 'DARK', 70, 10, 0.5, 8, 1);
          this.hit(m, P, t, opt({ extra: { knock: 2.5, slow: 0.3, dur: 2 } }));
          break;
        }
        case 'EARTH+WATER': {
          inR.slice(0, sk.count).forEach(m => {
            FX.ring(m.x, m.y + 10, 'EARTH', 40, 10, 0.5, 6); FX.burst(m.x, m.y, 'WIND', 10, 100, 20, { up: 100 });
            this.hit(m, P, t, opt({ extra: { root: sk.dur } }));
          });
          break;
        }
      }
      return true;
    }

    /* ---------------- update loop ---------------- */
    update(dt) {
      if (this.state !== 'run' && this.state !== 'prep') return;
      this.time += dt;
      FX.update(dt);
      if (this.state === 'prep') { this.updateTowers(dt); this.updateProjectiles(dt); this.loots.forEach(L => L.hitT = Math.max(0, L.hitT - dt)); return; }
      // เวลา
      this.timeLeft -= dt;
      if (this.timeLeft <= 0 && !this.overtime) { this.overtime = true; this.timeLeft = 0; ED.ui && ED.ui.banner('⏰ หมดเวลา! มอนสเตอร์คลั่ง', '#ff5a5a'); }
      const crowded = this.monsters.length >= C.MAX_ALIVE;
      if (this.waveIdx < this.waves.length && !crowded) { this.nextWaveTimer -= dt; if (this.nextWaveTimer <= 0) this.callWave(); }
      // spawners
      for (const sp of this.spawners) {
        if (crowded) break;
        sp.t += dt;
        while (sp.i < sp.w.queue.length && sp.w.queue[sp.i].t <= sp.t) { const q = Object.assign({ waveIdx: sp.idx }, sp.w.queue[sp.i]); this.spawnMonster(q); sp.i++; }
      }
      this.spawners = this.spawners.filter(s => s.i < s.w.queue.length);
      this.updateMonsters(dt);
      this.updateTowers(dt);
      this.updateProjectiles(dt);
      this.updateZones(dt);
      this.loots.forEach(L => L.hitT = Math.max(0, L.hitT - dt));
      this.monsters = this.monsters.filter(m => m.alive);
      if (this.castleHit > 0) this.castleHit -= dt;
      // snapshot เมื่อสนามว่าง
      if (!this.monsters.length && !this.spawners.length && this.waveIdx < this.waves.length) {
        if (!this._clean) { this._clean = true; this.snapshot = this.serialize(); ED.save.autosave(this); if (this.waveIdx > 0) { ED.T.add('wavesCleared'); ED.T.max('maxWave', this.waveIdx); this.noLeakRun = this.leakSince ? 0 : this.noLeakRun + 1; this.leakSince = false; ED.T.max('maxNoLeakWaves', this.noLeakRun); if (this.waveIdx >= 10 && this.time - (this.startT || 0) <= 180) ED.T.max('fast10', 1); ED.Audio.play('waveclear'); ED.ui && ED.ui.banner('✦ เคลียร์เวฟ ' + this.waveIdx + '!', '#7dffb0'); } }
      } else this._clean = false;
      // จบเกม
      if (this.castleHp <= 0) { this.castleHp = 0; this.end(false); }
      else if (this.waveIdx >= this.waves.length && !this.spawners.length && !this.monsters.length) this.end(true);
    }
    updateTowersIdle(dt) { this.towers.forEach(t => { t.recoil = Math.max(0, t.recoil - dt * 5); if (t.mergeFx) t.mergeFx = Math.max(0, t.mergeFx - dt); }); }
    updateMonsters(dt) {
      for (const m of this.monsters) {
        if (!m.alive) continue;
        for (const k in m.st) { const s = m.st[k]; if (s[1] > 0) s[1] -= dt; }
        m.hitFlash = Math.max(0, m.hitFlash - dt); if (m.ten) m.ten = Math.max(0, m.ten - dt * 0.2);
        if (m.frozen) m.frozen = Math.max(0, m.frozen - dt);
        // DoT
        const burn = this.stat(m, 'burn'), poison = this.stat(m, 'poison');
        if (burn) { m.hp -= burn * dt * (1 - m.armor * 0.5); if (Math.random() < dt * 8) FX.add({ k: 'glow', x: m.x + (Math.random() - .5) * 30, y: m.y - 20 - Math.random() * 30, vx: 0, vy: -60, el: 'FIRE', size: 18, life: 0.4 }); }
        if (poison) { m.hp -= poison * dt; if (Math.random() < dt * 5) FX.add({ k: 'glow', x: m.x + (Math.random() - .5) * 30, y: m.y - 20, vx: 0, vy: -40, el: 'DARK', size: 14, life: 0.5 }); }
        if ((burn || poison) && m.hp <= 0) { this.kill(m); continue; }
        const T = ED.TRAITS[m.trait];
        if (T.regen && !this.stat(m, 'healBlock')) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * T.regen * dt);
        if (m.shieldMax && this.time - m.lastHit > 5 && m.shield < m.shieldMax) m.shield = Math.min(m.shieldMax, m.shield + m.shieldMax * 0.1 * dt);
        if (T.healer) { m.healCd -= dt; if (m.healCd <= 0) { m.healCd = 2.5; FX.ring(m.x, m.y, 'WIND', 10, CELL * 1.6, 0.5, 4); this.monsters.forEach(o => { if (o.alive && U.dist(o.x, o.y, m.x, m.y) < CELL * 1.6 && !this.stat(o, 'healBlock')) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.04); FX.add({ k: 'glow', x: o.x, y: o.y - 40, vx: 0, vy: -50, el: 'WIND', size: 20, life: 0.6 }); } }); } }
        m.stealthed = m.trait === 'stealth' && !this.stat(m, 'reveal');
        // ความเร็ว
        let spd = m.baseSpd * CELL;
        const slow = Math.max(this.stat(m, 'slow'), 0);
        spd *= (1 - Math.min(0.8, slow));
        spd *= 1 + this.stat(m, 'enrage') + this.stat(m, 'haste');
        if (T.berserk && m.hp < m.maxHp * 0.5) { spd *= 1.6; if (Math.random() < dt * 6) FX.add({ k: 'glow', x: m.x, y: m.y - 30, vx: 0, vy: -40, el: 'FIRE', size: 16, life: 0.4 }); }
        if (T.dash) { m.dashCd -= dt; if (m.dashCd <= 0) { m.dashT = 0.6; m.dashCd = 3.5; FX.smoke(m.x, m.y, '#b8a080', 4, 30, 0.5); } if (m.dashT > 0) { m.dashT -= dt; spd *= 3; } }
        if (this.overtime) spd *= 1.35;
        if (this.stat(m, 'stun') || this.stat(m, 'root') || m.frozen > 0) spd = 0;
        m.spdMul = spd / (m.baseSpd * CELL || 1);
        m.d += spd * dt;
        const p = this.posAt(m.path, m.d); if (Math.abs(p[2]) > 0.1) m.face = p[2] > 0 ? 1 : -1; m.x = p[0]; m.y = p[1];
        if (m.d >= m.path.len) {
          m.alive = false;
          let dmg = m.leak * (1 + this.stat(m, 'enrage')) * (1 - this.stat(m, 'weaken')) * (this.overtime ? 2 : 1);
          dmg = Math.max(1, Math.round(dmg));
          this.castleHp -= dmg; this.stats.leaked++; this.castleHit = 0.4; this.leakSince = true;
          FX.text(m.x, m.y - 60, '-' + dmg, '#ff4a4a', 30, { bold: 1 }); FX.shake(6, 0.25); FX.impact(m.x, m.y - 30, m.el, true);
          ED.Audio.play('leak');
        }
      }
    }
    updateTowers(dt) {
      for (const t of this.towers) {
        t.recoil = Math.max(0, t.recoil - dt * 5); if (t.mergeFx) t.mergeFx = Math.max(0, t.mergeFx - dt); if (t.castFx) t.castFx = Math.max(0, t.castFx - dt);
        t.cd -= dt; if (t.spec.skill) t.skillCd -= dt;
        if (t.cd > 0 && (!t.spec.skill || t.skillCd > 0)) continue;
        const list = this.state === 'run' ? this.rank(t, this.inRange(t)) : [];
        const R = t.spec.range * CELL;
        let loot = null;
        if (this.focusLoot && this.focusLoot.alive && U.dist(t.x, t.y, this.focusLoot.x, this.focusLoot.y) <= R) loot = this.focusLoot;
        else if (!list.length && this.loots.length) { let bd = 1e9; for (const L of this.loots) { const d = U.dist(t.x, t.y, L.x, L.y); if (L.alive && d <= R && d < bd) { bd = d; loot = L; } } }
        if (!list.length && !loot) continue;
        if (t.cd <= 0) { if (loot) this.fireLoot(t, loot); else this.fire(t, list); t.cd = 1 / t.spec.rate; }
        if (list.length && t.spec.skill && t.skillCd <= 0) { if (this.cast(t)) t.skillCd = t.spec.skill.cd; else t.skillCd = 0.3; }
      }
    }
    updateProjectiles(dt) {
      for (const p of this.projectiles) {
        if (p.done) continue;
        const target = p.m && p.m.alive ? p.m : null;
        if (target) { p.tx = target.x; p.ty = target.y - 22 * target.size; }
        if (p.tx == null) { p.done = true; continue; }
        if (p.arc) { // หินโค้ง
          p.prog += dt * p.spd / Math.max(80, U.dist(p.sx, p.sy, p.tx, p.ty));
          const k = Math.min(1, p.prog);
          const nx = U.lerp(p.sx, p.tx, k), ny = U.lerp(p.sy, p.ty, k) - Math.sin(k * Math.PI) * 90;
          p.vx = nx - p.x; p.vy = ny - p.y; p.x = nx; p.y = ny;
          FX.trail(p);
          if (k >= 1) { p.done = true; this.projectileHit(p); }
          continue;
        }
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        const step = p.spd * dt;
        if (d <= step + 6) {
          p.done = true; p.x = p.tx; p.y = p.ty;
          if (p.skill) { FX.impact(p.x, p.y, p.el, true); if (target) this.hit(target, p.dmg, p.t, { procMul: 0.6, extra: p.extra || undefined }); }
          else if (target) this.projectileHit(p);
          else FX.impact(p.x, p.y, p.el, false);
          continue;
        }
        p.vx = dx / d * p.spd; p.vy = dy / d * p.spd; p.x += p.vx * dt; p.y += p.vy * dt;
        FX.trail(p);
      }
      this.projectiles = this.projectiles.filter(p => !p.done);
    }
    updateZones(dt) {
      for (const z of this.zones) {
        z.age += dt;
        const inside = () => this.monsters.filter(m => m.alive && U.dist(m.x, m.y, z.x, z.y) < z.r);
        switch (z.type) {
          case 'tornado': {
            z.d = Math.max(0, z.d - CELL * 0.9 * dt); const p = this.posAt(z.path, z.d); z.x = p[0]; z.y = p[1];
            inside().forEach(m => { this.hit(m, z.dps * dt, z.t, { noText: true, noProc: true }); this.applyExtra(m, { burn: 0.2, dur: 2, slow: 0.25 }, z.dps); if (z.ex) this.applyExtra(m, z.ex, z.dps * dt); });
            if (Math.random() < 0.9) { const a = z.age * 12 + Math.random() * 6.28; const h = Math.random() * 110; FX.add({ k: 'glow', x: z.x + Math.cos(a) * (14 + h * 0.35), y: z.y - h, vx: 0, vy: -40, el: Math.random() < 0.6 ? 'FIRE' : 'WIND', size: 26, life: 0.4 }); }
            break;
          }
          case 'hellfire': case 'steam': {
            inside().forEach(m => { this.hit(m, z.dps * dt, z.t, { noText: true, noProc: true }); if (z.type === 'steam') this.setT(m, 'armorDown', 0.3, 1); if (z.ex) this.applyExtra(m, z.ex, z.dps * dt); });
            if (Math.random() < 0.7 * FX.quality) {
              const a = Math.random() * 6.28, r = Math.random() * z.r;
              if (z.type === 'hellfire') FX.add({ k: 'glow', x: z.x + Math.cos(a) * r, y: z.y + Math.sin(a) * r * 0.5, vx: 0, vy: -80, el: Math.random() < 0.7 ? 'FIRE' : 'DARK', size: 30, life: 0.6 });
              else FX.smoke(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r * 0.5, '#eaf4ff', 1, 50, 1.1);
            }
            break;
          }
          case 'meteor': {
            if (!z.fell && z.age >= 0.6) {
              z.fell = true; FX.ring(z.x, z.y + 10, 'FIRE', 10, z.r * 1.2, 0.7, 18); FX.ring(z.x, z.y + 10, 'EARTH', 10, z.r, 0.6, 10);
              FX.burst(z.x, z.y, 'FIRE', 60, 360, 44, { up: 150 }); FX.smoke(z.x, z.y, '#3a2a20', 14, 90, 1.4); FX.shake(16, 0.5); ED.Audio.play('boom');
              for (let i = 0; i < 14 * FX.quality; i++) { const a = -Math.PI * Math.random(); FX.add({ k: 'spark', x: z.x, y: z.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 420, el: 'FIRE', life: 0.8, drag: 1, grav: 900, w: 5 }); }
              inside().forEach(m => this.hit(m, z.dmg, z.t, { procMul: 0.6, extra: Object.assign({ stun: 1, burn: 0.2, dur: 3 }, z.ex || {}) }));
            } else if (!z.fell) { // อุกกาบาตตกลงมา
              const k = z.age / 0.6; const mx = z.x + (1 - k) * 260, my = z.y - (1 - k) * 700;
              FX.add({ k: 'glow', x: mx, y: my, vx: 0, vy: 0, el: 'FIRE', size: 90, life: 0.12 }); FX.add({ k: 'glow', x: mx, y: my, vx: 0, vy: 0, el: 'LIGHT', size: 40, life: 0.1 });
              FX.smoke(mx, my, '#3a2a20', 1, 40, 0.6);
            }
            break;
          }
          case 'vortex': {
            inside().forEach(m => { this.hit(m, z.dps * dt, z.t, { noText: true, noProc: true }); this.setT(m, 'slow', 0.75, 0.2); if (z.ex) this.applyExtra(m, z.ex, z.dps * dt); });
            for (let i = 0; i < 2; i++) { const a = Math.random() * 6.28; const r = z.r * (0.4 + Math.random() * 0.6); FX.add({ k: 'glow', x: z.x + Math.cos(a) * r, y: z.y + Math.sin(a) * r * 0.5, vx: -Math.cos(a) * r * 1.6 - Math.sin(a) * 120, vy: -Math.sin(a) * r * 0.8 + Math.cos(a) * 60, el: Math.random() < 0.6 ? 'DARK' : 'WIND', size: 20, life: 0.5, drag: 0 }); }
            break;
          }
          case 'sandstorm': {
            inside().forEach(m => { this.hit(m, z.dps * dt, z.t, { noText: true, noProc: true }); this.setT(m, 'slow', 0.4, 0.3); if (z.ex) this.applyExtra(m, z.ex, z.dps * dt); });
            for (let i = 0; i < 3 * FX.quality; i++) { const a = Math.random() * 6.28, r = Math.random() * z.r; FX.add({ k: 'smoke', x: z.x + Math.cos(a) * r, y: z.y + Math.sin(a) * r * 0.6, vx: -Math.sin(a) * 160, vy: Math.cos(a) * 80, col: '#c9a46a', size: 34, life: 0.6, grow: 1 }); }
            break;
          }
          case 'spike': {
            if (!z.fell && z.age >= z.dur) {
              z.fell = true; FX.pillar(z.x, z.y + 10, 'LIGHT', 16, 120, 0.4); FX.ring(z.x, z.y + 10, 'LIGHT', 6, 50, 0.3, 5); FX.sparks(z.x, z.y, 'LIGHT', 6, 220);
              for (let i = 0; i < 5; i++) FX.add({ k: 'spark', x: z.x + (Math.random() - .5) * 30, y: z.y + 10, vx: (Math.random() - .5) * 40, vy: -260, el: 'EARTH', life: 0.35, drag: 2, grav: 0, w: 6 });
              inside().forEach(m => this.hit(m, z.dmg, z.t, { procMul: 0.5, extra: Object.assign({ stun: 0.3 }, z.ex || {}) }));
            }
            break;
          }
        }
      }
      this.zones = this.zones.filter(z => z.type === 'meteor' || z.type === 'spike' ? !z.fell : z.age < z.dur);
    }

    end(win) {
      if (this.state === 'won' || this.state === 'lost') return;
      this.state = win ? 'won' : 'lost';
      let stars = 0;
      if (this.endless) {   // โหมดไม่จำกัด: ให้ดาวตามจำนวนเวฟที่รอด
        this.survived = Math.max(0, this.waveIdx - (this.monsters.length || this.spawners.length ? 1 : 0));
        stars = this.survived >= 200 ? 3 : this.survived >= 100 ? 2 : this.survived >= 50 ? 1 : 0;
        const best = ED.save.data.best || (ED.save.data.best = {});
        this.prevBest = best[this.stage] || 0; best[this.stage] = Math.max(this.prevBest, this.survived);
      } else if (win) { const r = this.castleHp / this.castleMax; stars = this.overtime ? 1 : r >= 0.8 ? 3 : r >= 0.4 ? 2 : 1; }
      this.stars = stars;
      ED.save.stageEnd(this, win || stars > 0, stars);
      ED.T.onEnd(this, win, stars);
      ED.ui && ED.ui.onEnd(this, win, stars);
    }

    /* ---------------- save ---------------- */
    isClean() { return !this.monsters.length && !this.spawners.length; }
    refreshSnapshot() { if (this.isClean() && this.state !== 'won' && this.state !== 'lost') { this.snapshot = this.serialize(); ED.save.autosave(this); } }
    serialize() {
      return { stage: this.stage, seed: this.seed, gold: this.gold, castleHp: this.castleHp, waveIdx: this.waveIdx, timeLeft: this.timeLeft, overtime: this.overtime, started: this.started,
        towers: this.towers.map(t => ({ k: t.spec.key, c: t.c, r: t.r, v: t.value, m: t.mode, kills: t.kills })), stats: Object.assign({}, this.stats),
        loots: this.loots.filter(l => l.alive).map(l => ({ c: l.c, r: l.r, kind: l.kind, el: l.el, prop: l.prop, hp: l.hp, maxHp: l.maxHp })), freeMerges: this.freeMerges, waveCount: this.waveCount };
    }
    restore(s) {
      this.gold = s.gold; this.castleHp = s.castleHp; this.waveIdx = s.waveIdx; this.timeLeft = s.timeLeft == null ? Infinity : s.timeLeft; this.overtime = s.overtime; this.stats = Object.assign(this.stats, s.stats || {});
      this.started = s.started; this.nextWaveTimer = 0; this.state = 'prep';
      if (s.loots) {
        this.loots.forEach(l => { this.map.grid[l.r][l.c] = 0; });
        this.loots = s.loots.map(l => { this.map.grid[l.r][l.c] = 2; return this.makeLootEnt(l); });
        this.slotCanvas = ED.buildSlotCanvas(this.map);
      }
      this.freeMerges = s.freeMerges || 0;
      s.towers.forEach(o => { const t = this.addTower(ED.keyToCounts(o.k), o.c, o.r, o.v); t.mode = o.m || 'first'; t.kills = o.kills || 0; });
    }

    /* ---------------- render ---------------- */
    render(ctx, view) {
      const t = this.time; const [sx, sy] = FX.shakeOffset();
      ctx.save(); ctx.translate(sx, sy);
      ctx.drawImage(this.mapCanvas, 0, 0); ctx.drawImage(this.slotCanvas, 0, 0);
      // ระยิบระยับไบโอม
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const s of this.map.sparkles) { const a = 0.25 + 0.25 * Math.sin(t * 1.5 + s.p); ctx.globalAlpha = a; ctx.drawImage(FX.glowSprite('LIGHT'), s.x - 6 * s.s, s.y + Math.sin(t + s.p) * 6 - 6 * s.s, 12 * s.s, 12 * s.s); }
      ctx.restore();
      // ทางเข้า (portal)
      this.paths.forEach((p, i) => {
        const [x, y] = p.pts[1];
        const portal = ED.part('env', i % 2 ? 'prop053' : 'prop052');
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 3 + i);
        ctx.drawImage(FX.glowSprite(i % 2 ? 'DARK' : 'WATER'), x - 70, y - 80, 140, 140); ctx.restore();
        ctx.save(); ctx.globalAlpha = 0.9; ctx.translate(x, y + 30); ctx.drawImage(ED.IMG.env, portal.x, portal.y, portal.w, portal.h, -45, -88, 90, 90 * portal.h / portal.w); ctx.restore();
      });
      // โซน (ใต้ยูนิต)
      this.drawZones(ctx);
      // ระยะ / ช่องสร้าง
      if (view.showSlots) this.drawSlots(ctx, view);
      if (view.range) this.drawRange(ctx, view.range.x, view.range.y, view.range.r, view.range.el, view.range.ok !== false);
      // เรียงตามแกน y
      const ents = [];
      this.towers.forEach(tw => ents.push({ y: tw.y + 40, tw }));
      this.monsters.forEach(m => ents.push({ y: m.y + 20, m }));
      ents.push({ y: this.map.castle.r * CELL + 95, castle: 1 });
      this.loots.forEach(L => ents.push({ y: L.y + 42, loot: L }));
      ents.sort((a, b) => a.y - b.y);
      for (const e of ents) {
        if (e.tw) this.drawTowerEnt(ctx, e.tw, view);
        else if (e.m) ED.drawMonster(ctx, e.m, t);
        else if (e.loot) this.drawLoot(ctx, e.loot, view);
        else this.drawCastle(ctx);
      }
      this.projectiles.forEach(p => FX.drawProjectile(ctx, p, t));
      FX.draw(ctx);
      this.monsters.forEach(m => this.drawBars(ctx, m));
      // merge visual
      if (view.merge && view.merge.length) {
        const a = view.merge[0];
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        view.merge.forEach((tw, i) => {
          ctx.strokeStyle = ED.ELEMENT[tw.spec.dom].glow; ctx.lineWidth = 4; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 8);
          ctx.beginPath(); ctx.ellipse(tw.x, tw.y + 32, 44, 18, 0, 0, 7); ctx.stroke();
          if (i) { ctx.setLineDash([12, 10]); ctx.lineDashOffset = -t * 60; ctx.beginPath(); ctx.moveTo(tw.x, tw.y - 40); ctx.lineTo(a.x, a.y - 40); ctx.stroke(); ctx.setLineDash([]); }
        });
        ctx.restore();
      }
      if (view.drag) this.drawDrag(ctx, view.drag);
      FX.drawTexts(ctx);
      ctx.restore();
      // overtime tint
      if (this.overtime) { ctx.fillStyle = `rgba(255,30,30,${0.06 + 0.04 * Math.sin(t * 6)})`; ctx.fillRect(0, 0, this.W, this.H); }
      if (this.castleHit > 0) { ctx.fillStyle = `rgba(255,0,0,${this.castleHit * 0.35})`; ctx.fillRect(0, 0, this.W, this.H); }
    }
    drawTowerEnt(ctx, tw, view) {
      const sel = view.selected === tw;
      if (sel) { ctx.save(); ctx.strokeStyle = '#fff6c2'; ctx.lineWidth = 3; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.ellipse(tw.x, tw.y + 32, 46, 18, 0, 0, 7); ctx.stroke(); ctx.restore(); }
      const sc = tw.mergeFx ? 1 + Math.sin(tw.mergeFx * 10) * 0.08 * tw.mergeFx : 1;
      if (view.dragTower === tw) ctx.globalAlpha = 0.35;
      ED.drawTower(ctx, tw.spec, tw.x, tw.y + 40, this.time, { recoil: tw.recoil, scale: sc });
      ctx.globalAlpha = 1;
      if (tw.castFx) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = tw.castFx; ctx.drawImage(FX.glowSprite(tw.spec.dom), tw.x - 70, tw.y - 140, 140, 140); ctx.restore(); }
      // skill ready gem
      if (tw.spec.skill) {
        const k = 1 - Math.max(0, tw.skillCd) / tw.spec.skill.cd;
        ctx.save(); ctx.translate(tw.x + 34, tw.y + 30);
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
        ctx.strokeStyle = ED.ELEMENT[tw.spec.dom].color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 7, -Math.PI / 2, -Math.PI / 2 + k * 6.283); ctx.stroke();
        ctx.restore();
      }
      // tier pips
      ctx.save(); ctx.font = '700 15px Kanit, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.fillStyle = '#ffe9a8';
      const lab = ED.TIER_NAMES[tw.spec.tier]; ctx.strokeText(lab, tw.x - 34, tw.y + 38); ctx.fillText(lab, tw.x - 34, tw.y + 38); ctx.restore();
    }
    drawLoot(ctx, L, view) {
      const p = ED.part('env', L.prop); if (!p) return;
      const t = this.time; const sc = Math.min(86 / p.w, 96 / p.h);
      const w = p.w * sc, h = p.h * sc; const x = L.x + (L.hitT > 0 ? (Math.random() - 0.5) * 8 : 0), y = L.y + 44;
      ctx.save();
      // ออร่าล่อตา
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 3 + L.id);
      ctx.drawImage(ED.FX.glowSprite(L.kind === 'crystal' ? L.el : L.kind === 'mushroom' ? 'WIND' : L.kind === 'fountain' ? 'WATER' : 'LIGHT'), x - 60, y - h / 2 - 60, 120, 120);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y - 4, w * 0.4, 10, 0, 0, 7); ctx.fill();
      const bob = L.kind === 'crystal' ? Math.sin(t * 2 + L.id) * 3 : 0;
      ctx.drawImage(ED.IMG.env, p.x, p.y, p.w, p.h, x - w / 2, y - h + bob, w, h);
      if (L.hitT > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = L.hitT * 3; ctx.drawImage(ED.tinted(p, '#ffffff', 1), x - w / 2, y - h + bob, w, h); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
      // ประกายระยิบ
      if (Math.random() < 0.04) ED.FX.add({ k: 'glow', x: x + (Math.random() - 0.5) * w, y: y - Math.random() * h, vx: 0, vy: -20, el: 'LIGHT', size: 14, life: 0.6 });
      // แถบ HP + ไอคอนรางวัล
      const bw = 56, by = y - h - 16, k = Math.max(0, L.hp / L.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - bw / 2 - 2, by - 2, bw + 4, 8);
      ctx.fillStyle = '#ffd25a'; ctx.fillRect(x - bw / 2, by, bw * k, 4);
      ctx.drawImage(ED.FX.glowSprite(L.el), x - bw / 2 - 18, by - 8, 18, 18);
      ctx.font = '16px Kanit, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(ED.LOOT[L.kind].icon, x + bw / 2 + 12, by + 6);
      if (this.focusLoot === L || view.selectedLoot === L) {
        ctx.strokeStyle = this.focusLoot === L ? '#ff5a5a' : '#fff6c2'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 40;
        ctx.beginPath(); ctx.arc(x, y - h / 2, Math.max(w, h) * 0.62, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        if (this.focusLoot === L) { ctx.font = '700 15px Kanit, sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText('🎯 เป้าโฟกัส', x, by - 12); ctx.fillStyle = '#ff8a8a'; ctx.fillText('🎯 เป้าโฟกัส', x, by - 12); }
      }
      ctx.restore();
    }
    drawCastle(ctx) {
      const { c, r } = this.map.castle; const x = c * CELL + 50, y = r * CELL + 95;
      const p = ED.part('env', 'prop047');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 + 0.15 * Math.sin(this.time * 2); ctx.drawImage(FX.glowSprite('LIGHT'), x - 100, y - 190, 200, 200); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      if (this.castleHit > 0) ctx.translate((Math.random() - 0.5) * 8, 0);
      const w = 150, h = w * p.h / p.w; ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(x, y - 4, 64, 16, 0, 0, 7); ctx.fill();
      ctx.drawImage(ED.IMG.env, p.x, p.y, p.w, p.h, x - w / 2 - 6, y - h, w, h);
      // HP bar
      const bw = 120, k = this.castleHp / this.castleMax; const by = y - h - 14;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ED.roundRect(ctx, x - bw / 2 - 3, by - 3, bw + 6, 16, 6); ctx.fill();
      ctx.fillStyle = k > 0.5 ? '#4be38a' : k > 0.25 ? '#ffc24a' : '#ff4a4a'; ED.roundRect(ctx, x - bw / 2, by, bw * k, 10, 4); ctx.fill();
      ctx.restore();
    }
    drawBars(ctx, m) {
      if (!m.alive) return;
      const w = 46 * Math.max(0.8, m.size), x = m.x - w / 2, y = m.y - 66 * m.size - (m.flying ? 20 : 0);
      if (m.stealthed) ctx.globalAlpha = 0.4;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - 2, y - 2, w + 4, 9);
      ctx.fillStyle = m.boss ? '#ff3a6a' : m.elite ? '#ffb02e' : '#ff5a5a'; ctx.fillRect(x, y, w * Math.max(0, m.hp / m.maxHp), 5);
      if (m.shield > 0) { ctx.fillStyle = '#8fd8ff'; ctx.fillRect(x, y + 5, w * Math.min(1, m.shield / m.maxHp), 2); }
      // element gem
      ctx.drawImage(FX.glowSprite(m.el), x - 16, y - 7, 18, 18);
      // status icons
      const icons = [];
      if (this.stat(m, 'burn')) icons.push('🔥'); if (this.stat(m, 'slow') || m.frozen) icons.push('❄'); if (this.stat(m, 'stun') || this.stat(m, 'root')) icons.push('✦');
      if (this.stat(m, 'poison')) icons.push('☠'); if (this.stat(m, 'vuln') || this.stat(m, 'curse')) icons.push('⬇'); if (this.stat(m, 'enrage')) icons.push('💢'); if (this.stat(m, 'evade')) icons.push('〰');
      const ti = ED.TRAIT_ICON[m.trait];
      ctx.font = '700 13px Kanit, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
      if (ti) { ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(ti, x + w + 4, y + 6); ctx.fillText(ti, x + w + 4, y + 6); }
      if (icons.length) ctx.fillText(icons.join(''), x, y - 6);
      if (m.frozen > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6; ctx.drawImage(FX.glowSprite('WATER'), m.x - 34 * m.size, m.y - 70 * m.size, 68 * m.size, 80 * m.size); ctx.restore(); }
      ctx.globalAlpha = 1;
    }
    drawZones(ctx) {
      for (const z of this.zones) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const k = z.dur ? Math.min(1, z.age / 0.25) * Math.min(1, (z.dur - z.age) / 0.4 + 0.001) : 1;
        if (z.type === 'hellfire' || z.type === 'steam' || z.type === 'sandstorm' || z.type === 'vortex') {
          const E = ED.ELEMENT[z.el];
          const gr = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r); gr.addColorStop(0, E.color + '88'); gr.addColorStop(0.7, E.color + '33'); gr.addColorStop(1, E.color + '00');
          ctx.globalAlpha = Math.max(0, k) * 0.9; ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(z.x, z.y + 10, z.r, z.r * 0.55, 0, 0, 7); ctx.fill();
          ctx.strokeStyle = ED.ELEMENT[z.el2 || z.el].glow; ctx.lineWidth = 3; ctx.setLineDash([16, 12]); ctx.lineDashOffset = z.age * (z.type === 'vortex' ? 120 : 40);
          ctx.beginPath(); ctx.ellipse(z.x, z.y + 10, z.r * 0.95, z.r * 0.5, 0, 0, 7); ctx.stroke();
          if (z.type === 'vortex') { ctx.setLineDash([]); for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(z.x, z.y + 10, z.r * (0.3 + i * 0.22), z.r * (0.15 + i * 0.11), 0, z.age * 6 + i, z.age * 6 + i + 3.5); ctx.stroke(); } }
        } else if (z.type === 'tornado') {
          for (let i = 0; i < 6; i++) { const h = i * 20, w = 18 + i * 9; ctx.globalAlpha = 0.5 * k; ctx.strokeStyle = i % 2 ? ED.ELEMENT.FIRE.glow : ED.ELEMENT.FIRE.color; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(z.x + Math.sin(z.age * 8 + i) * 6, z.y - h, w, w * 0.32, 0, z.age * 10 + i, z.age * 10 + i + 4.5); ctx.stroke(); }
          ctx.globalAlpha = 0.7; ctx.drawImage(FX.glowSprite('FIRE'), z.x - 60, z.y - 90, 120, 130);
        } else if (z.type === 'meteor' && !z.fell) {
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(z.age * 30); ctx.strokeStyle = '#ff5a24'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(z.x, z.y + 10, z.r, z.r * 0.5, 0, 0, 7); ctx.stroke();
        }
        ctx.restore();
      }
    }
    drawSlots(ctx, view) {
      ctx.save();
      for (let r = 0; r < this.map.rows; r++) for (let c = 0; c < this.map.cols; c++) {
        if (!this.cellFree(c, r)) continue;
        const hl = view.hoverCell && view.hoverCell[0] === c && view.hoverCell[1] === r;
        ctx.fillStyle = hl ? 'rgba(120,255,170,0.35)' : 'rgba(120,255,170,0.10)'; ctx.strokeStyle = hl ? '#7dffb0' : 'rgba(150,255,190,0.35)'; ctx.lineWidth = 2;
        ED.roundRect(ctx, c * CELL + 8, r * CELL + 8, CELL - 16, CELL - 16, 14); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    drawRange(ctx, x, y, r, el, ok) {
      ctx.save(); const E = ED.ELEMENT[el] || ED.ELEMENT.LIGHT;
      ctx.fillStyle = ok ? E.color + '22' : 'rgba(255,60,60,0.15)'; ctx.strokeStyle = ok ? E.glow : '#ff6a6a'; ctx.lineWidth = 3; ctx.setLineDash([14, 10]); ctx.lineDashOffset = -this.time * 30;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    drawDrag(ctx, d) {
      ctx.save(); ctx.globalAlpha = 0.85;
      if (d.spec) ED.drawTower(ctx, d.spec, d.x, d.y + 40, this.time, { scale: 1.05 });
      ctx.restore();
    }
  }
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay; const l = dx * dx + dy * dy || 1; let t = ((px - ax) * dx + (py - ay) * dy) / l; t = U.clamp(t, 0, 1);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  ED.Game = Game;
})();
