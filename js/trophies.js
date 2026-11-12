/* ELEMENTAL DEFENDERS — Trophy / challenge system (200 ถ้วย)
   เก็บสถิติการเล่นทั้งหมดไว้ใน save.data.st แล้วตรวจเงื่อนไขของแต่ละถ้วย */
'use strict';
(function () {
  const T = ED.T = {};
  const LIST = window.ED_TROPHIES || [];
  T.LIST = LIST;
  T.RARITY = { Rare: { th: 'หายาก', c: '#4aa3ff' }, Epic: { th: 'มหากาพย์', c: '#b36bff' }, Legendary: { th: 'ตำนาน', c: '#ffb02e' }, Mythic: { th: 'มิธิค', c: '#ff4fd8' } };
  const META = new Set([165, 199, 200]);
  const st = () => { const d = ED.save.data; return d.st || (d.st = {}); };
  const won = () => { const d = ED.save.data; return d.trophies || (d.trophies = {}); };
  T.add = (k, n) => { const s = st(); s[k] = (s[k] || 0) + (n == null ? 1 : n); };
  T.max = (k, v) => { const s = st(); if (!(s[k] >= v)) s[k] = v; };
  T.set = (k, m) => { const s = st(); const o = s[k] || (s[k] = {}); o[m] = 1; };
  const size = (k) => Object.keys(st()[k] || {}).length;

  // หอที่ค้นพบตาม tier (แคชตามจำนวนที่ค้นพบ)
  let tierCache = { n: -1 };
  function tiers() {
    const keys = Object.keys(ED.save.data.discovered || {});
    if (tierCache.n === keys.length) return tierCache;
    const c = { n: keys.length, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, mixed: 0 };
    keys.forEach(k => { const cnt = ED.keyToCounts(k); const u = ED.unitsOf(cnt); c[ED.TIER_OF_UNITS(u)]++; if (u > 1) c.mixed++; });
    return tierCache = c;
  }
  T.value = function (k) {
    const s = st(), d = ED.save.data;
    if (k.startsWith('built_')) return (s.elemBuilt || {})[k.slice(6)] ? 1 : 0;
    if (k.startsWith('skill_')) return (s.skillFams || {})[k.slice(6)] ? 1 : 0;
    if (k.startsWith('biome_')) return (s.biomesWon || {})[k.slice(6)] ? 1 : 0;
    if (k.startsWith('perfect_')) return (s.perfectBiomes || {})[k.slice(8)] ? 1 : 0;
    if (k.startsWith('cat_')) { const cat = k.slice(4); return LIST.filter(t => t[1] === cat && won()[t[0]]).length; }
    switch (k) {
      case 'days': return size('daysSet');
      case 'discovered': return Object.keys(d.discovered || {}).length;
      case 'discoveredMixed': return tiers().mixed;
      case 'tier2forms': return tiers()[2]; case 'tier3forms': return tiers()[3]; case 'tier5forms': return tiers()[5];
      case 'seen': return Object.keys(d.seen || {}).length;
      case 'highest': return Math.max(0, (d.highest || 1) - 1);
      case 'stars3': return Object.values(d.stars || {}).filter(v => v >= 3).length;
      case 'totalStars': return ED.save.totalStars();
      case 'trophies': return Object.keys(won()).filter(id => !META.has(+id)).length;
      case 'legendaryTrophies': return LIST.filter(t => t[5] === 'Legendary' && won()[t[0]]).length;
      case 'mythicTrophies': return LIST.filter(t => t[5] === 'Mythic' && won()[t[0]]).length;
      case 'legendaryAll': return LIST.filter(t => t[5] === 'Legendary').every(t => won()[t[0]]) ? 1 : 0;
      case 'elemBuilt': case 'skillFams': case 'interTypes': case 'speciesKilled': case 'bossTraits': case 'lootKinds':
      case 'crystalElems': case 'biomesWon': case 'biomes100': case 'biomes200': case 'modesPlayed': case 'winTopElems': return size(k);
      case 'goldEarned': return Math.floor(s.goldEarned || 0);
      case 'playSec': return Math.floor(s.playSec || 0);
    }
    return s[k] || 0;
  };
  const target = (id, t) => (id === 165 || id === 199 || id === 200) && t[0] === 'trophies' ? LIST.length - META.size : t[1];
  T.progress = function (tr) {
    const c = tr[6][0]; const tg = target(tr[0], c); const v = T.value(c[0]);
    return { v, t: tg, k: Math.min(1, v / tg) };
  };
  T.done = (tr) => tr[6].every(c => T.value(c[0]) >= target(tr[0], c));
  T.isWon = (id) => !!won()[id];
  T.count = () => Object.keys(won()).length;

  let lastCheck = 0;
  T.check = function (force) {
    const now = performance.now(); if (!force && now - lastCheck < 1500) return []; lastCheck = now;
    const W = won(), fresh = [];
    for (let pass = 0; pass < 3; pass++) {   // หลายรอบเพราะถ้วยบางใบนับจากถ้วยอื่น
      let any = false;
      for (const tr of LIST) { if (W[tr[0]]) continue; if (T.done(tr)) { W[tr[0]] = Date.now(); fresh.push(tr); any = true; } }
      if (!any) break;
    }
    if (fresh.length) { ED.save.persist(); fresh.slice(0, 4).forEach((tr, i) => setTimeout(() => ED.ui && ED.ui.onTrophy && ED.ui.onTrophy(tr), i * 700)); }
    return fresh;
  };

  /* ---------- วันเล่น / สตรีค ---------- */
  T.dayTick = function () {
    const s = st(); const d = new Date(); const key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    if (s.lastDay === key) return;
    const y = new Date(d.getTime() - 864e5); const ykey = y.getFullYear() + '-' + (y.getMonth() + 1) + '-' + y.getDate();
    s.streak = s.lastDay === ykey ? (s.streak || 0) + 1 : 1; s.lastDay = key; T.set('daysSet', key); T.max('maxStreak', s.streak);
    ED.save.persist();
  };

  /* ---------- hooks จากเกม ---------- */
  T.onStart = function (g, resumed) {
    if (resumed) return;
    const h = new Date().getHours();
    T.add('runs'); T.add(h >= 6 && h < 18 ? 'runsDay' : 'runsNight');
    T.set('modesPlayed', String(g.waveCount || 0));
    const s = st(); if (s.lostLast) { T.add('comebacks'); s.lostLast = 0; }
  };
  T.onEnd = function (g, win, stars) {
    const s = st();
    T.max('longestMin', Math.floor(g.time / 60)); if (g.time >= 3600) T.add('longRuns');
    T.max('maxWave', g.waveIdx);
    if (g.endless) { T.max('endlessBest', g.survived || 0); if (stars >= 3) T.max('endless3', 1); }
    if (win) {
      T.add('wins');
      const lost = g.castleMax - g.castleHp, tw = g.towers;
      if (lost <= 1) { T.add('perfectWins'); T.set('perfectBiomes', g.map.biome.id); }
      if (g.castleHp <= 5) T.add('clutchWins');
      if (g.gold >= 2000) T.add('winsRich'); if (g.gold <= 100) T.add('winsPoor');
      if (!g.stats.sells) T.add('noSellWins'); if (!g.stats.merges) T.add('winsNoMerge');
      if (g.stats.built <= 10) T.add('winsFewBuild'); if (tw.length <= 5) T.add('winsFewTowers');
      const els = new Set(); tw.forEach(t => t.counts.forEach((c, i) => c && els.add(i)));
      if (els.size >= 5) T.add('wins5Elem'); if (els.size >= 6) T.add('wins6Elem');
      if (tw.length && tw.every(t => t.spec.k === 1 && t.spec.dom === tw[0].spec.dom)) T.add('winsMono');
      const per = {}; tw.forEach(t => per[t.spec.dom] = (per[t.spec.dom] || 0) + 1);
      if (tw.length >= 3 && Object.values(per).every(n => n <= 2)) T.add('winsDiverse');
      if (tw.length) T.set('winTopElems', tw.slice().sort((a, b) => b.spec.dps - a.spec.dps)[0].spec.dom);
      T.set('biomesWon', g.map.biome.id);
      if (g.waveCount === 100) { T.add('mode100Wins'); T.set('biomes100', g.map.biome.id); }
      if (g.waveCount === 200) { T.add('mode200Wins'); T.set('biomes200', g.map.biome.id); if (stars >= 3) T.max('mode200Stars3', 1); }
      s.winStreak = (s.winStreak || 0) + 1; T.max('maxWinStreak', s.winStreak);
      s.s3Streak = stars >= 3 ? (s.s3Streak || 0) + 1 : 0; T.max('maxStars3Streak', s.s3Streak);
    } else { s.winStreak = 0; s.s3Streak = 0; if (!stars) s.lostLast = 1; }
    ED.save.persist(); T.check(true);
  };
})();
