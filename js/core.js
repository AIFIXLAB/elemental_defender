/* ELEMENTAL DEFENDERS — core: config, utilities, element system */
'use strict';
window.ED = window.ED || {};

/* ================= GAME CONFIGURATION (ปรับสมดุลได้ที่นี่) ================= */
ED.CONFIG = {
  COLS: 16, ROWS: 9, CELL: 100,              // playfield grid (logical px)
  ADV_MULT: 2.0,                              // ธาตุชนะทาง
  DIS_MULT: 0.4,                              // ธาตุแพ้ทาง
  SAME_MULT: 1.0,                             // ธาตุเดียวกัน
  NEUTRAL_MULT: 1.0,                          // ธาตุที่ไม่เกี่ยวข้องกัน
  TOWER_COST: 50,                             // ราคาหอ Tier 1
  SELL_REFUND: 0.6,                           // ขายคืน 60% ของมูลค่า
  MERGE_MIN: 2, MERGE_MAX: 4,                 // ผสมได้ 2–4 หอต่อครั้ง
  MAX_UNITS: 16,                              // หอ 1 ต้นรวมได้สูงสุด 16 หน่วยธาตุ
  MAX_DISTINCT: 3,                            // ธาตุต่างชนิดในหอเดียวสูงสุด 3
  MERGE_FEE_PER_UNIT: 10,                     // ค่าผสม = 10×หน่วย + 25×(ชนิดธาตุ-1)
  MERGE_FEE_PER_ELEM: 25,
  DMG_EXP: 1.12,                              // ดาเมจ ∝ หน่วย^1.12
  RATE_PER_UNIT: 0.04,                        // ความเร็วยิง +4%/หน่วย
  PURE_BONUS: 1.15, DUAL_BONUS: 1.10, TRI_BONUS: 1.05,
  CASTLE_HP: 100,
  START_GOLD: 260,
  START_GOLD_GROWTH: 1.10,                    // ทองเริ่มต้น ×1.10 ต่อด่าน
  MON_BASE_HP: 40, MON_WAVE_HP: 0.09, MON_WAVE_HP2: 0.0065, // HP = 40 × 1.14^(ด่าน−1) × (1 + 0.09w + 0.0065w²)
  HP_GROWTH: 1.14,                            // HP มอนสเตอร์ ×1.14 ต่อด่าน
  GOLD_GROWTH: 1.08,                          // ทองต่อการฆ่า ×1.08 ต่อด่าน
  WAVES_PER_STAGE: 50,
  MAX_ALIVE: 160,                             // มอนบนสนามเกินนี้ → หยุดปล่อยมอน/เวฟถัดไปชั่วคราว                        // ด่านละ 50 เวฟ
  WAVE_GAP: 8,                                // วินาทีพักระหว่างเวฟ (+ระยะเวลาปล่อยมอน) เรียกก่อนได้โบนัส
  WAVE_CLEAR_GOLD: 6,                         // โบนัสทองทุกครั้งที่ปล่อยเวฟใหม่ = 6 + 0.6×เวฟ
  LOOT_BASE_HP: 90, LOOT_GOLD: 30,            // วัตถุ/สมบัติที่ยิงแตกได้
  EARLY_CALL_BONUS: 1.0,                      // ทองโบนัส/วินาทีที่เหลือเมื่อเรียกเวฟก่อน
  PROC_ADV: 0.30, PROC_DIS: 0.35, PROC_NEU: 0.12, PROC_SAME: 0.22,
  PROC_ICD: 0.9,                              // คูลดาวน์การติดสถานะต่อมอนสเตอร์
};
ED.TIER_OF_UNITS = function (u) { return u <= 1 ? 1 : u <= 3 ? 2 : u <= 6 ? 3 : u <= 10 ? 4 : 5; };
ED.TIER_NAMES = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'];
ED.TIER_TITLES = ['', 'พื้นฐาน', 'ผสาน', 'อาร์คเคน', 'ตำนาน', 'มิธิค'];

/* ================= UTILITIES ================= */
ED.U = {
  clamp: (v, a, b) => v < a ? a : v > b ? b : v,
  lerp: (a, b, t) => a + (b - a) * t,
  dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
  rng(seed) {                                  // mulberry32
    let a = seed >>> 0;
    const f = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    f.int = (n) => Math.floor(f() * n);
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.range = (a, b) => a + f() * (b - a);
    return f;
  },
  hash(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; },
  fmt(n) { n = Math.round(n); return n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n); },
  fmt1(n) { return (Math.round(n * 10) / 10).toString(); },
};

/* ================= ELEMENTS ================= */
ED.EL = ['FIRE', 'WIND', 'LIGHT', 'DARK', 'EARTH', 'WATER'];   // cycle order: each beats the next
ED.ELI = { FIRE: 0, WIND: 1, LIGHT: 2, DARK: 3, EARTH: 4, WATER: 5 };
ED.ELEMENT = {
  FIRE:  { th: 'ไฟ',    en: 'Fire',     color: '#ff5a24', glow: '#ffae42', dark: '#7a1600', icon: '🔥' },
  WIND:  { th: 'ลม',    en: 'Wind',     color: '#3fe38a', glow: '#b5ffcf', dark: '#0b5a2e', icon: '🌪' },
  LIGHT: { th: 'แสง',   en: 'Light',    color: '#ffd84a', glow: '#fff6c2', dark: '#7a5a00', icon: '✦' },
  DARK:  { th: 'มืด',   en: 'Darkness', color: '#a45cff', glow: '#e0c2ff', dark: '#2a0b55', icon: '☾' },
  EARTH: { th: 'ดิน',   en: 'Earth',    color: '#c98a46', glow: '#f2cf9a', dark: '#4a2c0c', icon: '⛰' },
  WATER: { th: 'น้ำ',    en: 'Water',    color: '#38a8ff', glow: '#bfe6ff', dark: '#06315c', icon: '💧' },
};
ED.beats = (a, d) => (ED.ELI[a] + 1) % 6 === ED.ELI[d];
/* ตัวคูณดาเมจ (Elemental Advantage) — แยกจาก Interaction */
ED.mult = function (att, def) {
  const C = ED.CONFIG;
  if (att === def) return C.SAME_MULT;
  if (ED.beats(att, def)) return C.ADV_MULT;
  if (ED.beats(def, att)) return C.DIS_MULT;
  return C.NEUTRAL_MULT;
};
ED.relation = function (att, def) {
  if (att === def) return 'same';
  if (ED.beats(att, def)) return 'adv';
  if (ED.beats(def, att)) return 'dis';
  return 'neu';
};

/* ================= ELEMENTAL INTERACTION (ครบ 36 คู่) =================
   good=true  → ผลดีต่อผู้เล่น, good=false → กระตุ้นความสามารถมอนสเตอร์
   fx: ประเภทสถานะที่เกิดขึ้น (ดู Game.applyStatus)                         */
ED.INTERACT = {};
(function () {
  const I = (a, d, id, th, good, fx, desc) => { ED.INTERACT[a + '>' + d] = { id, th, good, fx, desc }; };
  // ----- ธาตุชนะทาง (Advantage) -----
  I('FIRE', 'WIND', 'scorch', 'เผาไหม้รุนแรง', true, { burn: 0.35, dur: 3 }, 'ไฟโหมลม: ติดไฟ ดาเมจต่อเนื่อง 35%/วิ นาน 3 วิ');
  I('WIND', 'LIGHT', 'disperse', 'สลายแสง', true, { shieldBreak: 1, armorDown: 0.2, dur: 4 }, 'ลมพัดแสงกระจาย: ทำลายโล่ ลดเกราะ 20%');
  I('LIGHT', 'DARK', 'expose', 'เปิดเผยจุดอ่อน', true, { vuln: 0.25, reveal: 1, dur: 4 }, 'แสงส่องความมืด: รับดาเมจ +25% และมองเห็นตัวล่องหน');
  I('DARK', 'EARTH', 'erode', 'กัดกร่อน', true, { armorDown: 0.4, dur: 5 }, 'ความมืดกัดกร่อนดิน: เกราะลด 40%');
  I('EARTH', 'WATER', 'absorb', 'ดูดซับ', true, { stun: 0.6 }, 'ดินดูดซับน้ำ: มึนงง 0.6 วิ');
  I('WATER', 'FIRE', 'extinguish', 'ดับไฟ', true, { slow: 0.25, dur: 2, calm: 1 }, 'น้ำดับไฟ: ช้าลง 25% ยกเลิกคลั่ง ลดดาเมจใส่ปราสาท');
  // ----- ธาตุแพ้ทาง (Disadvantage) — มักกระตุ้นมอนสเตอร์ -----
  I('WIND', 'FIRE', 'fuel', 'เติมเชื้อเพลิง', false, { enrage: 0.35, dur: 3 }, 'ลมเติมไฟ: มอนสเตอร์คลั่ง เร็วขึ้น 35% และตีปราสาทแรงขึ้น');
  I('LIGHT', 'WIND', 'refract', 'หักเหแสง', false, { evade: 0.25, dur: 2 }, 'ลมหักเหแสง: มอนสเตอร์หลบหลีก 25%');
  I('DARK', 'LIGHT', 'clash', 'ปะทะพลังงาน', false, { shieldGain: 0.08, burstAoe: 0.5 }, 'มืดปะทะแสง: มอนสเตอร์ได้โล่ 8% แต่ระเบิดพลังใส่ศัตรูรอบข้าง');
  I('EARTH', 'DARK', 'devour', 'กลืนกิน', false, { heal: 0.04 }, 'ความมืดกลืนดิน: มอนสเตอร์ฟื้น HP 4%');
  I('WATER', 'EARTH', 'mud', 'โคลน', true, { slow: 0.35, dur: 2.5 }, 'น้ำใส่ดิน: ดาเมจต่ำ แต่เกิดโคลน ช้าลง 35%');
  I('FIRE', 'WATER', 'steam', 'ไอน้ำ', false, { evade: 0.2, dur: 2.5, cloud: 1 }, 'ไฟโดนน้ำ: เกิดไอน้ำ มอนสเตอร์รอบข้างหลบ 20%');
  // ----- ธาตุเป็นกลาง (Neutral) -----
  I('FIRE', 'LIGHT', 'flare', 'ลุกโชน', true, { burn: 0.15, dur: 2 }, 'เปลวสว่าง: ติดไฟเล็กน้อย');
  I('FIRE', 'DARK', 'purge', 'ชำระล้าง', true, { cleanse: 1 }, 'ไฟชำระ: ล้างบัฟฟื้นฟู/โล่ของมอนสเตอร์');
  I('FIRE', 'EARTH', 'molten', 'หลอมละลาย', true, { armorDown: 0.15, dur: 3 }, 'หลอมหิน: เกราะลด 15%');
  I('WIND', 'DARK', 'clearfog', 'พัดหมอก', true, { reveal: 1, evadeClear: 1, dur: 3 }, 'ลมพัดหมอก: มองเห็นตัวล่องหน');
  I('WIND', 'EARTH', 'sandblast', 'พายุทราย', true, { slow: 0.15, dur: 2 }, 'ทรายกระแทก: ช้าลง 15%');
  I('WIND', 'WATER', 'gust', 'แรงลมผลัก', true, { knock: 0.35 }, 'ลมผลักถอยหลัง 0.35 ช่อง');
  I('LIGHT', 'FIRE', 'solar', 'ชาร์จสุริยะ', false, { haste: 0.1, dur: 2 }, 'แสงเติมไฟ: มอนสเตอร์เร็วขึ้น 10%');
  I('LIGHT', 'EARTH', 'crystallize', 'ตกผลึก', true, { stun: 0.3 }, 'ตกผลึก: มึนงง 0.3 วิ');
  I('LIGHT', 'WATER', 'prism', 'ปริซึม', true, { vuln: 0.1, dur: 3 }, 'แสงหักเหในน้ำ: รับดาเมจ +10%');
  I('DARK', 'FIRE', 'shadowflame', 'เพลิงเงา', true, { burn: 0.2, dur: 3 }, 'เพลิงเงา: ติดไฟเงา');
  I('DARK', 'WIND', 'vacuum', 'สุญญากาศ', true, { slow: 0.2, dur: 2 }, 'สุญญากาศ: ช้าลง 20%');
  I('DARK', 'WATER', 'toxic', 'หนองพิษ', true, { poison: 0.25, dur: 4 }, 'น้ำเน่าพิษ: พิษ 25%/วิ');
  I('EARTH', 'FIRE', 'smother', 'กลบไฟ', true, { weaken: 0.3, dur: 4 }, 'ดินกลบไฟ: ดาเมจใส่ปราสาท -30%');
  I('EARTH', 'WIND', 'ground', 'ตรึงพื้น', true, { ground: 1, dur: 3 }, 'ตรึงตัวบิน: ร่วงลงพื้น (โดนแผ่นดินไหวได้)');
  I('EARTH', 'LIGHT', 'dust', 'ฝุ่นบดบัง', true, { stun: 0.35 }, 'ฝุ่นบดบัง: มึนงง 0.35 วิ');
  I('WATER', 'WIND', 'damp', 'ความชื้น', true, { slow: 0.15, dur: 2 }, 'ปีกเปียก: ช้าลง 15%');
  I('WATER', 'LIGHT', 'glare', 'สะท้อนแสง', false, { evade: 0.1, dur: 2 }, 'แสงสะท้อนน้ำ: มอนสเตอร์หลบ 10%');
  I('WATER', 'DARK', 'cleanse', 'ชะล้าง', true, { healBlock: 1, dur: 4 }, 'ชะล้าง: ห้ามฟื้นฟู 4 วิ');
  // ----- ธาตุเดียวกัน (Resonance) -----
  for (const e of ['FIRE', 'WIND', 'LIGHT', 'DARK', 'EARTH', 'WATER'])
    I(e, e, 'resonance', 'สั่นพ้อง', false, { heal: 0.02, haste: 0.08, dur: 2 }, 'ธาตุเดียวกันสั่นพ้อง: มอนสเตอร์ฟื้น 2% และเร็วขึ้นเล็กน้อย');
})();
ED.procChance = function (rel) {
  const C = ED.CONFIG; return rel === 'adv' ? C.PROC_ADV : rel === 'dis' ? C.PROC_DIS : rel === 'same' ? C.PROC_SAME : C.PROC_NEU;
};
