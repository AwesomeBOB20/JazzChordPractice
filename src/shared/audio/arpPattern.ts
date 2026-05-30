export const ARP_SLOTS = 8;

export function buildArpPattern(midiNotes: number[], slots: number = ARP_SLOTS): number[] {
  const clean = midiNotes.filter(n => n != null && !isNaN(n as number));
  if (!clean.length) return [];
  const out: number[] = [];
  for (let i = 0; i < slots; i++) out.push(clean[i % clean.length]);
  return out;
}
