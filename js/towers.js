/* ELEMENTAL DEFENDERS — Tower generation: composition → stats, attack pattern, skill, name
   หอคอยถูกนิยามด้วย "องค์ประกอบธาตุ" (จำนวนหน่วยของแต่ละธาตุ) ไม่มีการอัปเกรด ใช้การผสมเท่านั้น
   จำนวนรูปแบบหอที่เป็นไปได้ (≤16 หน่วย, ≤3 ธาตุ) = 13,096 แบบ                                  */
'use strict';
(function () {
  const C = ED.CONFIG, EL = ED.EL;

  /* โปรไฟล์ต่อธาตุ (ต่อ 1 หน่วย) */
  ED.PROFILE = {
    FIRE:  { dmg: 14,  rate: 1.0,  range: 2.6, pattern: 'splash', pth: 'ระเบิดวงกว้าง' },
    WIND:  { dmg: 6.5, rate: 2.2,  range: 3.0, pattern: 'multi',  pth: 'ยิงหลายเป้า' },
    LIGHT: { dmg: 11,  rate: 0.95, range: 3.4, pattern: 'beam',   pth: 'ลำแสงทะลุเส้นตรง' },
    DARK:  { dmg: 9,   rate: 1.1,  range: 2.7, pattern: 'curse',  pth: 'คำสาปกัดกร่อน' },
    EARTH: { dmg: 24,  rate: 0.5,  range: 2.2, pattern: 'quake',  pth: 'แผ่นดินไหวรอบตัว' },
    WATER: { dmg: 7.5, rate: 1.25, range: 2.8, pattern: 'frost',  pth: 'น้ำแข็งทำให้ช้า' },
  };

  /* ตระกูลสกิล: 6 ธาตุบริสุทธิ์ + 15 คู่ผสม  (คีย์คู่เรียงตามลำดับวงจร) */
  const S = (th, en, cd, mult, desc) => ({ th, en, cd, mult, desc });
  ED.SKILLS = {
    FIRE: S('อินเฟอร์โน', 'Inferno Nova', 7, 2.6, 'ระเบิดเพลิงรอบหอ'),
    WIND: S('พายุหมุน', 'Tempest Blades', 6, 0.9, 'ปล่อยใบมีดลมหลายใบ'),
    LIGHT: S('พิพากษาศักดิ์สิทธิ์', 'Holy Judgment', 8, 6.0, 'เสาแสงฟาดศัตรูที่แข็งแกร่งที่สุด'),
    DARK: S('คำสาปเงา', 'Shadow Curse', 9, 1.2, 'สาปศัตรูทั้งหมดในระยะ'),
    EARTH: S('แผ่นดินไหวไททัน', 'Titan Quake', 9, 2.0, 'ทำให้ศัตรูทั้งหมดในระยะมึนงง'),
    WATER: S('คลื่นยักษ์', 'Tidal Wave', 10, 1.4, 'ผลักศัตรูถอยหลังพร้อมทำให้ช้า'),
    'FIRE+WIND': S('พายุเพลิง', 'Firestorm', 9, 0.9, 'ทอร์นาโดเพลิงเคลื่อนไปตามทาง'),
    'FIRE+LIGHT': S('เปลวสุริยะ', 'Solar Flare', 8, 3.0, 'ลำแสงอาทิตย์เผาทุกตัวในแนว'),
    'FIRE+DARK': S('เพลิงนรก', 'Hellfire', 9, 0.8, 'สร้างพื้นเพลิงนรกเผาต่อเนื่อง'),
    'FIRE+EARTH': S('อุกกาบาต', 'Meteor', 10, 5.0, 'อุกกาบาตถล่มกลุ่มศัตรูหนาแน่นที่สุด'),
    'FIRE+WATER': S('ไอน้ำเดือด', 'Scalding Steam', 8, 0.7, 'เมฆไอน้ำลวกและลดเกราะ'),
    'WIND+LIGHT': S('สายฟ้าฟาด', 'Chain Lightning', 6, 2.2, 'สายฟ้ากระโดดหลายเป้า'),
    'WIND+DARK': S('วังวนสุญญะ', 'Void Vortex', 11, 1.5, 'ดูดศัตรูเข้าหาจุดเดียว'),
    'WIND+EARTH': S('พายุทราย', 'Sandstorm', 10, 0.6, 'พายุทรายรอบหอ ทำให้ช้าและบาดเจ็บ'),
    'WIND+WATER': S('พายุหิมะ', 'Blizzard', 11, 1.0, 'แช่แข็งศัตรูทั้งหมดในระยะ'),
    'LIGHT+DARK': S('สุริยุปราคา', 'Eclipse', 12, 4.0, 'ประหารศัตรูที่ HP ต่ำ'),
    'LIGHT+EARTH': S('หอกผลึก', 'Crystal Spikes', 8, 2.4, 'หนามผลึกพุ่งจากพื้นตามทางเดิน'),
    'LIGHT+WATER': S('รุ้งปริซึม', 'Prism Ray', 7, 1.6, 'ลำแสง 6 ธาตุ เลือกธาตุที่ชนะทางเสมอ'),
    'DARK+EARTH': S('โรคระบาด', 'Plague', 9, 0.5, 'พิษที่แพร่ต่อเมื่อเป้าหมายตาย'),
    'DARK+WATER': S('ห้วงลึก', 'Abyssal Pull', 10, 1.8, 'ลากศัตรูถอยหลังไปตามทาง'),
    'EARTH+WATER': S('รากพฤกษา', 'Entangling Roots', 9, 1.2, 'รากไม้ตรึงศัตรูอยู่กับที่'),
  };
  ED.pairKey = function (a, b) { return ED.ELI[a] <= ED.ELI[b] ? a + '+' + b : b + '+' + a; };
  // ปรับคีย์คู่ให้ตรงกับตาราง (บางคู่เช่น FIRE+WATER ลำดับ index 0,5)
  ED.skillKeyOf = function (a, b) { const k = ED.pairKey(a, b); return ED.SKILLS[k] ? k : b + '+' + a; };

  /* ผลเสริมจากธาตุรอง (Rider / Modifier) */
  ED.RIDER = {
    FIRE: 'เพิ่มการเผาไหม้', WIND: 'เพิ่มจำนวนเป้า/ระยะ', LIGHT: 'เพิ่มคริติคอลและเปิดจุดอ่อน',
    DARK: 'ลดเกราะศัตรู', EARTH: 'โอกาสทำให้มึนงง', WATER: 'ทำให้ช้าลง',
  };

  /* ------- คีย์ขององค์ประกอบ ------- */
  ED.compKey = (counts) => counts.map(c => c.toString(17)).join('');
  ED.keyToCounts = (key) => key.split('').map(ch => parseInt(ch, 17));
  ED.unitsOf = (counts) => counts.reduce((a, b) => a + b, 0);
  ED.distinctOf = (counts) => counts.filter(c => c > 0).length;
  ED.basicCounts = (el) => { const c = [0, 0, 0, 0, 0, 0]; c[ED.ELI[el]] = 1; return c; };

  /* จำนวนรูปแบบทั้งหมด (คำนวณจริง) */
  ED.countAllTowerForms = function () {
    let n = 0;
    const rec = (i, left, distinct) => {
      if (i === 6) { if (left < C.MAX_UNITS && distinct > 0) n++; return; }
      for (let c = 0; c <= left; c++) { const d = distinct + (c > 0 ? 1 : 0); if (d > C.MAX_DISTINCT) break; rec(i + 1, left - c, d); }
    };
    // นับองค์ประกอบที่รวม 1..MAX_UNITS
    n = 0;
    const counts = [0, 0, 0, 0, 0, 0];
    const go = (i, sum, distinct) => {
      if (i === 6) { if (sum >= 1 && sum <= C.MAX_UNITS) n++; return; }
      for (let c = 0; sum + c <= C.MAX_UNITS; c++) { const d = distinct + (c > 0 ? 1 : 0); if (d > C.MAX_DISTINCT) break; counts[i] = c; go(i + 1, sum + c, d); }
      counts[i] = 0;
    };
    go(0, 0, 0); return n;
  };

  const cache = new Map();
  /* ======== คำนวณค่าพลังหอจากองค์ประกอบ ======== */
  ED.towerSpec = function (counts) {
    const key = ED.compKey(counts);
    if (cache.has(key)) return cache.get(key);
    const u = ED.unitsOf(counts), k = ED.distinctOf(counts), tier = ED.TIER_OF_UNITS(u);
    const order = EL.map((e, i) => ({ e, c: counts[i], i })).filter(o => o.c > 0).sort((a, b) => b.c - a.c || a.i - b.i);
    const dom = order[0].e, sec = order[1] ? order[1].e : null, third = order[2] ? order[2].e : null;
    const shares = counts.map(c => c / u);
    let dmg = 0, rate = 0, range = 0;
    EL.forEach((e, i) => { const p = ED.PROFILE[e]; dmg += shares[i] * p.dmg; rate += shares[i] * p.rate; range += shares[i] * p.range; });
    let syn = k === 1 ? C.PURE_BONUS : k === 2 ? C.DUAL_BONUS : C.TRI_BONUS;
    let even = 0;
    if (k >= 2) { even = order[order.length - 1].c / order[0].c; syn *= 1 + 0.08 * even; }
    const damage = dmg * Math.pow(u, C.DMG_EXP) * syn;
    const fireRate = rate * (1 + C.RATE_PER_UNIT * (u - 1));
    const rangeC = range + 0.15 * (tier - 1);
    const pattern = ED.PROFILE[dom].pattern;
    // พารามิเตอร์รูปแบบการยิง
    const P = { splash: 0, targets: 1, curse: 0, quakeStun: 0, frostSlow: 0, frostDur: 0 };
    if (pattern === 'splash') P.splash = 0.7 + 0.1 * tier;
    if (pattern === 'multi') P.targets = 2 + Math.floor(tier / 2);
    if (pattern === 'curse') P.curse = 0.4 + 0.05 * tier;          // DoT รวม = % ของดาเมจ ใน 3 วิ
    if (pattern === 'quake') P.quakeStun = 0.1 + 0.05 * tier;
    if (pattern === 'frost') { P.frostSlow = 0.25 + 0.03 * tier; P.frostDur = 1.5; P.splash = 0.45; }
    // ธาตุรองเป็น modifier
    const mod = { burn: 0, extra: 0, crit: 0.05, armorDown: 0, stun: 0, slow: 0 };
    EL.forEach((e, i) => {
      const s = shares[i]; if (!s || e === dom) return;
      if (e === 'FIRE') mod.burn = 0.5 * s;
      if (e === 'WIND') mod.extra = Math.ceil(s * 3);
      if (e === 'LIGHT') mod.crit = 0.1 + 0.4 * s;
      if (e === 'DARK') mod.armorDown = 0.1 + 0.4 * s;
      if (e === 'EARTH') mod.stun = 0.05 + 0.25 * s;
      if (e === 'WATER') mod.slow = 0.1 + 0.3 * s;
    });
    if (pattern === 'multi') P.targets += mod.extra; else if (mod.extra) P.targets += mod.extra;
    // สกิล
    let skill = null;
    if (u >= 2) {
      const fam = k === 1 ? dom : ED.skillKeyOf(dom, sec);
      const sd = ED.SKILLS[fam];
      skill = {
        fam, th: sd.th, en: sd.en, rider: third,
        cd: sd.cd * Math.max(0.5, 1 - 0.03 * (u - 2)),
        power: damage * sd.mult * (1 + 0.05 * u),
        radius: 1.2 + 0.15 * tier + (third === 'WIND' ? 0.4 : 0),
        dur: 1.2 + 0.25 * tier,
        count: 3 + tier + (third === 'WIND' ? 2 : 0),
      };
      skill.desc = ED.skillDesc(skill, tier);
    }
    const name = u === 1 ? 'หอ' + ED.ELEMENT[dom].th
      : (skill ? skill.th : '') + (third ? '·' + ED.ELEMENT[third].th : '') + ' ' + ED.TIER_NAMES[tier];
    const spec = {
      key, counts: counts.slice(), u, k, tier, dom, sec, third, shares, order: order.map(o => o.e),
      damage, rate: fireRate, range: rangeC, pattern, P, mod, skill, name,
      dps: damage * fireRate * (pattern === 'multi' ? Math.min(P.targets, 3) : 1),
      seeStealth: dom === 'LIGHT' || third === 'LIGHT' || sec === 'LIGHT',
    };
    cache.set(key, spec);
    return spec;
  };

  ED.skillDesc = function (s, tier) {
    const p = ED.U.fmt(s.power), r = ED.U.fmt1(s.radius), d = ED.U.fmt1(s.dur), cd = ED.U.fmt1(s.cd);
    const T = {
      FIRE: `ระเบิด ${p} ดาเมจ รัศมี ${r} ช่อง + ติดไฟ`,
      WIND: `ปล่อยใบมีดลม ${s.count} ใบ ใบละ ${p}`,
      LIGHT: `ฟาดเสาแสง ${p} ใส่ศัตรู HP สูงสุด + เปิดจุดอ่อน`,
      DARK: `สาปทั้งระยะ: รับดาเมจ +30% และ DoT ${p} ใน ${d} วิ`,
      EARTH: `ดาเมจ ${p} ทั้งระยะ + มึนงง ${d} วิ (ไม่โดนตัวบิน)`,
      WATER: `ดาเมจ ${p} ผลักถอย 1.2 ช่อง + ช้า 40%`,
      'FIRE+WIND': `ทอร์นาโดเพลิง ${d * 2} วิ ดาเมจ ${p}/วิ`,
      'FIRE+LIGHT': `ลำแสงอาทิตย์ ${p} ทะลุทั้งแนว + ติดไฟ`,
      'FIRE+DARK': `พื้นเพลิงนรก ${d * 2} วิ ${p}/วิ รัศมี ${r}`,
      'FIRE+EARTH': `อุกกาบาต ${p} รัศมี ${r} + มึนงง 1 วิ`,
      'FIRE+WATER': `เมฆไอน้ำ ${d * 2} วิ ${p}/วิ ลดเกราะ 30%`,
      'WIND+LIGHT': `สายฟ้า ${p} กระโดด ${s.count + 2} เป้า`,
      'WIND+DARK': `วังวน ${d} วิ ดูดศัตรูรัศมี ${r} + ${p}`,
      'WIND+EARTH': `พายุทรายรอบหอ ${d * 2} วิ ช้า 40% + ${p}/วิ`,
      'WIND+WATER': `แช่แข็งทั้งระยะ ${d} วิ + ${p}`,
      'LIGHT+DARK': `ประหารศัตรู HP < ${Math.round(8 + tier * 2)}% (ไม่ใช่บอส) หรือ ${p}`,
      'LIGHT+EARTH': `หนามผลึก ${s.count} จุดตามทาง จุดละ ${p}`,
      'LIGHT+WATER': `ลำแสง 6 ธาตุ ${p} เลือกธาตุชนะทางอัตโนมัติ`,
      'DARK+EARTH': `พิษ ${p}/วิ นาน 5 วิ แพร่เมื่อตาย`,
      'DARK+WATER': `ลากเป้าหมายถอยหลัง 2.5 ช่อง + ${p}`,
      'EARTH+WATER': `รากตรึง ${s.count} ตัว ${d} วิ + ${p}`,
    };
    return (T[s.fam] || '') + ` · คูลดาวน์ ${cd} วิ` + (s.rider ? ` · ธาตุที่ 3 (${ED.ELEMENT[s.rider].th}): ${ED.RIDER[s.rider]}` : '');
  };

  /* ======== เงื่อนไขการผสม ======== */
  ED.mergeCheck = function (towers, gold, freeTokens) {
    const res = { ok: false, reasons: [], counts: null, fee: 0, spec: null, free: false };
    if (towers.length < C.MERGE_MIN) { res.reasons.push(`ต้องเลือกอย่างน้อย ${C.MERGE_MIN} หอ`); }
    if (towers.length > C.MERGE_MAX) { res.reasons.push(`ผสมได้สูงสุด ${C.MERGE_MAX} หอ`); }
    const counts = [0, 0, 0, 0, 0, 0];
    towers.forEach(t => t.counts.forEach((c, i) => counts[i] += c));
    const u = ED.unitsOf(counts), k = ED.distinctOf(counts);
    res.counts = counts;
    if (u > C.MAX_UNITS) res.reasons.push(`หน่วยธาตุรวม ${u} เกิน ${C.MAX_UNITS}`);
    if (k > C.MAX_DISTINCT) res.reasons.push(`ธาตุไม่เสถียร: มี ${k} ธาตุ (สูงสุด ${C.MAX_DISTINCT})`);
    res.fee = C.MERGE_FEE_PER_UNIT * u + C.MERGE_FEE_PER_ELEM * (k - 1);
    if (freeTokens > 0) res.free = true;
    else if (gold < res.fee) res.reasons.push(`ทองไม่พอ (ต้องการ ${res.fee})`);
    if (towers.length >= 1 && u <= C.MAX_UNITS && k <= C.MAX_DISTINCT) res.spec = ED.towerSpec(counts);
    res.ok = res.reasons.length === 0 && towers.length >= C.MERGE_MIN;
    return res;
  };
})();
