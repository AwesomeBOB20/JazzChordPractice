export interface ProgressionChord {
  rootSemi: number;
  chordType: string;
  namingMode: 'sharp' | 'flat';
  repeatStart?: boolean;
  repeatEnd?: boolean;
  volta?: 1 | 2;
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