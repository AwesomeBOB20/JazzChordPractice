// Verify the guide-tone-anchored shell locks: b01 (E&A) must yield ONLY 643/543 with the
// guides (3 & 7) on strings 4&3 as the top two; b12 (A&D) must yield ONLY 532/432 with the
// guides on 3&2 as the top two. Also reports coverage (chords with no grip in a lock → falls
// back to ANY). Mirrors deriveShellToneSets/placeShellToneSet + the voiceLeading.ts lock filter.
'use strict';
const fs = require('fs');
const s = fs.readFileSync('src/shared/theory/musicTheory.ts', 'utf8');
const i = s.indexOf('export const CH');
const b = s.indexOf('= {', i) + 2, e = s.indexOf('\n};', b);
const CH = eval('(' + s.slice(b, e + 2) + ')');
const GS = [40, 45, 50, 55, 59, 64];

const SHELL_THIRD_ROLES = ['3rd', 'b3rd'], SHELL_THIRD_SUBS = ['4th', '2nd'], SHELL_SEVENTH_ROLES = ['7th', 'b7th', 'bb7'];
function deriveShellToneSets(def) {
  const r = def.r;
  let third = r.find(x => SHELL_THIRD_ROLES.includes(x)) ?? null;
  if (!third) third = SHELL_THIRD_SUBS.find(x => r.includes(x)) ?? null;
  let seventh = r.find(x => SHELL_SEVENTH_ROLES.includes(x)) ?? null;
  if (!seventh && r.includes('6th')) seventh = '6th';
  if (!third || !seventh) return [];
  const colors = r.filter(x => x !== 'root' && x !== third && x !== seventh && x !== '5th');
  const ts = [['root', third, seventh], ['root', seventh, third]];
  for (const c of colors) { ts.push([third, seventh, c]); ts.push([seventh, third, c]); }
  return ts;
}
function ivOf(role, def) { const i = def.r.indexOf(role); return i !== -1 ? def.iv[i] % 12 : null; }
const SETS = [[0,1,2],[0,2,3],[1,2,3],[1,3,4],[2,3,4],[2,4,5]];
const SETNAME = { '0,1,2':'654','0,2,3':'643','1,2,3':'543','1,3,4':'532','2,3,4':'432','2,4,5':'421' };
function place(roles, strings, def, root) {
  const pcs = roles.map(r => (root + ivOf(r, def) + 144) % 12);
  const bassBase = (((pcs[0] - GS[strings[0]] % 12) % 12) + 12) % 12;
  for (const oct of [0, 12]) {
    const bf = bassBase + oct; if (bf > 22) continue;
    const lists = [];
    for (let k = 1; k < roles.length; k++) {
      const base = (((pcs[k] - GS[strings[k]] % 12) % 12) + 12) % 12;
      const c = [base - 12, base, base + 12, base + 24].filter(f => f >= 0 && f <= 22);
      if (!c.length) { lists.length = 0; break; }
      lists.push(c);
    }
    if (lists.length !== roles.length - 1) continue;
    let best = null, bestSpan = Infinity, bestMax = Infinity; const combo = [];
    const go = k => {
      if (k === lists.length) {
        const all = [bf, ...combo], fr = all.filter(f => f > 0), open = all.some(f => f === 0);
        const span = fr.length === 0 ? 0 : open ? Math.max(...fr) : Math.max(...fr) - Math.min(...fr);
        if (span > 4) return; const mx = Math.max(...all);
        if (span < bestSpan || (span === bestSpan && mx < bestMax)) { best = combo.slice(); bestSpan = span; bestMax = mx; }
        return;
      }
      for (const f of lists[k]) { combo.push(f); go(k + 1); combo.pop(); }
    };
    go(0);
    if (best === null) continue;
    const frets = Array(6).fill(null);
    roles.forEach((role, k) => { frets[strings[k]] = { fret: [bf, ...best][k], role }; });
    return { frets, set: SETNAME[strings.join(',')] };
  }
  return null;
}
function buildShells(type, root) {
  const def = CH[type], out = [];
  for (const roles of deriveShellToneSets(def))
    for (const set of SETS) { const p = place(roles, set, def, root); if (p) out.push(p); }
  return out;
}

// --- new lock filter, mirrored from voiceLeading.ts ---
const SHELL_G3 = new Set(['3rd','b3rd','4th','2nd']), SHELL_G7 = new Set(['7th','b7th','bb7','6th']);
function guideStrings(frets){ let g3=null,g7=null; frets.forEach((f,i)=>{ if(!f||f.fret===null)return; if(SHELL_G3.has(f.role))g3=i; else if(SHELL_G7.has(f.role))g7=i; }); return {g3,g7}; }
const LOCK = { b01:[2,3], b12:[3,4] };
function lockFilter(shells, key){
  const pair = LOCK[key];
  return shells.filter(v=>{
    const gs = guideStrings(v.frets);
    if(gs.g3===null||gs.g7===null) return false;
    const g=[gs.g3,gs.g7];
    if(!g.includes(pair[0])||!g.includes(pair[1])) return false;
    const maxStr = v.frets.reduce((m,f,i)=>(f&&f.fret!==null&&i>m)?i:m,-1);
    return maxStr<=pair[1];
  });
}

const SEVENTH_CHORDS = ['maj7','min7','dom7','hdim7','dom7s5s9','dom7alt','min7','maj9','min9','dom9','dom7b9','maj6','min6'];
const EXPECT = { b01: new Set(['643','543']), b12: new Set(['532','432']) };
let fails = 0, fallbacks = 0, checks = 0;
for (const type of [...new Set(SEVENTH_CHORDS)]) {
  for (let root = 0; root < 12; root++) {
    const shells = buildShells(type, root);
    if (!shells.length) continue;
    for (const key of ['b01','b12']) {
      checks++;
      const got = lockFilter(shells, key);
      if (!got.length) { fallbacks++; continue; }
      for (const v of got) {
        if (!EXPECT[key].has(v.set)) { console.log(`FAIL ${type} root${root} ${key}: set ${v.set} not in expected`); fails++; }
        const gs = guideStrings(v.frets);
        // guides must be the top two strings
        const active = v.frets.map((f,i)=>f&&f.fret!==null?i:-1).filter(i=>i>=0);
        const topTwo = active.sort((a,b)=>b-a).slice(0,2).sort((a,b)=>a-b);
        if (topTwo[0]!==gs.g3 && topTwo[0]!==gs.g7 || topTwo[1]!==gs.g3 && topTwo[1]!==gs.g7) {
          console.log(`FAIL ${type} root${root} ${key}: guides not the top two (top=${topTwo}, g3=${gs.g3}, g7=${gs.g7})`); fails++;
        }
      }
    }
  }
}
console.log(`\nChecks: ${checks}  |  Fallback-to-ANY (no grip in lock): ${fallbacks}  |  FAILURES: ${fails}`);
process.exit(fails ? 1 : 0);
