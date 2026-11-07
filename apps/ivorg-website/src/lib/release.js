// Real catalogue data for IVORG Index Zero.
// Every value below traces to a field in docs/resources/content-draft.json,
// which in turn cites the artwork it was read from.
// Deliberately absent because no source states them: BPM, audio files,
// vocal-synth engine, per-track producer, Chinese album title.

export const ORG = {
  name: 'Illinois Vocaloid Research Group',
  shortName: 'IVORG',
  affiliation: 'UIUC',
  handle: 'illinois_vocaloid'
};

export const RELEASE = {
  catalogNumber: 'IVORG-0001',
  title: 'IVORG Index Zero',
  graphicTitle: 'IVORG INDEX[0]',
  // Printed on the back cover as YY.MM.DD. Not confirmed by the club as a release date.
  printedDate: '26.08.24',
  dateISO: '2026-08-24',
  dateConfirmed: false,
  format: 'CD / STEREO',
  country: 'Made in China',
  copyright: '\u2117&\u00a9 2026 IVORG / respective artists. All rights reserved.',
  credits: {
    music: ['Antistar', 'Koeri', 'MySxan', 'Vantasy'],
    voice: ['Hatsune Miku', 'Kasane Teto', 'Luo Tianyi', 'Yuezheng Ling', 'XingCheng', 'Minus', 'Shian', 'Haiyi'],
    mastering: ['Vantasy', 'Antistar'],
    artAndDesign: ['MySxan'],
    presentedBy: 'IVORG'
  },
  // resources/album/preview/Cover.jpg — the clean square cover supplied by the club.
  cover: {
    avif: '/artwork/ivorg-index-zero-cover.avif',
    webp: '/artwork/ivorg-index-zero-cover-1280.webp',
    small: '/artwork/ivorg-index-zero-cover-640.webp',
    width: 1280,
    height: 1280
  }
};

// Titles, durations and vocalists are printed on the jacket. Spelling is kept
// as printed, including 'ra1n.drops' with a numeral one and the lower-case
// 'Yue zhengling' that the credits page prints as 'Yuezheng Ling'.
export const TRACKS = [
  { n: 1, title: 'Mirror of Traces', seconds: 151, vocals: ['Hatsune Miku'] },
  { n: 2, title: 'ra1n.drops', seconds: 208, vocals: ['Stardust', 'Shian', 'Minus', 'Haiyi'] },
  { n: 3, title: 'The Zeroth Reunion', seconds: 288, vocals: ['Yue zhengling', 'Luo tianyi'] },
  { n: 4, title: 'Gnostalgic', seconds: 227, vocals: ['Haiyi'] },
  { n: 5, title: 'Minty Bloody Tears', seconds: 189, vocals: ['Hatsune Miku feat. Kasane Teto'] },
  { n: 6, title: 'Moonlight', seconds: 297, vocals: ['Stardust'] },
  { n: 7, title: 'New Journey!', seconds: 196, vocals: ['Stardust feat. Haiyi'] }
];

export const TOTAL_SECONDS = TRACKS.reduce((total, track) => total + track.seconds, 0);

export const EVENTS = [
  {
    index: 1,
    label: 'IVORG 1st Meeting',
    date: '2026-02-21',
    dateRaw: 'SAT, FEB 21, 2026',
    time: '19:00\u201321:00',
    location: 'Siebel School of Computer Science 1302',
    activities: ['Song Sharing', 'Weekly Research Topic Discussion', 'Semester Objectives Walkthrough', 'Staff Recruitment'],
    poster: '/artwork/event-1st-meeting.webp',
    color: 'red'
  },
  {
    index: 2,
    label: 'IVORG 2nd Meeting',
    date: '2026-03-07',
    dateRaw: 'SAT, MAR 7, 2026',
    time: '19:00\u201322:00',
    location: 'Siebel School of Computer Science 1302',
    activities: ['Song Sharing', 'Weekly Research Topic Discussion', 'Composition Workshop'],
    poster: '/artwork/event-2nd-meeting.webp',
    color: 'green'
  },
  {
    index: 3,
    label: 'IVORG 3rd Meeting',
    date: '2026-04-11',
    dateRaw: 'SAT, APR 11, 2026',
    time: '19:00\u201321:30',
    location: 'Lincoln Hall 1064',
    activities: ['Song Sharing', 'Weekly Research Topic Discussion', 'Composition Workshop'],
    poster: '/artwork/event-3rd-meeting.webp',
    color: 'pink'
  },
  {
    index: 4,
    label: 'IVORG 4th Meeting',
    // The poster prints only "SAT, APR, 2026". No day number, so no date.
    date: null,
    dateRaw: 'SAT, APR, 2026',
    time: '19:00\u201321:00',
    location: 'Lincoln Hall 1062',
    activities: ['Song Sharing', 'Weekly Research Topic Discussion', 'Composition Workshop'],
    poster: '/artwork/event-4th-meeting.webp',
    color: 'blue'
  }
];

export function formatDuration(seconds) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
}

// ---- Public presentation helpers -------------------------------------------
// The printed date is not a confirmed release date, so the public page shows
// the catalogue edition (year from the printed copyright line) until the club
// confirms it by setting RELEASE.dateConfirmed = true.
export function releaseDateSpec(release = RELEASE) {
  if (release.dateConfirmed && release.dateISO) return ['RELEASED', release.dateISO.replaceAll('-', '.')];
  const year = /\b(20\d\d)\b/.exec(release.copyright)?.[1];
  return ['EDITION', year ? `\u2117 ${year}` : release.catalogNumber];
}

// External listening / streaming links. Empty until the club publishes the
// release somewhere. Only https URLs are rendered; anything else is dropped.
// Example entry: { label: 'Bandcamp', url: 'https://example.bandcamp.com/album/...' }
export const LISTEN_LINKS = [];

// Licensed audio previews, keyed by track number. Files go in
// public/audio/previews/ and must be cleared for public playback.
// Example: 1: '/audio/previews/01-mirror-of-traces.mp3'
// A track without an entry renders no play control (never a dead button).
export const AUDIO_PREVIEWS = {};

export function safeExternalUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function safePreviewPath(value) {
  const text = String(value ?? '');
  return /^\/audio\/previews\/[A-Za-z0-9._-]+\.(?:mp3|m4a|ogg|opus|wav)$/.test(text) && !text.includes('..') ? text : null;
}

export function listenLinks(links = LISTEN_LINKS) {
  return links.map(link => ({ label: String(link.label || '').trim(), url: safeExternalUrl(link.url) }))
    .filter(link => link.label && link.url);
}

export function previewFor(track, previews = AUDIO_PREVIEWS) {
  return safePreviewPath(previews[track.n]);
}
