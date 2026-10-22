// Newsletter copy. Still illustrative demo writing, labelled as such on the page.
// Real album, track and event data lives in release.js.

export const ISSUES = [
  {
    number: '04',
    date: '2026.10.12',
    title: 'Autumn synth workshop: notes on listening before tuning',
    tag: 'SYNTHESIS / TUNING / WORKSHOP',
    minutes: '06',
    deck: 'From a single oscillator to a line you can actually hear as singing: stop counting parameters and start listening to how the sound behaves.',
    quote: 'Tuning is not about pushing every note toward perfect. It is about leaving the error a feeling needs in order to breathe.',
    sections: [
      {
        title: 'Start from listening, not from parameters',
        text: [
          'This sample workshop used subtractive synthesis as the entry point. Participants built a skeleton from one oscillator, then added envelope, filter and modulation one control at a time, comparing after each change how the centre of gravity of the sound moved.',
          'An expressive sound does not need a complicated signal chain. We tried writing down the feeling first, then deciding which parameters were actually worth touching.'
        ],
        table: [
          ['OSCILLATOR', 'Triangle / Sawtooth', 'Compare harmonic density before choosing a waveform'],
          ['FILTER', 'Low-pass / 1.8 kHz', 'Leave room in the band the voice will occupy'],
          ['ENVELOPE', 'A 12ms / D 180ms / R 240ms', 'Let attack and tail carry part of the expression'],
          ['MONITORING', 'Level-matched A/B', 'Do not mistake louder for better']
        ]
      },
      {
        title: 'Write breath into the pitch curve',
        text: [
          'Using four bars of synthesized vocal as the example, we treated onset, sustain and phrase ending separately. The onset gives direction, the sustain holds the line, and the ending usually carries the emotion of the whole sentence.',
          'Tuning drafts and instrumental drafts were iterated side by side. Arrangement is not packaging applied after the vocal is finished; it is the space that answers the voice.'
        ]
      },
      {
        title: 'Come back next time with a question',
        text: [
          'Keep the original take and the adjusted take, and write down the reason for each change. The next workshop will discuss those differences instead of only presenting finished results.',
          'This is a layout sample for the club newsletter. The settings are a starting point for practice, not a fixed audio engineering standard.'
        ]
      }
    ]
  },
  {
    number: '03',
    date: '2026.09.06',
    title: 'Screening night and the launch of a new album project',
    tag: 'SCREENING / ALBUM / COLLABORATION',
    minutes: '05',
    deck: 'Listening together in the dark, then starting again from a blank page. Notes on image rhythm, sonic narrative and how we divide work.',
    quote: 'An album is not a set of songs. It is a distance we travel together.',
    sections: [
      {
        title: 'Put listening back into a shared room',
        text: [
          'The sample programme for the screening alternated wordless footage with electronic fragments. Discussion moved from narrative to rhythm: how much does the same passage weigh when the image under it changes?',
          'We wrote first reactions on sticky notes, then sorted them by space, colour and motion. The visual team and the music team walked away with a shared vocabulary.'
        ]
      },
      {
        title: 'Agree on a language before dividing the work',
        text: [
          'The new album project starts from three constraints: one shared sonic motif, one restrained set of colours, and one narrative question wide enough to hold different authors.',
          'Every draft goes through a cross-listening session. Explain your choices, and leave room for someone else\u2019s.'
        ],
        table: [
          ['CONCEPT', 'Common Ground', 'Keep the individual, build the connection'],
          ['AUDIO', '4 demonstration studies', 'Synthesized voice beside instrumentation'],
          ['VISUAL', 'Obsidian / Signal Yellow', 'Structure before decoration'],
          ['WORKFLOW', 'Sketch \u2192 Review \u2192 Iterate', 'Keep comparable versions each round']
        ]
      },
      {
        title: 'File the unfinished work too',
        text: [
          'Drafts, listening feedback and jacket layout experiments are all collected in the newsletter. The value of making does not only exist on release day.',
          'This sample programme does not represent a real schedule. Replace it with the club\u2019s actual dates and owners before publishing.'
        ]
      }
    ]
  },
  {
    number: '02',
    date: '2026.06.21',
    title: 'Nash equilibrium and notes on writing for several voices',
    tag: 'ARRANGEMENT / SYSTEMS / ESSAY',
    minutes: '07',
    deck: 'Borrowing the language of games to think about how voices relate: one part\u2019s choice changes the space the others can occupy.',
    quote: 'A good arrangement is not everyone standing in the centre. It is everyone knowing how to give the centre away.',
    sections: [
      {
        title: 'An analogy, not a theorem',
        text: [
          'This piece treats multi-part writing as a set of choices that answer each other. Nash equilibrium is used here as a heuristic, not as a mathematical proof about musical structure.',
          'When the lead enters a dense phrase, the accompaniment can reduce the number of events. When the voice leaves a gap, an instrumental motif gets a chance to carry the narrative.'
        ]
      },
      {
        title: 'Give every line a different job',
        text: [
          'Compare rhythmic density, register and direction of movement. Separating those dimensions is usually more effective than adding more notes to every part.'
        ],
        table: [
          ['LEAD', 'Narrative / foreground', 'Keep a motif worth remembering'],
          ['COUNTERPOINT', 'Response / displacement', 'Avoid fighting for the same register'],
          ['HARMONY', 'Colour / support', 'Hold the centre with restraint'],
          ['BASS', 'Direction / ground', 'Anchor the rhythm section']
        ]
      },
      {
        title: 'Switch between conflict and collaboration',
        text: [
          'Not every part needs to be consonant at all times. Brief crowding, overlap and instability can be the force behind a turn in the section; the question is whether it serves the piece.',
          'Solo every part once, then return to the full mix. Standing alone and standing together are two different judgements.'
        ]
      }
    ]
  }
];
