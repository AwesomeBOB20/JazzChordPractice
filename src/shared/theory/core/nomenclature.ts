// Intercepts BOTH internal IDs and Long English names, enforcing strict Berklee-style Jazz Shorthand
export function formatChordSymbol(internalName: string): string {
  if (!internalName) return '';
  let s = internalName;
  
  const replacements: [RegExp, string][] = [
    // Case-sensitive strict matches for shorthand
    [/mM7/g, 'mΔ7'],
    [/M7#11/g, 'Δ7(♯11)'],
    [/M13/g, 'Δ13'],
    [/M11/g, 'Δ11'],
    [/M9/g, 'Δ9'],
    [/M7/g, 'Δ7'],
    [/M6/g, '6'],

    // Case-insensitive descriptive matches
    [/Min(or)?\s*Maj(or)?\s*7|minMaj7/gi, 'mΔ7'],
    [/Maj(or)?\s*7\s*\(?#11\)?|maj7s11/gi, 'Δ7(♯11)'],
    [/Dom(inant)?\s*7\s*\(?#11\)?|7#11|dom7s11/gi, '7(♯11)'],
    [/Dom(inant)?\s*7\s*\(?b9\)?|7b9|dom7b9/gi, '7(♭9)'],
    [/Dom(inant)?\s*7\s*\(?#9\)?|7#9|dom7s9/gi, '7(♯9)'],
    [/Dom(inant)?\s*7\s*\(?b13\)?|7b13|dom7b13/gi, '7(♭13)'],
    [/Dom(inant)?\s*7\s*\(?#13\)?|7#13|dom7s13/gi, '7(♯13)'],
    [/m(in)?(or)?\s*7\s*\(?b5\)?|half[- ]?dim(inished)?|hdim7|m7b5/gi, 'ø7'],
    [/dim(inished)?\s*7|fdim7|dim7/gi, '°7'],
    [/dom(inant)?\s*7\s*sus4|7sus4|dom7sus4/gi, '7sus4'],
    [/maj(or)?\s*6\/?9|6\/?9|maj69/gi, '6/9'],
    [/m(in)?(or)?\s*6\/?9|m6\/?9|min69/gi, 'm6/9'],
    [/maj(or)?\s*13|maj13/gi, 'Δ13'],
    [/min(or)?\s*13|min13/gi, 'm13'],
    [/dom(inant)?\s*13|dom13/gi, '13'],
    [/maj(or)?\s*11|maj11/gi, 'Δ11'],
    [/min(or)?\s*11|min11/gi, 'm11'],
    [/dom(inant)?\s*11|dom11/gi, '11'],
    [/maj(or)?\s*9|maj9/gi, 'Δ9'],
    [/min(or)?\s*9|min9/gi, 'm9'],
    [/dom(inant)?\s*9|dom9/gi, '9'],
    [/maj(or)?\s*7|maj7/gi, 'Δ7'],
    [/min(or)?\s*7|min7/gi, 'm7'],
    [/dom(inant)?\s*7|dom7/gi, '7'],
    [/maj(or)?\s*6|maj6/gi, '6'],
    [/min(or)?\s*6|min6/gi, 'm6'],
    [/\b(dom(inant)?)?\s*7\s*alt(ered)?\b|\b7alt\b/gi, '7(alt)'],
    [/\baug(mented)?\b/gi, 'Aug'],
    [/\bdim(inished)?\b/gi, 'Dim'],
    [/\bsus4\b/gi, 'sus4'],
    [/\bsus2\b/gi, 'sus2'],
    [/\bmaj(or)?\b/gi, 'Maj'],
    [/\bmin(or)?\b/gi, 'Min'],
  ];

  for (const [regex, replacement] of replacements) {
     s = s.replace(regex, replacement);
  }
  return s;
}