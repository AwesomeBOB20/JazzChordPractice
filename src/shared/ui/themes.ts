export interface Theme {
  name: string;
  bg: string;
  bg2: string;
  bg3: string;
  accent: string;
  accent2: string;
  txt1: string;
  txt2: string;
  txt3: string;
  border: string;
  tabBar: string;
  tabBorder: string;
  dotFrom: string;
  dotTo: string;
  playBtn: string;
  stopBtn: string;
  mutedNote: string;
}

export const THEMES: Record<string, Theme> = {
  light: {
    name: 'Light',
    bg: '#F5F3EF',
    bg2: '#FFFFFF',
    bg3: '#EBE7E0',
    accent: '#D85A30',
    accent2: '#E07040',
    txt1: '#1C1A17',
    txt2: '#544E46',
    txt3: '#8A8275',
    border: '#DCD6CC',
    tabBar: '#FFFFFF',
    tabBorder: '#DCD6CC',
    dotFrom: '#F5F3EF',
    dotTo: '#DCD6CC',
    playBtn: '#639922',
    stopBtn: '#D4537E',
    mutedNote: '#DCD6CC',
  },
  frost: {
    name: 'Frost',
    bg: '#EAF2F8',
    bg2: '#FFFFFF',
    bg3: '#DDE8F0',
    accent: '#378ADD',
    accent2: '#5AA0EE',
    txt1: '#0B1B2E',
    txt2: '#3D5A7A',
    txt3: '#6B87A3',
    border: '#B3CDE0',
    tabBar: '#FFFFFF',
    tabBorder: '#B3CDE0',
    dotFrom: '#EAF2F8',
    dotTo: '#B3CDE0',
    playBtn: '#639922',
    stopBtn: '#D4537E',
    mutedNote: '#B3CDE0',
  },
  sage: {
    name: 'Sage',
    bg: '#EBF2ED',
    bg2: '#FFFFFF',
    bg3: '#DEE8E0',
    accent: '#639922',
    accent2: '#7DB838',
    txt1: '#0F2412',
    txt2: '#426346',
    txt3: '#728F75',
    border: '#B8D1BE',
    tabBar: '#FFFFFF',
    tabBorder: '#B8D1BE',
    dotFrom: '#EBF2ED',
    dotTo: '#B8D1BE',
    playBtn: '#639922',
    stopBtn: '#D4537E',
    mutedNote: '#B8D1BE',
  },
  latte: {
    name: 'Latte',
    bg: '#F7ECE4',
    bg2: '#FFFFFF',
    bg3: '#EFE0D5',
    accent: '#BA7517',
    accent2: '#D68F29',
    txt1: '#26160A',
    txt2: '#66452C',
    txt3: '#997050',
    border: '#DBC2AE',
    tabBar: '#FFFFFF',
    tabBorder: '#DBC2AE',
    dotFrom: '#F7ECE4',
    dotTo: '#DBC2AE',
    playBtn: '#639922',
    stopBtn: '#D4537E',
    mutedNote: '#DBC2AE',
  },
  dark: {
    name: 'Dark',
    bg: '#151412',
    bg2: '#211F1D',
    bg3: '#2C2926',
    accent: '#D85A30',
    accent2: '#E07040',
    txt1: '#F2EFE9',
    txt2: '#AFA99F',
    txt3: '#7A756C',
    border: '#3A3631',
    tabBar: '#211F1D',
    tabBorder: '#3A3631',
    dotFrom: '#151412',
    dotTo: '#3A3631',
    playBtn: '#639922',
    stopBtn: '#D4537E',
    mutedNote: '#3A3631',
  },
  ocean: {
    name: 'Ocean',
    bg: '#081018',
    bg2: '#101B26',
    bg3: '#182738',
    accent: '#378ADD',
    accent2: '#5AA0EE',
    txt1: '#E0F0FA',
    txt2: '#8CB9D6',
    txt3: '#5A86A8',
    border: '#20344A',
    tabBar: '#101B26',
    tabBorder: '#20344A',
    dotFrom: '#081018',
    dotTo: '#20344A',
    playBtn: '#639922',
    stopBtn: '#D4537E',
    mutedNote: '#20344A',
  },
  forest: {
    name: 'Forest',
    bg: '#0A140C',
    bg2: '#142417',
    bg3: '#1F3323',
    accent: '#639922',
    accent2: '#7DB838',
    txt1: '#E6F2E6',
    txt2: '#97B89B',
    txt3: '#638568',
    border: '#29452E',
    tabBar: '#142417',
    tabBorder: '#29452E',
    dotFrom: '#0A140C',
    dotTo: '#29452E',
    playBtn: '#639922',
    stopBtn: '#D4537E',
    mutedNote: '#29452E',
  },
  espresso: {
    name: 'Espresso',
    bg: '#17100D',
    bg2: '#241813',
    bg3: '#33221B',
    accent: '#BA7517',
    accent2: '#D68F29',
    txt1: '#F2E6D8',
    txt2: '#BD9D82',
    txt3: '#8F6F54',
    border: '#422D23',
    tabBar: '#241813',
    tabBorder: '#422D23',
    dotFrom: '#17100D',
    dotTo: '#422D23',
    playBtn: '#639922',
    stopBtn: '#D4537E',
    mutedNote: '#422D23',
  },
};

export const DEFAULT_THEME = 'light';

export const ROLE_COLORS_GLOBAL: Record<string, string> = {
  'root': '#D95D39', 'R': '#D95D39',
  '2nd': '#857AEE', '2': '#857AEE', 'b2': '#857AEE', '#2': '#857AEE',
  '3rd': '#3D94ED', '3': '#3D94ED', 'b3': '#3D94ED',
  '4th': '#20A67B', '4': '#20A67B', 'b4': '#20A67B', '#4': '#20A67B',
  '5th': '#5E9E26', '5': '#5E9E26', 'b5': '#5E9E26', '#5': '#5E9E26',
  '6th': '#C9456B', '6': '#C9456B', 'b6': '#C9456B',
  '7th': '#C97D22', '7': '#C97D22', 'b7': '#C97D22', 'bb7': '#C97D22',
  '9th': '#857AEE', '9': '#857AEE', 'b9': '#857AEE', '#9': '#857AEE',
  '11th': '#20A67B', '11': '#20A67B', '#11': '#20A67B',
  '13th': '#C9456B', '13': '#C9456B', 'b13': '#C9456B', '#13': '#C9456B',
};

export const getNoteBaseRole = (role: string): string => {
  if (!role) return '';
  const lower = role.toLowerCase();
  if (lower === 'root' || lower === 'r') return 'root';
  const match = lower.match(/\d+/);
  if (match) {
    const num = match[0];
    if (num === '9') return '2';
    if (num === '11') return '4';
    if (num === '13') return '6';
    return num;
  }
  return lower;
};

export const getNoteColor = (
  role: string,
  colorMode: 'roles' | 'theme' | 'selective',
  currentTheme: Theme,
  selectiveRoles: string[]
): string => {
  if (colorMode === 'theme') return currentTheme.accent;

  if (colorMode === 'selective') {
    if (!role) return currentTheme.mutedNote;
    const baseRole = getNoteBaseRole(role);
    const isSelected = selectiveRoles.includes(baseRole);
    if (!isSelected) return currentTheme.mutedNote;
  }
  
  if (!role) return currentTheme.mutedNote;
  return ROLE_COLORS_GLOBAL[role] || currentTheme.mutedNote;
};