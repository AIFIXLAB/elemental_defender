/* ELEMENTAL DEFENDERS — Monster generation & wave generation
   สายพันธุ์ = แกนร่าง (Body 30 + Head 30) × ธาตุ 6 × นิสัย 12 = 4,320 สายพันธุ์ (ยังไม่รวมชิ้นส่วนตกแต่ง) */
'use strict';
(function () {
  const C = ED.CONFIG, U = ED.U;

  ED.TRAITS = {
    normal:  { th: 'ทั่วไป',   hp: 1.0, spd: 1.0, armor: 0, gold: 1.0, leak: 3, size: 1.0, unlock: 1 },
    fast:    { th: 'ว่องไว',   hp: 0.6, spd: 1.65, armor: 0, gold: 0.9, leak: 2, size: 0.9, unlock: 1 },
    swarm:   { th: 'ฝูง',      hp: 0.32, spd: 1.15, armor: 0, gold: 0.35, leak: 1, size: 0.72, unlock: 1, group: 2.5 },
    tank:    { th: 'หุ้มเกราะหนัก', hp: 2.4, spd: 0.62, armor: 0.25, gold: 1.8, leak: 5, size: 1.22, unlock: 2 },
    flyer:   { th: 'บินได้',   hp: 0.8, spd: 1.2, armor: 0, gold: 1.0, leak: 3, size: 0.95, unlock: 2, fly: 1 },
    regen:   { th: 'ฟื้นฟู',   hp: 1.1, spd: 0.95, armor: 0.05, gold: 1.2, leak: 3, size: 1.0, unlock: 3, regen: 0.025 },
    shield:  { th: 'มีโล่',    hp: 0.9, spd: 0.95, armor: 0, gold: 1.25, leak: 3, size: 1.05, unlock: 4, shield: 0.5 },
    armored: { th: 'เกราะเหล็ก', hp: 1.3, spd: 0.85, armor: 0.45, gold: 1.4, leak: 4, size: 1.1, unlock: 5 },
    split:   { th: 'แตกตัว',   hp: 0.9, spd: 1.0, armor: 0, gold: 0.8, leak: 3, size: 1.1, unlock: 6, split: 2 },
    dash:    { th: 'พุ่งชาร์จ', hp: 0.9, spd: 1.0, armor: 0.05, gold: 1.2, leak: 3, size: 1.0, unlock: 7, dash: 1 },
    healer:  { th: 'ผู้รักษา', hp: 1.0, spd: 0.9, armor: 0, gold: 1.5, leak: 2, size: 1.0, unlock: 8, healer: 1 },
    stealth: { th: 'ล่องหน',   hp: 0.8, spd: 1.1, armor: 0, gold: 1.4, leak: 3, size: 0.95, unlock: 9, stealth: 1 },
    berserk: { th: 'คลั่ง',    hp: 1.2, spd: 1.0, armor: 0.1, gold: 1.3, leak: 4, size: 1.08, unlock: 10, berserk: 1 },
  };
  ED.TRAIT_KEYS = Object.keys(ED.TRAITS);
  ED.TRAIT_ICON = { normal: '', fast: '»', swarm: '∴', tank: '▣', flyer: '🜁', regen: '✚', shield: '◈', armored: '⛨', split: '✣', dash: '➤', healer: '♥', stealth: '◌', berserk: '‼' };

  const SYL = ['กร', 'มอ', 'ซา', 'วิ', 'ดรา', 'โก', 'ลิ', 'ธอร์', 'เซ', 'บา', 'รุ', 'ไค', 'โน', 'เวน', 'กา', 'ซีล', 'มอร์', 'ฟา', 'ลัค', 'ริ', 'ทัส', 'ดูม', 'เคร', 'โอ'];
  const ELNAME = { FIRE: 'เพลิง', WIND: 'วายุ', LIGHT: 'รัตติแสง', DARK: 'อสูรมืด', EARTH: 'ศิลา', WATER: 'วารี' };

  /* สร้างสายพันธุ์มอนสเตอร์แบบกำหนดได้จากเมล็ด */
  /* เฉพาะชิ้นส่วนที่สมบูรณ์ (ชิ้นที่ถูกตัดครึ่งจากแผ่นต้นฉบับถูกคัดออก) */
  ED.GOOD_PARTS = {
    Body: ['Body_01', 'Body_02', 'Body_05', 'Body_06', 'Body_07', 'Body_10', 'Body_11', 'Body_12', 'Body_13', 'Body_19', 'Body_20', 'Body_21', 'Body_26', 'Body_27', 'Body_29', 'Body_30'],
    Head: ['Head_04', 'Head_07', 'Head_09', 'Head_10', 'Head_13', 'Head_16', 'Head_17', 'Head_20', 'Head_22', 'Head_23', 'Head_25', 'Head_26', 'Head_29', 'Head_30'],
    Wings: ['Wings_01', 'Wings_05', 'Wings_11', 'Wings_14', 'Wings_19', 'Wings_28'],
    Crown: ['Accessories_02', 'Accessories_03'],
  };
  const idxOf = (grp, names) => names.map(n => ED_MANIFEST.monster[grp].findIndex(e => e[0] === n)).filter(i => i >= 0);
  let GOOD = null;
  const good = () => GOOD || (GOOD = { Body: idxOf('Body', ED.GOOD_PARTS.Body), Head: idxOf('Head', ED.GOOD_PARTS.Head), Wings: idxOf('Wings', ED.GOOD_PARTS.Wings), Crown: idxOf('Accessories', ED.GOOD_PARTS.Crown) });

  /* สร้างสายพันธุ์มอนสเตอร์แบบกำหนดได้จากเมล็ด: ร่างหลัก + ธาตุ + นิสัย (+ปีกคู่/มงกุฎ/ออร่า) */
  ED.makeSpecies = function (seed, el, trait) {
    const r = U.rng(seed); const G = good();
    const T = ED.TRAITS[trait];
    const useHead = trait === 'flyer' ? r() < 0.55 : r() < 0.3;
    const coreType = useHead ? 'Head' : 'Body';
    const core = r.pick(G[coreType]);
    const wings = (T.fly || useHead) ? r.pick(G.Wings) : -1;
    const acc = r.pick(G.Crown);
    const aura = (trait === 'shield' || trait === 'healer' || trait === 'stealth' || r() < 0.2) ? r.int(ED_MANIFEST.monster.Effects.length) : -1;
    const key = `${coreType[0]}${core}.${el[0]}${el[1]}.${trait}`;
    const name = ELNAME[el] + ' ' + r.pick(SYL) + r.pick(SYL) + (r() < 0.5 ? r.pick(SYL) : '');
    return { key, seed, el, trait, coreType, core, wings, horns: -1, tail: -1, acc, aura, name, tint: r.range(0.12, 0.26), hue: r.range(-1, 1) };
  };
  ED.countAllSpecies = () => (ED.GOOD_PARTS.Body.length + ED.GOOD_PARTS.Head.length) * 6 * ED.TRAIT_KEYS.length;

  /* ค่าพลังมอนสเตอร์ตามด่าน/เวฟ */
  ED.monsterStats = function (sp, stage, wave, elite, boss) {
    const T = ED.TRAITS[sp.trait];
    let hp = C.MON_BASE_HP * Math.pow(C.HP_GROWTH, stage - 1) * ED.waveHpMul(wave) * T.hp;
    let spd = 0.95 * Math.min(1.45, 1 + 0.015 * (stage - 1)) * T.spd;
    let armor = Math.min(0.75, T.armor + Math.min(0.2, 0.01 * stage));
    let gold = 4 * Math.pow(C.GOLD_GROWTH, stage - 1) * T.gold * (1 + 0.012 * Math.min(wave, 300));
    let leak = T.leak, size = T.size;
    if (elite) { hp *= 4; gold *= 4; leak *= 2; size *= 1.3; armor = Math.min(0.75, armor + 0.1); }
    if (boss === 'mini') { hp *= 5 + stage * 0.3; gold *= 6; leak = 12; size *= 1.45; spd *= 0.8; armor = Math.min(0.75, armor + 0.1); }
    else if (boss) { hp *= 11 + stage * 0.6; gold *= 14; leak = 25; size *= 1.75; spd *= 0.75; armor = Math.min(0.75, armor + 0.15); }
    return { hp, spd, armor, gold: Math.max(1, Math.round(gold)), leak, size };
  };

  /* สร้างเวฟทั้งหมดของด่าน */
  /* ตัวคูณ HP ตามลำดับเวฟ: 50 เวฟแรกโตแบบกำลังสอง หลังจากนั้นโต 2.2%/เวฟ (โหมด 100/200/∞) */
  ED.waveHpMul = function (w) {
    const q = (x) => 1 + C.MON_WAVE_HP * x + C.MON_WAVE_HP2 * x * x;
    return w <= 50 ? q(w) : q(50) * Math.pow(1.022, w - 50);
  };
  /* ตารางบอส: มินิบอสทุก 10 เวฟ, บอสใหญ่ทุก 25 เวฟ และเวฟสุดท้าย (ถ้ามี) */
  ED.bossKind = function (w, total) {
    const last = isFinite(total) && w === total - 1;
    if (last || w % 25 === 24) return 'big';
    if (w % 10 === 9) return 'mini';
    return null;
  };
  /* สร้างเวฟเดียว (เจนตอนถึงเวฟนั้น) */
  ED.makeWave = function (stage, seed, spawnCount, w, total) {
    const r = U.rng(U.hash(seed + ':wave:' + w));
    const bk = ED.bossKind(w, total);
    const lvl = stage + Math.floor(w / 4);
    const unlocked = ED.TRAIT_KEYS.filter(k => ED.TRAITS[k].unlock <= lvl);
    const e1 = r.pick(ED.EL), e2 = r() < 0.35 + Math.min(0.5, w * 0.01) + stage * 0.01 ? r.pick(ED.EL) : e1;
    const count = Math.min(48 + Math.floor(Math.max(0, w - 50) / 25) * 4, 5 + Math.floor(w * 1.1) + Math.floor(stage / 2));
    const groups = 1 + r.int(Math.min(3, 1 + Math.floor(lvl / 4)));
    const list = [];
    for (let g = 0; g < groups; g++) {
      const el = g % 2 ? e2 : e1;
      let trait = r.pick(unlocked);
      if (w < 2 && stage <= 2) trait = 'normal';
      const sp = ED.makeSpecies(U.hash(stage + ':' + seed + ':' + w + ':' + g), el, trait);
      const n = Math.max(1, Math.round(count / groups * (ED.TRAITS[trait].group || 1)));
      const interval = Math.max(0.24, (trait === 'swarm' ? 0.34 : 0.9 - 0.01 * stage - 0.006 * Math.min(w, 80)));
      list.push({ sp, n, interval, elite: false, boss: false });
    }
    if (w % 5 === 4 && !bk) list.push({ sp: ED.makeSpecies(U.hash('elite' + stage + seed + w), r.pick(ED.EL), r.pick(unlocked)), n: 1 + Math.floor(Math.min(w, 120) / 15) + Math.floor(stage / 8), interval: 1.4, elite: true });
    if (bk) {
      const bt = r.pick(unlocked.filter(k => k !== 'swarm' && k !== 'split'));
      const nb = bk === 'big' ? 1 + (stage % 5 === 0 ? 1 : 0) + Math.floor(w / 100) : 1 + Math.floor(w / 100);
      list.push({ sp: ED.makeSpecies(U.hash(bk + stage + seed + w), r.pick(ED.EL), bt), n: nb, interval: 3, boss: bk === 'mini' ? 'mini' : true });
    }
    const queue = []; let t = 0;
    list.forEach((grp, gi) => {
      for (let i = 0; i < grp.n; i++) { queue.push({ t, sp: grp.sp, elite: grp.elite, boss: grp.boss, path: (i + gi) % spawnCount }); t += grp.interval; }
      t += 1.0;
    });
    return { queue, groups: list, elements: [...new Set(list.map(g => g.sp.el))], duration: t, boss: bk };
  };
  /* รายการเวฟแบบ lazy: เข้าถึง waves[i] แล้วค่อยเจน; length = จำนวนเวฟ (Infinity = ไม่จำกัด) */
  ED.makeWaves = function (stage, seed, spawnCount, total) {
    total = total || Infinity; const cache = [];
    return new Proxy(cache, {
      get(tgt, prop) {
        if (prop === 'length') return total;
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          const i = +prop; if (i >= total) return undefined;
          return cache[i] || (cache[i] = ED.makeWave(stage, seed, spawnCount, i, total));
        }
        return Reflect.get(tgt, prop);
      },
    });
  };
  ED.WAVE_MODES = [50, 100, 200, 0];   // 0 = ไม่จำกัด (∞)
  ED.timeLimitFor = (waves) => {
    if (!isFinite(waves.length)) return Infinity;
    let s = 0; for (let i = 0; i < waves.length; i++) s += C.WAVE_GAP + Math.min(25, waves[i].duration);
    return Math.round(60 + s * 1.12);
  };
})();
