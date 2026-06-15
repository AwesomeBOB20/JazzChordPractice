// Sanity check for the new "by implied quality" Shells grouping. Replicates the verified shell
// derivation (deriveShellToneSets + placeShellToneSet, copied from verify-shells.js) + the dictionary's
// token/pc-set dedup + shellQuality(), then prints the family breakdown so we can confirm it's sensible
// and balanced (vs the old Triads=3 / Rootless / Partial split).  Run: node verify-shell-groups.js
'use strict';
const fs = require('fs');
const mtSrc = fs.readFileSync('src/shared/theory/musicTheory.ts', 'utf8');
const start = mtSrc.indexOf('export const CH');
const braceStart = mtSrc.indexOf('= {', start) + 2;
const objEnd = mtSrc.indexOf('\n};', braceStart);
const CH = eval('(' + mtSrc.slice(braceStart, objEnd + 2) + ')');
// Iterate chords in the app's canonical order (formulaCombos uses ORDERED_TYPES) so the deduped
// combo's representative tokens match the real app — matters for enharmonic pc-9 (6 vs bb7 vs 13).
const ccStart = mtSrc.indexOf('export const CHORD_CATEGORIES');
const ccArrStart = mtSrc.indexOf('= [', ccStart) + 2;
const CHORD_CATEGORIES = eval('(' + mtSrc.slice(ccArrStart, mtSrc.indexOf('\n];', ccArrStart) + 2) + ')');
const fromCats = CHORD_CATEGORIES.flatMap(c => c.keys);
const ORDERED_TYPES = [...fromCats, ...Object.keys(CH).filter(k => !fromCats.includes(k))];

const GS = [40, 45, 50, 55, 59, 64];
const ROLE_SHORT = { 'root':'1','3rd':'3','5th':'5','7th':'7','9th':'9','11th':'11','13th':'13','4th':'4','6th':'6','2nd':'2','b2nd':'b2','#2nd':'#2','b3rd':'b3','#3rd':'#3','b4th':'b4','#4th':'#4','b5th':'b5','#5th':'#5','b6th':'b6','#6th':'#6','b7th':'b7','bb7th':'bb7','#7th':'#7','b9th':'b9','#9th':'#9','b11th':'b11','#11th':'#11','b13th':'b13','#13th':'#13' };
const FORMULA_IV = { '1':0,'b2':1,'2':2,'#2':3,'b3':3,'3':4,'b4':4,'4':5,'#4':6,'b5':6,'5':7,'#5':8,'b6':8,'6':9,'bb7':9,'b7':10,'7':11,'b9':1,'9':2,'#9':3,'b11':4,'11':5,'#11':6,'b13':8,'13':9,'#13':10 };

// ===== copied verbatim from verify-shells.js (which mirrors voicings.ts) =====
const SHELL_THIRD_ROLES = ['3rd', 'b3rd'];
const SHELL_THIRD_SUBS = ['4th', '2nd'];
const SHELL_SEVENTH_ROLES = ['7th', 'b7th', 'bb7'];
function deriveShellToneSets(chordDef) {
  const r = chordDef.r;
  let third = r.find(role => SHELL_THIRD_ROLES.includes(role)) ?? null;
  if (!third) third = SHELL_THIRD_SUBS.find(sub => r.includes(sub)) ?? null;
  let seventh = r.find(role => SHELL_SEVENTH_ROLES.includes(role)) ?? null;
  if (!seventh && r.includes('6th')) seventh = '6th';
  if (!third || !seventh) return [];
  const colorTones = r.filter(role => role !== 'root' && role !== third && role !== seventh && role !== '5th');
  const toneSets = [['root', third, seventh], ['root', seventh, third]];
  for (const color of colorTones) {
    toneSets.push([third, seventh, color]); toneSets.push([seventh, third, color]);
    toneSets.push(['root', third, color]); toneSets.push(['root', seventh, color]);
    toneSets.push([color, third, seventh]); toneSets.push([color, seventh, third]);
  }
  for (let i = 0; i < colorTones.length; i++) for (let j = i + 1; j < colorTones.length; j++) {
    const c1 = colorTones[i], c2 = colorTones[j];
    toneSets.push([third, c1, c2]); toneSets.push([seventh, c1, c2]);
    toneSets.push([c1, c2, third]); toneSets.push([c1, c2, seventh]);
  }
  return toneSets;
}
function roleToInterval(role, chordDef) { const idx = chordDef.r.indexOf(role); return idx !== -1 ? chordDef.iv[idx] % 12 : null; }
const SHELL_STRING_SETS_3 = [[0,1,2],[0,2,3],[1,2,3],[1,3,4],[2,3,4],[2,4,5]];
function placeShellToneSet(roles, strings, chordDef, rootSemi) {
  const pcs = [];
  for (const role of roles) { const iv = roleToInterval(role, chordDef); if (iv === null) return null; pcs.push((rootSemi + iv) % 12); }
  const bassStr = strings[0];
  const bassBaseFret = (((pcs[0] - (GS[bassStr] % 12)) % 12) + 12) % 12;
  for (const octaveShift of [0, 12]) {
    const bassFret = bassBaseFret + octaveShift;
    if (bassFret > 22) continue;
    const candLists = [];
    for (let i = 1; i < roles.length; i++) {
      const str = strings[i];
      const base = (((pcs[i] - (GS[str] % 12)) % 12) + 12) % 12;
      const cands = [base - 12, base, base + 12, base + 24].filter(f => f >= 0 && f <= 22);
      if (!cands.length) break;
      candLists.push(cands);
    }
    if (candLists.length !== roles.length - 1) continue;
    let best = null, bestSpan = Infinity, bestMax = Infinity;
    const combo = [];
    const search = (k) => {
      if (k === candLists.length) {
        const all = [bassFret, ...combo];
        const fretted = all.filter(f => f > 0);
        const hasOpen = all.some(f => f === 0);
        const span = fretted.length === 0 ? 0 : hasOpen ? Math.max(...fretted) : Math.max(...fretted) - Math.min(...fretted);
        if (span > 4) return;
        const maxF = Math.max(...all);
        if (span < bestSpan || (span === bestSpan && maxF < bestMax)) { best = combo.slice(); bestSpan = span; bestMax = maxF; }
        return;
      }
      for (const f of candLists[k]) { combo.push(f); search(k + 1); combo.pop(); }
    };
    search(0);
    if (best === null) continue;
    return { ok: true };
  }
  return null;
}
// ===== end copied logic =====

// ----- dictionary token/pc-set + the new shellQuality (copied from dictionaryGroups.ts) -----
const normTok = (t) => (t === 'R' || t === 'root') ? '1' : t;
function comboKeyOf(roles) {
  const toks = roles.map(r => normTok(ROLE_SHORT[r] || r)).filter(t => FORMULA_IV[t] !== undefined);
  const tokens = Array.from(new Set(toks));
  const pcs = Array.from(new Set(tokens.map(t => FORMULA_IV[t]))).sort((a, b) => a - b);
  return { tokens, key: pcs.join(',') };
}
function shellGuideTones(tokens) {
  const has = (t) => tokens.includes(t);
  const third = has('3') ? '3' : has('b3') ? 'b3' : null;
  const seventh = has('7') ? '7' : has('bb7') ? 'bb7' : has('b7') ? 'b7' : has('6') ? '6' : null;
  if (!seventh) return null;
  if (!third) return (has('4') || has('2')) ? 'sus' : null;
  return `${third}|${seventh}`;
}
const dictMemberShells = (def) => def.iv.length >= 4 && def.iv.some(iv => iv === 9 || iv === 10 || iv === 11);

// Derive the distinct shell combos exactly as formulaCombos does (root 0, placeable on some string set).
const combos = new Map();
for (const ct of ORDERED_TYPES) {
  const def = CH[ct];
  if (!def || !dictMemberShells(def)) continue;
  for (const roles of deriveShellToneSets(def)) {
    let placed = false;
    for (const ss of SHELL_STRING_SETS_3) { if (placeShellToneSet(roles, ss, def, 0)) { placed = true; break; } }
    if (!placed) continue;
    const { tokens, key } = comboKeyOf(roles);
    if (!tokens.length || combos.has(key)) continue;
    combos.set(key, { tokens, rootless: !tokens.includes('1') });
  }
}

const ORDER = ['3|7', '3|b7', 'b3|b7', 'b3|7', 'b3|bb7', '3|bb7', '3|6', 'b3|6', 'sus'];
const byPair = new Map();
let hidden = 0;
for (const c of combos.values()) {
  const k = shellGuideTones(c.tokens);
  if (!k) { hidden++; continue; }
  (byPair.get(k) || byPair.set(k, []).get(k)).push(c);
}
console.log(`Total combos: ${combos.size} — shown ${combos.size - hidden} guide-tone shells, hidden ${hidden} fragments\n`);
for (const k of [...ORDER, ...[...byPair.keys()].filter(x => !ORDER.includes(x))]) {
  const l = byPair.get(k); if (!l) continue;
  const rooted = l.filter(c => !c.rootless).length, rl = l.filter(c => c.rootless).length;
  const sample = l.slice(0, 6).map(c => c.tokens.join('-')).join(', ');
  console.log(`  ${k.padEnd(7)} ${String(l.length).padStart(2)}  (rooted ${rooted}, rootless ${rl})   e.g. ${sample}`);
}
