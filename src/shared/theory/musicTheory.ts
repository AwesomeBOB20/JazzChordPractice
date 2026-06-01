// ════════════════════════════════════════════════════════════════════════════
// MUSIC THEORY — SINGLE SOURCE OF TRUTH
// Every piece of music-theory data and every helper that reasons about notes,
// intervals, chords, scales, spelling and naming lives here. Nothing else in the
// app should re-declare a note-name array, the guitar tuning, a role-ordering
// table, or its own copy of interval math. Import from '@shared/theory' instead.
//
// IMPORTANT — internal vs. displayed accidentals:
//   • INTERNAL formula/role tokens stay ASCII ('b3', '#11', 'b3rd'). They are
//     keys and are parsed by regexes (spellInterval, formatChordSymbol), so they
//     must NOT be turned into ♭/♯ glyphs.
//   • DISPLAYED text must use real musical glyphs. Always run it through one of
//     the display helpers below (spellInterval / formatDegree / toProSymbol /
//     noteName), which emit professional ♭ / ♯ symbols.
// ════════════════════════════════════════════════════════════════════════════

// ─── Pitch primitives ────────────────────────────────────────────────────────
export const NOTE_SHARP = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
export const NOTE_FLAT  = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];

// ─── Instrument constants ─────────────────────────────────────────────────────
export const GUITAR_TUNING           = [40, 45, 50, 55, 59, 64]; // standard tuning, low→high (MIDI)
export const GUITAR_TUNING_SEMITONES = [0, 5, 10, 15, 19, 24];   // semitone offsets from low E

// ─── Pitch-class helpers ──────────────────────────────────────────────────────
/** Always-positive pitch class (0–11) for any MIDI note or semitone value. */
export function pc(n: number): number { return ((n % 12) + 12) % 12; }

/** Spell a raw MIDI note / pitch class as a note name using the chosen accidental side. */
export function noteName(midiOrPc: number, useFlat = false): string {
  return (useFlat ? NOTE_FLAT : NOTE_SHARP)[pc(midiOrPc)];
}

/** Interval in semitones (0–11) of a note above a given root. */
export function intervalFromRoot(midiOrPc: number, rootSemi: number): number {
  return pc(midiOrPc - rootSemi);
}

/** Convert any label's ASCII accidentals to professional glyphs without stripping
 *  degree suffixes. Use for arbitrary display strings; use formatDegree for pure
 *  scale-degree tokens. */
export function toProSymbol(s: string): string {
  return (s || '')
    .replace(/bb/g, '♭♭')
    .replace(/##/g, '♯♯')
    .replace(/b/g, '♭')
    .replace(/#/g, '♯');
}



export const CH: Record<string, {l:string,s:string,iv:number[],r:string[],f:string[]}> = {
  'maj':      {l:'Major',      s:'maj',    iv:[0,4,7],        r:['root','3rd','5th'],                        f:['R','3','5']},
  'min':      {l:'Minor',      s:'min',    iv:[0,3,7],        r:['root','b3rd','5th'],                        f:['R','b3','5']},
  'aug':      {l:'Augmented',  s:'+',      iv:[0,4,8],        r:['root','3rd','#5th'],                       f:['R','3','#5']},
  'dim':      {l:'Diminished', s:'°',      iv:[0,3,6],        r:['root','b3rd','b5th'],                      f:['R','b3','b5']},
  'sus4':     {l:'Sus4',       s:'sus4',   iv:[0,5,7],        r:['root','4th','5th'],                        f:['R','4','5']},
  'sus2':     {l:'Sus2',       s:'sus2',   iv:[0,2,7],        r:['root','2nd','5th'],                        f:['R','2','5']},
  'maj_b5':   {l:'Major ♭5',   s:'(♭5)',   iv:[0,4,6],        r:['root','3rd','b5th'],                       f:['R','3','b5']},
  'maj7':     {l:'Maj 7',      s:'Δ7',     iv:[0,4,7,11],     r:['root','3rd','5th','7th'],                  f:['R','3','5','7']},
  'min7':     {l:'Min 7',      s:'m7',     iv:[0,3,7,10],     r:['root','b3rd','5th','b7th'],                 f:['R','b3','5','b7']},
  'dom7':     {l:'7',          s:'7',      iv:[0,4,7,10],     r:['root','3rd','5th','b7th'],                 f:['R','3','5','b7']},
  'hdim7':    {l:'ø7',         s:'ø7',     iv:[0,3,6,10],     r:['root','b3rd','b5th','b7th'],               f:['R','b3','b5','b7']},
  'fdim7':    {l:'°7',         s:'°7',     iv:[0,3,6,9],      r:['root','b3rd','b5th','bb7'],                 f:['R','b3','b5','bb7']},
  'maj9':     {l:'Maj 9',      s:'Δ9',     iv:[0,4,7,11,14],  r:['root','3rd','5th','7th','9th'],            f:['R','3','5','7','9']},
  'min9':     {l:'Min 9',      s:'m9',     iv:[0,3,7,10,14],  r:['root','b3rd','5th','b7th','9th'],           f:['R','b3','5','b7','9']},
  'dom9':     {l:'9',          s:'9',      iv:[0,4,7,10,14],  r:['root','3rd','5th','b7th','9th'],            f:['R','3','5','b7','9']},
  'maj7s11':  {l:'Maj 7♯11',   s:'Δ7♯11', iv:[0,4,7,11,18],  r:['root','3rd','5th','7th','#11th'],          f:['R','3','5','7','#11']},
  'dom7s11':  {l:'7♯11',       s:'7♯11',  iv:[0,4,7,10,18],  r:['root','3rd','5th','b7th','#11th'],         f:['R','3','5','b7','#11']},
  'maj13':    {l:'Maj 13',     s:'Δ13',    iv:[0,4,7,11,14,21], r:['root','3rd','5th','7th','9th','13th'],     f:['R','3','5','7','9','13']},
  'min13':    {l:'Min 13',     s:'m13',    iv:[0,3,7,10,14,21], r:['root','b3rd','5th','b7th','9th','13th'],   f:['R','b3','5','b7','9','13']},
  'dom13':    {l:'13',         s:'13',     iv:[0,4,7,10,14,21], r:['root','3rd','5th','b7th','9th','13th'],    f:['R','3','5','b7','9','13']},
  'maj6':     {l:'Maj 6',      s:'6',      iv:[0,4,7,9],      r:['root','3rd','5th','6th'],                  f:['R','3','5','6']},
  'min6':     {l:'Min 6',      s:'m6',     iv:[0,3,7,9],      r:['root','b3rd','5th','6th'],                  f:['R','b3','5','6']},
  'minMaj7':  {l:'Min Maj 7',  s:'m(Δ7)', iv:[0,3,7,11],     r:['root','b3rd','5th','7th'],                  f:['R','b3','5','7']},
  'dom7sus4': {l:'7 Sus4',     s:'7sus4',  iv:[0,5,7,10],     r:['root','4th','5th','b7th'],                 f:['R','4','5','b7']},
  'dom7alt':  {l:'7alt',       s:'7alt',   iv:[0,4,8,10,13,15], r:['root','3rd','#5th','b7th','b9th','#9th'], f:['R','3','#5','b7','b9','#9']},
  'maj69':    {l:'Maj 6/9',    s:'6/9',    iv:[0,4,7,9,14],   r:['root','3rd','5th','6th','9th'],            f:['R','3','5','6','9']},
  'min69':    {l:'Min 6/9',    s:'m6/9',   iv:[0,3,7,9,14],   r:['root','b3rd','5th','6th','9th'],            f:['R','b3','5','6','9']},
  'dom7b13':  {l:'7♭13',       s:'7♭13',   iv:[0,4,7,10,14,20], r:['root','3rd','5th','b7th','9th','b13th'],   f:['R','3','5','b7','9','b13']},
  'dom7b9':   {l:'7♭9',        s:'7♭9',    iv:[0,4,7,10,13],  r:['root','3rd','5th','b7th','b9th'],          f:['R','3','5','b7','b9']},
  'dom7s9':   {l:'7♯9',        s:'7♯9',    iv:[0,4,7,10,15],  r:['root','3rd','5th','b7th','#9th'],          f:['R','3','5','b7','#9']},
  'dom11':    {l:'11',         s:'11',     iv:[0,4,7,10,14,17], r:['root','3rd','5th','b7th','9th','11th'],    f:['R','3','5','b7','9','11']},
  'maj11':    {l:'Maj 11',     s:'Δ11',    iv:[0,4,7,11,14,17], r:['root','3rd','5th','7th','9th','11th'],    f:['R','3','5','7','9','11']},
  'min11':    {l:'Min 11',     s:'m11',    iv:[0,3,7,10,14,17], r:['root','b3rd','5th','b7th','9th','11th'],   f:['R','b3','5','b7','9','11']},
  'maj7s5':   {l:'Maj 7♯5',    s:'Δ7♯5',   iv:[0,4,8,11],       r:['root','3rd','#5th','7th'],                 f:['R','3','#5','7']},
  'dom9sus4': {l:'9sus4',      s:'9sus4',  iv:[0,5,7,10,14],    r:['root','4th','5th','b7th','9th'],           f:['R','4','5','b7','9']},
  'dom13sus4':{l:'13sus4',     s:'13sus4', iv:[0,5,7,10,14,21], r:['root','4th','5th','b7th','9th','13th'],    f:['R','4','5','b7','9','13']},
  'minMaj9':  {l:'Min Maj 9',  s:'m(Δ9)', iv:[0,3,7,11,14],    r:['root','b3rd','5th','7th','9th'],            f:['R','b3','5','7','9']},
  'dom13b9':  {l:'13♭9',       s:'13♭9',   iv:[0,4,7,10,13,17,21], r:['root','3rd','5th','b7th','b9th','11th','13th'], f:['R','3','5','b7','b9','11','13']},
  'dom13s9':  {l:'13♯9',       s:'13♯9',   iv:[0,4,7,10,15,17,21], r:['root','3rd','5th','b7th','#9th','11th','13th'], f:['R','3','5','b7','#9','11','13']},
  'dom7b5b9': {l:'7♭5♭9',      s:'7♭5♭9',  iv:[0,4,6,10,13],    r:['root','3rd','b5th','b7th','b9th'],         f:['R','3','b5','b7','b9']},
  'dom7b5s9': {l:'7♭5♯9',      s:'7♭5♯9',  iv:[0,4,6,10,15],    r:['root','3rd','b5th','b7th','#9th'],         f:['R','3','b5','b7','#9']},
  'dom7s5b9': {l:'7♯5♭9',      s:'7♯5♭9',  iv:[0,4,8,10,13],    r:['root','3rd','#5th','b7th','b9th'],         f:['R','3','#5','b7','b9']},
  'dom7s5s9': {l:'7♯5♯9',      s:'7♯5♯9',  iv:[0,4,8,10,15],    r:['root','3rd','#5th','b7th','#9th'],         f:['R','3','#5','b7','#9']},
  'dom7b5':   {l:'7♭5',        s:'7♭5',    iv:[0,4,6,10],       r:['root','3rd','b5th','b7th'],                f:['R','3','b5','b7']},
  'dom7s5':   {l:'7♯5',        s:'7♯5',    iv:[0,4,8,10],       r:['root','3rd','#5th','b7th'],                f:['R','3','#5','b7']},
  'add9':     {l:'Add 9',      s:'add9',   iv:[0,4,7,14],       r:['root','3rd','5th','9th'],                  f:['R','3','5','9']},
  'minAdd9':  {l:'Min Add 9',  s:'m(add9)',iv:[0,3,7,14],       r:['root','b3rd','5th','9th'],                  f:['R','b3','5','9']},
  'dimMaj7':  {l:'Dim Maj 7',  s:'°Δ7',   iv:[0,3,6,11],       r:['root','b3rd','b5th','7th'],                f:['R','b3','b5','7']},
};

export const CHORD_CATEGORIES = [
  { label: 'Triads', keys: ['maj', 'min', 'aug', 'dim', 'sus4', 'sus2', 'maj_b5'] },
  { label: '6th Chords', keys: ['maj6', 'min6', 'maj69', 'min69'] },
  { label: '7th Chords', keys: ['maj7', 'min7', 'dom7', 'hdim7', 'fdim7', 'minMaj7', 'dimMaj7', 'dom7sus4'] },
  { label: 'Altered 7ths', keys: ['dom7b5', 'dom7s5', 'dom7b9', 'dom7s9', 'dom7alt', 'dom7b13', 'dom7b5b9', 'dom7b5s9', 'dom7s5b9', 'dom7s5s9'] },
  { label: '9th Chords', keys: ['maj9', 'min9', 'dom9', 'minMaj9', 'dom9sus4', 'add9', 'minAdd9'] },
  { label: '11th Chords', keys: ['maj11', 'min11', 'dom11', 'maj7s11', 'dom7s11'] },
  { label: '13th Chords', keys: ['maj13', 'min13', 'dom13', 'dom13sus4', 'dom13b9', 'dom13s9'] }
];

export const SCALES: Record<string, { name: string; iv: number[]; r: string[]; f: string[] }> = {
  'ionian':       { name: 'Ionian (Major)',             iv: [0,2,4,5,7,9,11],    r: ['root','2nd','3rd','4th','5th','6th','7th'],     f: ['R','2','3','4','5','6','7'] },
  'dorian':       { name: 'Dorian',                     iv: [0,2,3,5,7,9,10],    r: ['root','2nd','b3rd','4th','5th','6th','b7th'],    f: ['R','2','b3','4','5','6','b7'] },
  'phrygian':     { name: 'Phrygian',                   iv: [0,1,3,5,7,8,10],    r: ['root','b2nd','b3rd','4th','5th','b6th','b7th'],  f: ['R','b2','b3','4','5','b6','b7'] },
  'lydian':       { name: 'Lydian',                     iv: [0,2,4,6,7,9,11],    r: ['root','2nd','3rd','#4th','5th','6th','7th'],     f: ['R','2','3','#4','5','6','7'] },
  'mixolydian':   { name: 'Mixolydian',                 iv: [0,2,4,5,7,9,10],    r: ['root','2nd','3rd','4th','5th','6th','b7th'],     f: ['R','2','3','4','5','6','b7'] },
  'aeolian':      { name: 'Aeolian (Natural Minor)',    iv: [0,2,3,5,7,8,10],    r: ['root','2nd','b3rd','4th','5th','b6th','b7th'],   f: ['R','2','b3','4','5','b6','b7'] },
  'locrian':      { name: 'Locrian',              iv: [0,1,3,5,6,8,10],    r: ['root','b2nd','b3rd','4th','b5th','b6th','b7th'],  f: ['R','b2','b3','4','b5','b6','b7'] },
  'maj_pent':     { name: 'Major Pentatonic',     iv: [0,2,4,7,9],         r: ['root','2nd','3rd','5th','6th'],                 f: ['R','2','3','5','6'] },
  'min_pent':     { name: 'Minor Pentatonic',     iv: [0,3,5,7,10],        r: ['root','b3rd','4th','5th','b7th'],                f: ['R','b3','4','5','b7'] },
  'blues':        { name: 'Blues',                iv: [0,3,5,6,7,10],      r: ['root','b3rd','4th','b5th','5th','b7th'],         f: ['R','b3','4','b5','5','b7'] },
  'mel_min':      { name: 'Melodic Minor',        iv: [0,2,3,5,7,9,11],    r: ['root','2nd','b3rd','4th','5th','6th','7th'],     f: ['R','2','b3','4','5','6','7'] },
  'harm_min':     { name: 'Harmonic Minor',       iv: [0,2,3,5,7,8,11],    r: ['root','2nd','b3rd','4th','5th','b6th','7th'],     f: ['R','2','b3','4','5','b6','7'] },
  'dim_hw':       { name: 'HW Diminished',        iv: [0,1,3,4,6,7,9,10],  r: ['root','b2nd','b3rd','3rd','b5th','5th','6th','b7th'],f: ['R','b2','b3','3','b5','5','6','b7'] },
  'dim_wh':       { name: 'WH Diminished',        iv: [0,2,3,5,6,8,9,11],  r: ['root','2nd','b3rd','4th','b5th','b6th','6th','7th'],f: ['R','2','b3','4','b5','b6','6','7'] },
  'altered':      { name: 'Altered',              iv: [0,1,3,4,6,8,10],    r: ['root','b2nd','#2nd','b3rd','b5th','b6th','b7th'], f: ['R','b2','#2','b3','b5','b6','b7'] },
  'whole_tone':   { name: 'Whole Tone',           iv: [0,2,4,6,8,10],      r: ['root','2nd','3rd','#4th','#5th','b7th'],         f: ['R','2','3','#4','#5','b7'] },
  'lydian_aug':   { name: 'Lydian Augmented',     iv: [0,2,4,6,8,9,11],    r: ['root','2nd','3rd','#4th','#5th','6th','7th'],    f: ['R','2','3','#4','#5','6','7'] },
  'locrian_nat2': { name: 'Locrian ♮2',           iv: [0,2,3,5,6,8,10],    r: ['root','2nd','b3rd','4th','b5th','b6th','b7th'],  f: ['R','2','b3','4','b5','b6','b7'] },
  'lydian_dom':   { name: 'Lydian Dominant',      iv: [0,2,4,6,7,9,10],    r: ['root','2nd','3rd','#4th','5th','6th','b7th'],    f: ['R','2','3','#4','5','6','b7'] },
  'phryg_dom':    { name: 'Phrygian Dominant',    iv: [0,1,4,5,7,8,10],    r: ['root','b2nd','3rd','4th','5th','b6th','b7th'],   f: ['R','b2','3','4','5','b6','b7'] },
  'bebop_maj':    { name: 'Bebop Major',          iv: [0,2,4,5,7,8,9,11],  r: ['root','2nd','3rd','4th','5th','b6th','6th','7th'],f: ['R','2','3','4','5','b6','6','7'] },
  'bebop_dom':    { name: 'Bebop Dominant',       iv: [0,2,4,5,7,9,10,11], r: ['root','2nd','3rd','4th','5th','6th','b7th','7th'],f: ['R','2','3','4','5','6','b7','7'] },
  'ionian_aug':   { name: 'Ionian Augmented',     iv: [0,2,4,5,8,9,11],    r: ['root','2nd','3rd','4th','#5th','6th','7th'],     f: ['R','2','3','4','#5','6','7'] },
  'aeolian_dom':  { name: 'Aeolian Dominant',     iv: [0,2,4,5,7,8,10],    r: ['root','2nd','3rd','4th','5th','b6th','b7th'],    f: ['R','2','3','4','5','b6','b7'] },
  'bebop_min':    { name: 'Bebop Minor',          iv: [0,2,3,4,5,7,9,10],  r: ['root','2nd','b3rd','3rd','4th','5th','6th','b7th'],f: ['R','2','b3','3','4','5','6','b7'] },
  'bebop_mel_min':{ name: 'Bebop Melodic Minor',  iv: [0,2,3,5,7,8,9,11],  r: ['root','2nd','b3rd','4th','5th','b6th','6th','7th'],f: ['R','2','b3','4','5','b6','6','7'] },
  'blues_maj':    { name: 'Blues Major',          iv: [0,2,3,4,7,9],       r: ['root','2nd','b3rd','3rd','5th','6th'],           f: ['R','2','b3','3','5','6'] },
  'augmented_sym':{ name: 'Augmented (Symmetric)',iv: [0,3,4,7,8,11],      r: ['root','b3rd','3rd','5th','#5th','7th'],         f: ['R','#2','3','5','#5','7'] },
  'hung_min':     { name: 'Hungarian Minor',      iv: [0,2,3,6,7,8,11],    r: ['root','2nd','b3rd','#4th','5th','b6th','7th'],   f: ['R','2','b3','#4','5','b6','7'] },
  'hung_maj':     { name: 'Hungarian Major',      iv: [0,3,4,6,7,9,10],    r: ['root','#2nd','3rd','#4th','5th','6th','b7th'],   f: ['R','#2','3','#4','5','6','b7'] },
  'neapolitan_maj':{name: 'Neapolitan Major',     iv: [0,1,3,5,7,9,11],    r: ['root','b2nd','b3rd','4th','5th','6th','7th'],    f: ['R','b2','b3','4','5','6','7'] },
  'neapolitan_min':{name: 'Neapolitan Minor',     iv: [0,1,3,5,7,8,11],    r: ['root','b2nd','b3rd','4th','5th','b6th','7th'],   f: ['R','b2','b3','4','5','b6','7'] },
  'hijaz':        { name: 'Hijaz',                iv: [0,1,4,5,7,9,10],    r: ['root','b2nd','3rd','4th','5th','6th','b7th'],    f: ['R','b2','3','4','5','6','b7'] },
  'byzantine':    { name: 'Double Harmonic (Byzantine)', iv: [0,1,4,5,7,8,11], r: ['root','b2nd','3rd','4th','5th','b6th','7th'], f: ['R','b2','3','4','5','b6','7'] },
};

export const CHORD_SCALE_MAP: Record<string, string[]> = {
  'maj':      ['ionian','lydian','maj_pent','bebop_maj'],
  'min':      ['dorian','aeolian','min_pent','phrygian'],
  'aug':      ['whole_tone','lydian_aug'],
  'dim':      ['locrian','dim_wh','dim_hw'],
  'sus4':     ['mixolydian','ionian'],
  'sus2':     ['ionian','mixolydian'],
  'maj7':     ['ionian','lydian','maj_pent','bebop_maj'],
  'min7':     ['dorian','aeolian','min_pent','phrygian'],
  'dom7':     ['mixolydian','blues','min_pent','maj_pent','lydian_dom','dim_hw','altered','phryg_dom','bebop_dom','aeolian_dom'],
  'hdim7':    ['locrian','locrian_nat2'],
  'fdim7':    ['dim_wh','dim_hw'],
  'maj9':     ['ionian','lydian','maj_pent'],
  'min9':     ['dorian','aeolian','min_pent'],
  'dom9':     ['mixolydian','lydian_dom','bebop_dom'],
  'dom7b9':   ['dim_hw','altered','phryg_dom','byzantine'],
  'dom7s9':   ['altered','dim_hw'],
  'maj11':    ['lydian'],
  'min11':    ['dorian'],
  'dom11':    ['mixolydian'],
  'dom7s11':  ['lydian_dom','whole_tone'],
  'maj13':    ['ionian','lydian'],
  'min13':    ['dorian'],
  'dom13':    ['mixolydian','lydian_dom'],
  'dom7b13':  ['altered','whole_tone'],
  'maj6':     ['ionian','maj_pent','bebop_maj'],
  'min6':     ['dorian','mel_min'],
  'maj69':    ['ionian','maj_pent'],
  'min69':    ['dorian','mel_min'],
  'minMaj7':  ['mel_min','harm_min'],
  'dom7sus4': ['mixolydian'],
  'dom7alt':  ['altered','dim_hw'],
  'maj7s11':  ['lydian'],
  'maj7s5':   ['lydian_aug'],
  'dom9sus4': ['mixolydian'],
  'dom13sus4':['mixolydian'],
  'minMaj9':  ['mel_min','harm_min'],
  'dom13b9':  ['dim_hw','phryg_dom'],
  'dom13s9':  ['dim_hw','altered'],
  'dom7b5b9': ['altered','dim_hw'],
  'dom7b5s9': ['altered','dim_hw'],
  'dom7s5b9': ['altered','whole_tone'],
  'dom7s5s9': ['altered'],
  'dom7b5':   ['whole_tone','lydian_dom','altered'],
  'dom7s5':   ['whole_tone','altered'],
  'add9':     ['ionian','lydian','maj_pent'],
  'minAdd9':  ['dorian','aeolian','min_pent'],
  'dimMaj7':  ['harm_min','dim_wh'],
};





export const PATTERNS: Record<string, { name: string; iv: number[]; roles: string[] }> = {
  'maj':      { name: 'Major',    iv: [0, 2, 4, 7], roles: ['R', '2', '3', '5'] },
  'min':      { name: 'Minor',    iv: [0, 3, 5, 7], roles: ['R', 'b3', '4', '5'] },
  'min_2':    { name: 'Min 2',    iv: [0, 2, 3, 7], roles: ['R', '2', 'b3', '5'] },
  'dim_4':    { name: 'Dim 4',    iv: [0, 3, 4, 6], roles: ['R', 'b3', 'b4', 'b5'] },
  'min_b5':   { name: 'Minor ♭5', iv: [0, 3, 5, 6], roles: ['R', 'b3', '4', 'b5'] },
  'maj_b5':   { name: 'Major ♭5', iv: [0, 2, 4, 6], roles: ['R', '2', '3', 'b5'] },
  'maj_b2':   { name: 'Major ♭2', iv: [0, 1, 4, 7], roles: ['R', 'b2', '3', '5'] },
  'maj_s2':   { name: 'Major ♯2', iv: [0, 3, 4, 7], roles: ['R', '#2', '3', '5'] },
  'lydian':   { name: 'Lydian',   iv: [0, 2, 6, 7], roles: ['R', '2', '#4', '5'] },
  'altered':  { name: 'Altered',  iv: [0, 1, 3, 6], roles: ['R', 'b2', 'b3', 'b5'] },
  'harm_min': { name: 'Harm Min', iv: [0, 2, 3, 8], roles: ['R', '2', 'b3', '#5'] },
  'sus4':     { name: 'Sus 4',    iv: [0, 2, 5, 7], roles: ['R', '2', '4', '5'] },
  'sus2':     { name: 'Sus 2',    iv: [0, 2, 7, 9], roles: ['R', '2', '5', '6'] },
  'aug':      { name: 'Aug',      iv: [0, 2, 4, 8], roles: ['R', '2', '3', '#5'] }
};

export const CHORD_PATTERN_MAP: Record<string, { pattern: string; offset: number; label: string }[]> = {
  // Basic Triads
  'maj': [{ pattern: 'maj', offset: 0, label: 'Root Pattern (Maj)' }],
  'min': [{ pattern: 'min', offset: 0, label: 'Root Pattern (Min)' }],
  'aug': [{ pattern: 'aug', offset: 0, label: 'Root Pattern (Aug)' }],
  'dim': [{ pattern: 'dim_4', offset: 0, label: 'Root Pattern (Dim)' }],
  'sus4': [{ pattern: 'sus4', offset: 0, label: 'Root Pattern (Sus4)' }],
  'sus2': [{ pattern: 'sus2', offset: 0, label: 'Root Pattern (Sus2)' }],
  'maj_b5': [{ pattern: 'maj_b5', offset: 0, label: 'Root Pattern (Maj ♭5)' }],

  // Major Family
  'maj7': [{ pattern: 'maj', offset: 0, label: 'Root Pattern (Maj)' }, { pattern: 'min', offset: 4, label: 'from 3rd (Min)' }],
  'maj9': [{ pattern: 'maj', offset: 0, label: 'Root Pattern (Maj)' }, { pattern: 'min', offset: 4, label: 'from 3rd (Min)' }],
  'maj11': [{ pattern: 'maj', offset: 0, label: 'Root Pattern (Maj)' }, { pattern: 'min', offset: 4, label: 'from 3rd (Min)' }],
  'maj13': [{ pattern: 'maj', offset: 0, label: 'Root Pattern (Maj)' }, { pattern: 'min', offset: 4, label: 'from 3rd (Min)' }, { pattern: 'sus2', offset: 2, label: 'from 2nd (Sus2)' }],
  'maj6': [{ pattern: 'maj', offset: 0, label: 'Root Pattern (Maj)' }, { pattern: 'min', offset: 4, label: 'from 3rd (Min)' }],
  'maj69': [{ pattern: 'maj', offset: 0, label: 'Root Pattern (Maj)' }, { pattern: 'min', offset: 4, label: 'from 3rd (Min)' }],
  'maj7s11': [{ pattern: 'lydian', offset: 0, label: 'Root Pattern (Lydian)' }, { pattern: 'min', offset: 4, label: 'from 3rd (Min)' }],
  'maj7s5': [{ pattern: 'aug', offset: 0, label: 'Root Pattern (Aug)' }, { pattern: 'min', offset: 4, label: 'from 3rd (Min)' }],

  // Minor Family
  'min7': [{ pattern: 'min', offset: 0, label: 'Root Pattern (Min)' }, { pattern: 'maj', offset: 3, label: 'from ♭3 (Maj)' }],
  'min9': [{ pattern: 'min', offset: 0, label: 'Root Pattern (Min)' }, { pattern: 'maj', offset: 3, label: 'from ♭3 (Maj)' }],
  'min11': [{ pattern: 'min', offset: 0, label: 'Root Pattern (Min)' }, { pattern: 'maj', offset: 3, label: 'from ♭3 (Maj)' }],
  'min13': [{ pattern: 'min', offset: 0, label: 'Root Pattern (Min)' }, { pattern: 'maj', offset: 3, label: 'from ♭3 (Maj)' }, { pattern: 'sus2', offset: 2, label: 'from 2nd (Sus2)' }],
  'min6': [{ pattern: 'min', offset: 0, label: 'Root Pattern (Min)' }, { pattern: 'maj', offset: 3, label: 'from ♭3 (Maj)' }],
  'min69': [{ pattern: 'min', offset: 0, label: 'Root Pattern (Min)' }, { pattern: 'maj', offset: 3, label: 'from ♭3 (Maj)' }],
  'minMaj7': [{ pattern: 'min', offset: 0, label: 'Root Pattern (Min)' }, { pattern: 'aug', offset: 3, label: 'from ♭3 (Aug)' }],
  'minMaj9': [{ pattern: 'min', offset: 0, label: 'Root Pattern (Min)' }, { pattern: 'aug', offset: 3, label: 'from ♭3 (Aug)' }],

  // Dominant Family
  'dom7': [{ pattern: 'maj', offset: 0, label: 'Root Pattern (Maj)' }, { pattern: 'min_b5', offset: 4, label: 'from 3rd (Minor ♭5)' }],
  'dom9': [{ pattern: 'maj', offset: 0, label: 'Root Pattern (Maj)' }, { pattern: 'min_b5', offset: 4, label: 'from 3rd (Minor ♭5)' }],
  'dom11': [{ pattern: 'maj', offset: 0, label: 'Root Pattern (Maj)' }, { pattern: 'min_b5', offset: 4, label: 'from 3rd (Minor ♭5)' }],
  'dom13': [{ pattern: 'maj', offset: 0, label: 'Root Pattern (Maj)' }, { pattern: 'min_b5', offset: 4, label: 'from 3rd (Minor ♭5)' }, { pattern: 'sus2', offset: 2, label: 'from 2nd (Sus2)' }],
  'dom7s11': [{ pattern: 'lydian', offset: 0, label: 'Root Pattern (Lydian)' }, { pattern: 'min_b5', offset: 4, label: 'from 3rd (Minor ♭5)' }],

  // Altered Dominants
  'dom7b9':   [{ pattern: 'maj_b2', offset: 0, label: 'Major ♭2 Shape (Root)' }, { pattern: 'dim_4', offset: 4, label: 'from 3rd (Dim 4)' }],
  'dom7s9':   [{ pattern: 'maj_s2', offset: 0, label: 'Major ♯2 Shape (Root)' }, { pattern: 'dim_4', offset: 4, label: 'from 3rd (Dim 4)' }],
  'dom7b13':  [{ pattern: 'maj_b2', offset: 0, label: 'Major ♭2 Shape (Root)' }, { pattern: 'dim_4', offset: 4, label: 'from 3rd (Dim 4)' }],
  'dom13b9':  [{ pattern: 'maj_b2', offset: 0, label: 'Major ♭2 Shape (Root)' }, { pattern: 'dim_4', offset: 4, label: 'from 3rd (Dim 4)' }],
  'dom13s9':  [{ pattern: 'maj_s2', offset: 0, label: 'Major ♯2 Shape (Root)' }, { pattern: 'dim_4', offset: 4, label: 'from 3rd (Dim 4)' }],
  'dom7alt':  [{ pattern: 'aug',     offset: 0, label: 'Aug Shape (Root)' },       { pattern: 'dim_4', offset: 4, label: 'from 3rd (Dim 4)' }],
  'dom7b5':   [{ pattern: 'maj_b5',  offset: 0, label: 'Maj ♭5 Shape (Root)' },    { pattern: 'min_b5', offset: 4, label: 'from 3rd (Minor ♭5)' }],
  'dom7s5':   [{ pattern: 'aug',     offset: 0, label: 'Aug Shape (Root)' },       { pattern: 'harm_min', offset: 0, label: 'Harm Min Shape (Root)' }],
  'dom7b5b9': [{ pattern: 'altered', offset: 0, label: 'Altered Shape (Root)' },   { pattern: 'dim_4', offset: 4, label: 'from 3rd (Dim 4)' }],
  'dom7b5s9': [{ pattern: 'altered', offset: 0, label: 'Altered Shape (Root)' },   { pattern: 'dim_4', offset: 4, label: 'from 3rd (Dim 4)' }],
  'dom7s5b9': [{ pattern: 'aug',     offset: 0, label: 'Aug Shape (Root)' },       { pattern: 'dim_4', offset: 4, label: 'from 3rd (Dim 4)' }],
  'dom7s5s9': [{ pattern: 'aug',     offset: 0, label: 'Aug Shape (Root)' },       { pattern: 'dim_4', offset: 4, label: 'from 3rd (Dim 4)' }],

  // Half-Diminished & Diminished
  'hdim7': [{ pattern: 'min_b5', offset: 0, label: 'Root Pattern (Minor ♭5)' }, { pattern: 'min_2', offset: 3, label: 'from ♭3 (Min 2)' }],
  'fdim7': [{ pattern: 'dim_4', offset: 0, label: 'Root Pattern (Dim 4)' }, { pattern: 'dim_4', offset: 3, label: 'from ♭3 (Dim 4)' }],

  // Sus Extensions
  'dom7sus4': [{ pattern: 'sus4', offset: 0, label: 'Root Pattern (Sus4)' }, { pattern: 'min', offset: 2, label: 'from 2nd (Min)' }],
  'dom9sus4': [{ pattern: 'sus4', offset: 0, label: 'Root Pattern (Sus4)' }, { pattern: 'min', offset: 2, label: 'from 2nd (Min)' }],
  'dom13sus4': [{ pattern: 'sus4', offset: 0, label: 'Root Pattern (Sus4)' }, { pattern: 'min', offset: 2, label: 'from 2nd (Min)' }],

  // Add Chords (in 9th Chords category)
  'add9':    [{ pattern: 'maj', offset: 0, label: 'Root Pattern (Maj)' }],
  'minAdd9': [{ pattern: 'min', offset: 0, label: 'Root Pattern (Min)' }],
  'dimMaj7': [{ pattern: 'dim_4', offset: 0, label: 'Root Pattern (Dim 4)' }]
};

export function getChordNotes(rootSemi: number, type: string, octave?: number, instrument: 'piano' | 'guitar' = 'piano'): number[] {
  const ch = CH[type];
  if (!ch) return [];
  const activeOctave = octave ?? (instrument === 'guitar' ? 1 : 4);
  const base = 12 * (instrument === 'piano' ? activeOctave + 1 : activeOctave) + rootSemi;
  // Build notes in order R 3 5 7 9 11 13
  // Keep each note above the previous (no octave wrapping down)
  const notes: number[] = [];
  let prev = base;
  ch.iv.forEach(iv => {
    let note = base + iv;
    // If this interval is lower than previous note, push up an octave
    while (note < prev) note += 12;
    notes.push(note);
    prev = note;
  });
  return notes;
}

export function getRandomChord(activeTypes: string[]): {type: string, rootSemi: number} {
  const type = activeTypes[Math.floor(Math.random() * activeTypes.length)];
  const rootSemi = Math.floor(Math.random() * 12);
  return { type, rootSemi };
}

// ── Interval spelling ─────────────────────────────────────────────────────────
export const LETTERS = ['C','D','E','F','G','A','B'];
export const LETTER_SEMI = [0, 2, 4, 5, 7, 9, 11];

function accStr(acc: number): string {
  if (acc === 0)  return '';
  if (acc === 1)  return '♯';
  if (acc === -1) return '♭';
  if (acc === 2)  return '♯♯';  // double sharp
  if (acc === -2) return '♭♭';  // double flat
  return acc > 0 ? '♯'.repeat(acc) : '♭'.repeat(-acc);
}

export function spellInterval(rootSemi: number, formula: string, useFlat = false): string {
  if (!formula) return '';
  const rootNoteName = useFlat ? NOTE_FLAT[rootSemi % 12] : NOTE_SHARP[rootSemi % 12];

  if (formula === '1' || formula === 'R' || formula === 'root') {
    return rootNoteName;
  }

  const match = formula.match(/^([#b]*)(\d+)$/);
  if (!match) return formula;

  const accidentals = match[1] ?? '';
  const degree = parseInt(match[2], 10);
  const steps = degree - 1;

  const intervalMap: Record<number, number> = { 1:0, 2:2, 3:4, 4:5, 5:7, 6:9, 7:11, 8:12, 9:14, 10:16, 11:17, 12:19, 13:21 };
  let accOffset = 0;
  for (const ch of accidentals) {
    if (ch === '#') accOffset++;
    else if (ch === 'b') accOffset--;
  }

  const targetSemitone = (rootSemi + (intervalMap[degree] ?? 0) + accOffset) % 12;
  
  // Determine base letter index of the exact ROOT note!
  const rootLetter = rootNoteName[0];
  const rootLetterIdx = LETTERS.indexOf(rootLetter);

  const targetLetterIdx = (rootLetterIdx + steps) % 7;
  const letterBasePc = LETTER_SEMI[targetLetterIdx];

  let diff = (targetSemitone - letterBasePc + 12) % 12;
  if (diff > 6) diff -= 12; 

  return LETTERS[targetLetterIdx] + accStr(diff);
}

export function getChordIntervals(type: string): number[] {
  return CH[type]?.iv || [0, 4, 7];
}

export function formatDegree(f: string): string {
  return (f || '')
    .replace(/(rd|th|nd|st)/g, '')
    .replace(/bb/g, '♭♭')
    .replace(/b/g, '♭')
    .replace(/#/g, '♯');
}

export const ROLE_SHORT: Record<string, string> = {
  'root':'1','3rd':'3','5th':'5','7th':'7', '9th':'9','11th':'11','13th':'13',
  '4th':'4','6th':'6','2nd':'2',
  'b2nd':'b2', '#2nd':'#2', 'b3rd':'b3', '#3rd':'#3',
  'b4th':'b4', '#4th':'#4', 'b5th':'b5', '#5th':'#5',
  'b6th':'b6', '#6th':'#6', 'b7th':'b7', 'bb7th':'bb7', '#7th':'#7',
  'b9th':'b9', '#9th':'#9', 'b11th':'b11', '#11th':'#11',
  'b13th':'b13', '#13th':'#13'
};

export function getGlobalLabel(
  labelMode: 'degrees' | 'notes' | 'none',
  namingMode: 'sharp' | 'flat',
  rootSemi: number | undefined,
  formula: string | undefined,
  role: string | undefined,
  midi: number,
  noteName?: string
): string {
  if (labelMode === 'none') return '';
  const effectiveFormula = formula || (role ? (ROLE_SHORT[role] || role) : '');
  if (labelMode === 'notes') {
    if (effectiveFormula && rootSemi !== undefined) {
      return spellInterval(rootSemi, effectiveFormula, namingMode === 'flat');
    }
    return noteName || (namingMode === 'flat' ? NOTE_FLAT[midi % 12] : NOTE_SHARP[midi % 12]);
  }
  return formatDegree(effectiveFormula);
}

export function getBassLineMidi(rootSemi: number, chordType: string, nextRootSemi: number, beats: number, bassOctave: number = 3): number[] {
  // 1. Establish the Root in a solid, low register
  let baseMidi = 12 * bassOctave + rootSemi; 
  if (baseMidi > 47) baseMidi -= 12; // Keep it in C2–B2 range (MIDI 36–47)

  const ch = CH[chordType];
  const iv = ch?.iv || [0, 4, 7];
  const thirdSemi = iv.length > 1 ? iv[1] : 4; 
  const fifthSemi = iv.length > 2 ? iv[2] : 7;

  const line: number[] = [];
  line.push(baseMidi); // Beat 1: Root

  // 2. Find the smoothest path to the NEXT chord's root
  let targetMidi = 12 * bassOctave + nextRootSemi;
  if (targetMidi > 47) targetMidi -= 12;
  
  // Voice Leading: prevent massive jumps between measures
  if (targetMidi - baseMidi > 7) targetMidi -= 12;
  if (targetMidi - baseMidi < -7) targetMidi += 12;

  // 3. Build the line based on measure length
  if (beats === 2) {
    // 2 Beats: Root -> Chromatic Approach
    const approach = targetMidi > baseMidi ? targetMidi - 1 : targetMidi + 1;
    line.push(approach);
  } else if (beats === 4) {
    // 4 Beats: Root -> 3rd -> 5th -> Chromatic Approach
    line.push(baseMidi + thirdSemi); 
    line.push(baseMidi + fifthSemi); 
    const approach = targetMidi > (baseMidi + fifthSemi) ? targetMidi - 1 : targetMidi + 1;
    line.push(approach);
  } else if (beats === 3) {
     line.push(baseMidi + thirdSemi);
     line.push(baseMidi + fifthSemi);
  } else {
     for (let i = 1; i < beats; i++) line.push(baseMidi);
  }

  return line;
}
