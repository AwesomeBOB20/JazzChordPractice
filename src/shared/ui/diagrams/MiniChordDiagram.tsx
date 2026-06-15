import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Line, Circle, Text as SvgText, G } from 'react-native-svg';
import { ROLE_COLORS_GLOBAL, getNoteColor } from '@shared/ui/themes';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { getGlobalLabel, GUITAR_TUNING } from '@shared/theory/musicTheory';
import { familyForWeight } from '@shared/fonts/fonts';

interface Props {
  voicing?: any;
  arpShape?: any; // a ScaleVoicing (CAGED arp box) with notes: ScaleNote[] — shown in ARPS view
  theme: any;
  isMasked?: boolean;
  scale?: number; // visual size multiplier (default 1 = compact, as the progression grid uses)
  fitWidth?: number;  // when set, scale to fill this width (contained); overrides `scale`
  fitHeight?: number; // when set, also bound by this height so the grip never spills its box
  // When labelMode is set (and not 'none'), each note shows its degree / note name on
  // the dot, following the global label preference. Omitted → no labels (progression grid).
  labelMode?: 'degrees' | 'notes' | 'none';
  namingMode?: 'sharp' | 'flat';
  rootSemi?: number; // root the notes are spelled against (omit for the "any root" movable grips)
}

// Natural unscaled footprint (px) of the diagram for a given grip — the fret-window
// math mirrors the component below. The dictionary grid uses this to size every cell
// in a row to its tallest diagram (like the progression screen's diagramCellHeight).
export function miniChordFootprint(voicing?: any, arpShape?: any): { w: number; h: number } {
  const shape = arpShape && arpShape.notes ? arpShape : null;
  let activeFrets: number[] = [];
  if (shape) activeFrets = shape.notes.map((n: any) => n.fret).filter((f: number) => f !== null && f > 0);
  else if (voicing && voicing.frets) activeFrets = voicing.frets.map((f: any) => f?.fret).filter((f: any) => f !== null && f > 0);
  const minF = activeFrets.length ? Math.min(...activeFrets) : 1;
  const maxF = activeFrets.length ? Math.max(...activeFrets) : 4;
  let startF = minF <= 1 ? 0 : minF - 1;
  if (maxF <= 4) startF = 0;
  const numFrets = Math.max(4, maxF - startF);
  const W = 46, dotR = 4, topY = 8;
  const H = 46 + (numFrets > 4 ? (numFrets - 4) * 10 : 0);
  const numGutter = startF > 0 ? 11 : 0; // approx width of the fret-number label
  return { w: numGutter + (W + dotR * 2), h: H + dotR * 2 + topY };
}

function MiniChordDiagram({ voicing, arpShape, theme, isMasked, scale, fitWidth, fitHeight, labelMode, namingMode, rootSemi }: Props) {
  const colorMode = useSettingsStore((s: any) => s.colorMode);
  const selectiveRoles = useSettingsStore((s: any) => s.selectiveRoles);
  const storeFontFamily = useSettingsStore((s: any) => s.fontFamily);
  const svgFont = familyForWeight(storeFontFamily, '700');
  const showLabels = !!labelMode && labelMode !== 'none';

  // ARPS view renders the CAGED arp box (multiple notes per string); otherwise the block
  // chord voicing (one fret per string). Arp box takes priority when present.
  const shape = arpShape && arpShape.notes ? arpShape : null;
  if (!shape && !voicing) {
    return (
      <View style={{ height: 40, justifyContent: 'center' }}>
        <Text style={{ color: theme.txt3, fontSize: 9 }}>No Shape</Text>
      </View>
    );
  }

  let activeFrets: number[] = [];
  if (shape) {
    activeFrets = shape.notes.map((n: any) => n.fret).filter((f: number) => f !== null && f > 0);
  } else if (voicing && voicing.frets) {
    activeFrets = voicing.frets.map((f: any) => f?.fret).filter((f: any) => f !== null && f > 0);
  }

  const minF = activeFrets.length ? Math.min(...activeFrets) : 1;
  const maxF = activeFrets.length ? Math.max(...activeFrets) : 4;

  let startF = minF <= 1 ? 0 : minF - 1;
  if (maxF <= 4) {
    startF = 0;
  }

  const numFrets = Math.max(4, maxF - startF);

  const W = 46;
  const H = 46 + (numFrets > 4 ? (numFrets - 4) * 10 : 0);
  const strSpc = W / 5;
  const fretSpc = H / numFrets;
  const dotR = 4;
  const topY = 8; // Extra space at the top for X and O labels

  // Extra horizontal breathing room (viewBox units) so the outermost string's note dots
  // — which are radius `dotR` and sit `dotR` from the grid edge — don't kiss the viewBox
  // boundary and get their outer pixel shaved off. Only in fit mode (the dictionary's big
  // diagrams); the compact progression grid is intentionally tight, so keep its math untouched.
  const fitMode = fitWidth != null || fitHeight != null;
  const padX = fitMode ? 3 : 0;

  // Effective scale: when a fit box is given, scale to fill it (contained, so the grip
  // never spills past the cell edges); otherwise use the explicit `scale` (default 1).
  const baseW = (startF > 0 ? 11 : 0) + (W + dotR * 2 + padX * 2);
  const baseH = H + dotR * 2 + topY;
  const s = fitMode
    ? Math.min(fitWidth != null ? fitWidth / baseW : Infinity, fitHeight != null ? fitHeight / baseH : Infinity)
    : (scale ?? 1);

  // Open-string ring stroke. SVG stroke is in viewBox units, so a fixed value gets heavy as the
  // diagram scales up (the dictionary's big grids). Dividing by `s` keeps it ~2.6 screen-px at ANY
  // size — an even outline. The stroke is centred on the radius, so a ring drawn at
  // r = dotR − openRingSW/2 has its OUTER edge exactly on the fretted-dot radius (same overall size).
  const openRingSW = 2.6 / s;

  // The negative margins below "tighten" the compact progression grid by trimming the
  // viewBox's dot padding. They scale with `s`, so in fit-to-box mode (the dictionary)
  // they'd yank a large diagram up/left out of its cell and over the badge — keep the
  // diagram fully contained there instead.
  const tighten = !fitMode;

  // Fret-position number: render it inside a box exactly one fret-space tall, anchored to the TOP of
  // the first fret space (the nut line at SVG y = topY+dotR, offset by the SVG view's own margin), then
  // flex-centre the glyph in it. This lands the number dead-centre on the space it labels without the
  // old font-metric fudge (the SVG view shifts up by dotR*s in compact/tighten mode, so subtract it).
  const fretNumBoxTop = (tighten ? topY : topY + dotR) * s;

  // Fret-number horizontal nudge: pull it LEFT in the compact progression grid, but push it RIGHT
  // (toward the grid) in the dictionary's larger fit-mode diagrams. Scales with `s` so the offset
  // stays proportional at any diagram size. Positive = right, negative = left.
  const fretNumShiftX = (fitMode ? 1 : -3) * s;

  // In-circle labels are rendered as flexbox-centred RN <Text> overlaid on the SVG rather
  // than as SVG <Text>: react-native-svg's baseline centring (alignmentBaseline) is not
  // honoured on Android and shifts with the font's own ascent/descent metrics, so the glyph
  // never sits dead-centre. An overlaid View lets RN measure and centre the glyph box exactly
  // — the same approach the main fretboard's dots use. We collect them here, then position
  // each over its dot using the SVG's viewBox→screen mapping below.
  type LabelMark = { key: string; cx: number; cy: number; text: string; color: string; fontUnits: number };
  const labelMarks: LabelMark[] = [];
  if (showLabels) {
    if (shape) {
      shape.notes.forEach((note: any, i: number) => {
        if (note.fret === null) return;
        const relFret = note.fret - startF;
        if (note.fret !== 0 && (relFret < 1 || relFret > numFrets)) return;
        const color = isMasked ? theme.accent : getNoteColor(note.role === '1' ? 'R' : note.role, colorMode, theme, selectiveRoles);
        const text = getGlobalLabel(labelMode!, namingMode || 'sharp', rootSemi, note.formula, note.role, GUITAR_TUNING[note.stringIdx] + note.fret, note.noteName);
        if (!text) return;
        const cx = dotR + note.stringIdx * strSpc;
        if (note.fret === 0) labelMarks.push({ key: `lo-${i}`, cx, cy: topY - 1, text, color, fontUnits: dotR * 0.95 });
        else labelMarks.push({ key: `lf-${i}`, cx, cy: topY + dotR + (relFret - 0.5) * fretSpc, text, color: '#fff', fontUnits: dotR * 1.05 });
      });
    } else if (voicing && voicing.frets) {
      voicing.frets.forEach((f: any, i: number) => {
        if (!f || f.fret === null) return;
        const relFret = f.fret - startF;
        if (f.fret !== 0 && (relFret < 1 || relFret > numFrets)) return;
        const color = isMasked ? theme.accent : getNoteColor(f.role === '1' ? 'R' : f.role, colorMode, theme, selectiveRoles);
        const text = getGlobalLabel(labelMode!, namingMode || 'sharp', rootSemi, undefined, f.role, GUITAR_TUNING[i] + f.fret, undefined);
        if (!text) return;
        const cx = dotR + i * strSpc;
        if (f.fret === 0) labelMarks.push({ key: `vo-${i}`, cx, cy: topY - 1, text, color, fontUnits: dotR * 0.95 });
        else labelMarks.push({ key: `vf-${i}`, cx, cy: topY + dotR + (relFret - 0.5) * fretSpc, text, color: '#fff', fontUnits: dotR * 1.05 });
      });
    }
  }

  // SVG box in screen px + viewBox→screen mapping (uniform scale `s`; viewBox minX = -padX).
  const svgW = (W + dotR * 2 + padX * 2) * s;
  const svgH = (H + dotR * 2 + topY) * s;
  const screenX = (x: number) => (x + padX) * s;
  const screenY = (y: number) => y * s;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 2, marginTop: tighten ? -4 : 0, overflow: 'visible' }}>
      {startF > 0 && (
        // Box is exactly one fret-space tall and flex-centres the digit, landing it dead-centre on the
        // space it labels. includeFontPadding:false + textAlignVertical:center strip Android's
        // asymmetric line padding (which otherwise floats the glyph off the space's centre).
        <View style={{ height: fretSpc * s, marginTop: fretNumBoxTop, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: theme.txt2, fontSize: 9 * s, fontWeight: '800', includeFontPadding: false, textAlignVertical: 'center', textAlign: 'center', transform: [{ translateX: fretNumShiftX }] }}>
            {startF + 1}
          </Text>
        </View>
      )}
      <View style={{ position: 'relative', width: svgW, height: svgH, marginLeft: tighten ? -dotR * s : 0, marginTop: tighten ? -dotR * s : 0, overflow: 'visible' }}>
        <Svg key={`svg-${numFrets}-${startF}`} width={svgW} height={svgH} viewBox={`${-padX} 0 ${W + dotR*2 + padX*2} ${H + dotR*2 + topY}`}>
          {Array.from({ length: numFrets + 1 }).map((_, i) => (
            <Line
              key={`f-${i}`}
              x1={dotR - 0.5} y1={topY + dotR + i * fretSpc}
              x2={dotR + W + 0.5} y2={topY + dotR + i * fretSpc}
              stroke={theme.txt3}
              strokeWidth={startF === 0 && i === 0 ? 2 : 1}
            />
          ))}
          {[0,1,2,3,4,5].map(i => (
            <Line
              key={`s-${i}`}
              x1={dotR + i * strSpc} y1={topY + dotR}
              x2={dotR + i * strSpc} y2={topY + dotR + H}
              stroke={theme.txt3}
              strokeWidth={1}
            />
          ))}

          {/* ── ARPS view: every note of the CAGED arp box (can be multiple per string) ── */}
          {shape && [0,1,2,3,4,5].map((strIdx) => {
            const hasNotes = shape.notes.some((n: any) => n.stringIdx === strIdx && n.fret !== null);
            if (!hasNotes) {
              return <SvgText key={`mut-s-${strIdx}`} x={dotR + strIdx * strSpc} y={topY + 1.8} fill={theme.txt3} fontSize={8} textAnchor="middle" fontWeight="bold" fontFamily={svgFont}>×</SvgText>;
            }
            return null;
          })}
          {shape && shape.notes.map((note: any, i: number) => {
            if (note.fret === null) return null;

            const color = isMasked
              ? theme.accent
              : getNoteColor(note.role === '1' ? 'R' : note.role, colorMode, theme, selectiveRoles);

            if (note.fret === 0) {
              const cxO = dotR + note.stringIdx * strSpc;
              // Outer edge (r + sw/2) = fretted dot radius (dotR*0.85) → same overall size; thin stroke.
              return <Circle key={`shape-open-${i}`} cx={cxO} cy={topY - 1} r={dotR * 0.85 - openRingSW / 2} fill="transparent" stroke={color} strokeWidth={openRingSW} />;
            }

            const relFret = note.fret - startF;
            if (relFret < 1 || relFret > numFrets) return null;
            const cx = dotR + note.stringIdx * strSpc;
            const cy = topY + dotR + (relFret - 0.5) * fretSpc;

            return <Circle key={`shape-${i}`} cx={cx} cy={cy} r={dotR * 0.85} fill={color} opacity={0.9} />;
          })}

          {/* ── CHORDS view: the block chord voicing (one fret per string) ── */}
          {!shape && voicing && voicing.frets.map((f: any, i: number) => {
            if (!f || f.fret === null) {
                return <SvgText key={`mut-v-${i}`} x={dotR + i * strSpc} y={topY + 1.8} fill={theme.txt3} fontSize={8} textAnchor="middle" fontWeight="bold" fontFamily={svgFont}>×</SvgText>;
            }

            const color = isMasked
              ? theme.accent
              : getNoteColor(f.role === '1' ? 'R' : f.role, colorMode, theme, selectiveRoles);

            if (f.fret === 0) {
              const cxO = dotR + i * strSpc;
              // Outer edge (r + sw/2) = fretted dot radius (dotR) → same overall size; thin even stroke.
              return <Circle key={`v-open-${i}`} cx={cxO} cy={topY - 1} r={dotR - openRingSW / 2} fill="transparent" stroke={color} strokeWidth={openRingSW} />;
            }

            const relFret = f.fret - startF;
            if (relFret < 1 || relFret > numFrets) return null;

            const cx = dotR + i * strSpc;
            const cy = topY + dotR + (relFret - 0.5) * fretSpc;

            return <Circle key={`d-${i}`} cx={cx} cy={cy} r={dotR} fill={color} />;
          })}
        </Svg>

        {/* Flexbox-centred labels overlaid on each dot — see LabelMark note above. This mirrors the
            main fretboard's centred dot labels (FretboardView) EXACTLY, because those read as centred:
            • the label box is centred on the dot's true (sub-pixel) screen position — NOT rounded to
              the pixel grid; rounding shifts the glyph up to ½px off the SVG circle it sits on.
            • plain flex-centring (alignItems+justifyContent), no includeFontPadding/lineHeight/
              textAlignVertical overrides — those tighten or skew the line box on Android and float
              the glyph off-centre. The only Android-safe extra is the font handling below. */}
        {labelMarks.map(m => {
          const box = Math.max(10, m.fontUnits * s * 2.6);
          return (
            <View
              key={m.key}
              pointerEvents="none"
              style={{ position: 'absolute', left: screenX(m.cx) - box / 2, top: screenY(m.cy) - box / 2, width: box, height: box, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text
                numberOfLines={1}
                style={{ color: m.color, fontSize: m.fontUnits * s, fontFamily: svgFont, fontWeight: svgFont ? 'normal' : 'bold', textAlign: 'center' }}
              >
                {m.text}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// Memoized: the progression grid re-renders on every measure highlight change, but a
// diagram's inputs (voicing/arpShape come from memoized arrays, theme is stable) don't
// change then — so this SVG bails out instead of re-rendering for every cell, keeping
// the highlight border switch fast enough to land on the downbeat.
export default React.memo(MiniChordDiagram);
