// build-audio.js
const fs = require('fs');
const https = require('https');

const BASE_PIANO = 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/acoustic_grand_piano-mp3/';
const BASE_GUITAR = 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/acoustic_guitar_nylon-mp3/';
const BASE_BASS = 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/acoustic_bass-mp3/';

const coreNotes = [36,40,43,45,48,52,55,57,60,64,67,69,72,76,79,81,84,88,91,93,96];
const guitarNotes = [40,43,45,47,48,50,52,55,57,59,60,62,64,67,69,71,72,76,79];
const bassNotes = [36, 40, 45, 48, 52];

function midiToNoteName(midi) {
  const notes = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const octave = Math.floor(midi / 12) - 1;
  return notes[midi % 12] + octave;
}

async function downloadAsBase64(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (resp) => {
      if (resp.statusCode !== 200) return reject(`Failed: ${resp.statusCode}`);
      const chunks = [];
      resp.on('data', (chunk) => chunks.push(chunk));
      resp.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(`data:audio/mp3;base64,${buffer.toString('base64')}`);
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('Downloading audio samples... This may take a minute.');
  const output = { piano: {}, guitar: {}, bass: {} };

  for (const midi of coreNotes) {
    const note = midiToNoteName(midi);
    console.log(`Fetching Piano: ${note}...`);
    output.piano[note] = await downloadAsBase64(`${BASE_PIANO}${note}.mp3`);
  }
  for (const midi of guitarNotes) {
    const note = midiToNoteName(midi);
    console.log(`Fetching Guitar: ${note}...`);
    output.guitar[note] = await downloadAsBase64(`${BASE_GUITAR}${note}.mp3`);
  }
  for (const midi of bassNotes) {
    const note = midiToNoteName(midi);
    console.log(`Fetching Bass: ${note}...`);
    output.bass[note] = await downloadAsBase64(`${BASE_BASS}${note}.mp3`);
  }

  const fileContent = `// Auto-generated audio assets\nexport const AUDIO_ASSETS = ${JSON.stringify(output)};\n`;
  fs.writeFileSync('./src/lib/audioAssets.ts', fileContent);
  console.log('✅ Successfully generated src/lib/audioAssets.ts');
}

run();