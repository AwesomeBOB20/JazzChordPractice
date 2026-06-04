export interface ProgressionChord {
  rootSemi: number;
  chordType: string;
  namingMode: 'sharp' | 'flat';
  repeatStart?: boolean;
  repeatEnd?: boolean;
  volta?: 1 | 2;
  section?: boolean; // rehearsal-section marker; displayed letter (A, B, C…) is derived by position
  spacer?: boolean;  // indent padding: occupies a grid cell but is NOT a measure (renders as empty background, skipped by playback)
  beats?: 2 | 3 | 4; 
  intervals?: number[];
  selectedBoxName?: string;
  selectedScaleId?: string;
}

export interface SavedSong {
  id: string;
  name: string;
  progression: (ProgressionChord | null)[];
  bpm: number;
  rhythm: string;
  category?: string; // library category bucket; defaults to 'Songs' when unset
}

export interface UnifiedVoicing {
  name: string;
  chordLabel: string;
  notes: number[];
  roles: string[];
  formulas: string[];
  
  // Optional Guitar-specific fields (we will wire these up later)
  frets?: { stringIdx?: number; fret: number | null; role?: string; formula?: string }[];
  fingerprint?: string;
  categoryId?: string; // scale ID, arp label, interval name, or shape box name for quiz answer
}