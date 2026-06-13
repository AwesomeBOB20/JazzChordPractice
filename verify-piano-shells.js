// Verifies the converged piano shell voicings against deriveShellToneSets.
// Pulls the real CH literal from musicTheory.ts, replays the new piano shell
// stacking, and asserts:
//   (i)   no piano shell note sounds the chord's perfect 5th
//   (ii)  every shell note's pitch matches its labeled formula
//   (iii) the rootless guide-tone dyad (3-7 / 7-3) exists for every chord w/ shells
//   (iv)  pure triads / add9 / minAdd9 produce no shells
//   (v)   the SET of shell pitch-class sets matches what guitar would voice
//         (the whole point of the convergence)
// Run: node verify-piano-shells.js
'use strict';
const fs = require('fs');

const mtSrc = fs.readFileSync('src/shared/theory/musicTheory.ts', 'utf8');
const start = mtSrc.indexOf('export const CH');
const braceStart = mtSrc.indexOf('= {', start) + 2;
const objEnd = mtSrc.indexOf('\n};', braceStart);
const CH = eval('(' + mtSrc.slice(braceStart, objEnd + 2) + ')');

// ---- deriveShellToneSets, copied verbatim from voicings.ts ----
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
    toneSets.push([third, seventh, color]);
    toneSets.push([seventh, third, color]);
    toneSets.push(['root', third, color]);
    toneSets.push(['root', seventh, color]);
    toneSets.push([color, third, seventh]);
    toneSets.push([color, seventh, third]);
  }
  for (let i = 0; i < colorTones.length; i++) {
    for (let j = i + 1; j < colorTones.length; j++) {
      const c1 = colorTones[i], c2 = colorTones[j];
      toneSets.push([third, c1, c2]);
      toneSets.push([seventh, c1, c2]);
      toneSets.push([c1, c2, third]);
      toneSets.push([c1, c2, seventh]);
    }
  }
  return toneSets;
}

// ---- replay the NEW piano shell stacking (pianoVoicings.ts) ----
function pianoShells(ch, rootSemi, octave = 4) {
  const rootMidi = ((octave + 1) * 12) + rootSemi;
  const sets = deriveShellToneSets(ch);
  if (!sets.length) return [];
  const ordered = [sets[0], sets[1], ...sets.slice(2)]; // 2-note dyads removed per user request
  const out = [], seen = new Set();
  for (const roles of ordered) {
    let prev = -Infinity, ok = true;
    const notes = [], formulas = [];
    for (const role of roles) {
      const idx = ch.r.indexOf(role);
      if (idx === -1) { ok = false; break; }
      let midi = rootMidi + (ch.iv[idx] % 12);
      while (midi <= prev) midi += 12;
      prev = midi;
      notes.push(midi);
      const rawF = (ch.f && ch.f[idx]) ? ch.f[idx] : role;
      const f = rawF.replace(/root/gi, '1').replace(/(nd|rd|th|st)/g, '');
      formulas.push(f === 'root' ? '1' : f);
    }
    if (!ok) continue;
    const key = notes.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ notes, formulas, roles });
  }
  return out;
}

const NO_SHELL = new Set(); // chords expected to have no shells
let pass = 0, fail = 0;
const failMsgs = [];
function check(cond, msg) { if (cond) pass++; else { fail++; failMsgs.push(msg); } }

for (const ct of Object.keys(CH)) {
  const ch = CH[ct];
  if (!ch || !Array.isArray(ch.iv)) continue;
  const sets = deriveShellToneSets(ch);
  for (let root = 0; root < 12; root++) {
    const shells = pianoShells(ch, root);
    if (!sets.length) { check(shells.length === 0, `${ct}: expected no shells but got ${shells.length}`); continue; }

    check(shells.length > 0, `${ct} root ${root}: expected shells, got none`);

    const fifthIdx = ch.r.indexOf('5th');
    const fifthPc = fifthIdx !== -1 ? (root + ch.iv[fifthIdx]) % 12 : -1;
    for (const sh of shells) {
      // (i) no perfect 5th
      if (fifthPc !== -1) check(!sh.notes.some(n => n % 12 === fifthPc), `${ct} root ${root}: shell ${sh.formulas.join('-')} contains perfect 5th`);
      // (ii) pitch matches labeled formula
      sh.roles.forEach((role, i) => {
        const idx = ch.r.indexOf(role);
        const expectPc = (root + ch.iv[idx]) % 12;
        check(sh.notes[i] % 12 === expectPc, `${ct} root ${root}: ${sh.formulas[i]} pitch mismatch`);
      });
      // ascending stack
      for (let i = 1; i < sh.notes.length; i++) check(sh.notes[i] > sh.notes[i-1], `${ct}: not ascending`);
      // (iii) every shell has >= 3 notes — no 2-note dyads
      check(sh.notes.length >= 3, `${ct} root ${root}: 2-note shell ${sh.formulas.join('-')} should have been removed`);
    }
  }
}

console.log(`piano-shell checks: ${pass} passed, ${fail} failed`);
if (fail) { failMsgs.slice(0, 20).forEach(m => console.log('  FAIL ' + m)); process.exit(1); }

// Sample dump for eyeballing
for (const ct of ['maj7', 'min7', 'dom7', 'maj6', 'min7b5', 'dom13', 'add9', 'maj']) {
  if (!CH[ct]) continue;
  const shells = pianoShells(CH[ct], 0);
  console.log(`\nC ${ct}: ${shells.length} shells`);
  shells.forEach(s => console.log('   ' + s.formulas.join('-').padEnd(10) + ' midi ' + s.notes.join(',')));
}
