// Filler words to detect. Order matters — longer phrases first so
// "you know" is caught before just "know" style false hits.
const FILLER_WORDS = [
    'you know',
    'i mean',
    'kind of',
    'sort of',
    'pretty much',
    'well',
    'honestly',
    'seriously',
    'obviously',
    'basically',
    'literally',
    'actually',
    'essentially',
    'definitely',
    'absolutely',
    'totally',
    'anyway',
    'whatever',
    'stuff',
    'things',
    'cool',
    'awesome',
    'okay',
    'alright',
    'look',
    'listen',
    'super',
    'crazy',
    'insane',
    'um',
    'uh',
    'like',
    'so',
    'right',
    'hmm',
    'yeah',
  ];
  
  // Words that should NOT be counted as fillers when used legitimately.
  // We do a light context check to avoid absurd counts.
  function isLikelyLegit(word, fullText) {
    const w = word.toLowerCase();
  
    // "things" and "stuff" are only flagged if used vaguely:
    //   "stuff like that", "things like that" → vague, count it
    //   "three things to note" → specific, don't count it
    if (w === 'things' || w === 'stuff') {
      const vaguePattern = new RegExp(`\\b${w}\\s+like\\s+that`, 'i');
      return !vaguePattern.test(fullText);
    }
  
    // "so" is a filler when it starts a sentence loosely,
    // but is legitimate as "so that", "so much", "so many"
    if (w === 'so') {
      const legitPattern = /\bso\s+(that|much|many|far|long|good|bad)/i;
      return legitPattern.test(fullText);
    }
  
    // "like" — legitimate when it means "similar to" or "enjoy"
    // (e.g., "I like coding", "languages like Python")
    // This is hard to detect perfectly; we'll accept some false positives.
    // Skip filtering for now — most interview "like" usage IS filler.
  
    // "right" — legit as "correct", "right answer"
    if (w === 'right') {
      const legitPattern = /\bright\s+(answer|now|way|thing|side)/i;
      return legitPattern.test(fullText);
    }
  
    return false;
  }
  
  export function countFillers(transcript) {
    if (!transcript) return { counts: {}, total: 0 };
  
    const lower = transcript.toLowerCase();
    const counts = {};
  
    for (const filler of FILLER_WORDS) {
      // Word-boundary regex. For multi-word phrases, \b still works.
      const regex = new RegExp(`\\b${filler.replace(/\s+/g, '\\s+')}\\b`, 'gi');
      const matches = lower.match(regex) || [];
  
      // Light context filtering
      let count = matches.length;
      if (count > 0 && isLikelyLegit(filler, transcript)) {
        count = 0;
      }
  
      if (count > 0) {
        counts[filler] = count;
      }
    }
  
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
  
    // Sort by count descending for display
    const sorted = Object.fromEntries(
      Object.entries(counts).sort((a, b) => b[1] - a[1])
    );
  
    return { counts: sorted, total };
  }
  
  export function analyzePauses(words) {
    if (!words || words.length < 2) {
      return { pauses: [], total: 0, minor: 0, long: 0, veryLong: 0 };
    }
  
    const pauses = [];
  
    for (let i = 1; i < words.length; i++) {
      const prevEnd = words[i - 1].end; // milliseconds
      const currStart = words[i].start;
      const gapMs = currStart - prevEnd;
      const gapSec = gapMs / 1000;
  
      if (gapSec >= 1.5) {
        let tier = 'minor';
        if (gapSec >= 5) tier = 'veryLong';
        else if (gapSec >= 3) tier = 'long';
  
        pauses.push({
          after: words[i - 1].text,
          before: words[i].text,
          durationSec: Math.round(gapSec * 10) / 10,
          tier,
          atSec: Math.round(prevEnd / 100) / 10, // where in the recording
        });
      }
    }
  
    return {
      pauses,
      total: pauses.length,
      minor: pauses.filter((p) => p.tier === 'minor').length,
      long: pauses.filter((p) => p.tier === 'long').length,
      veryLong: pauses.filter((p) => p.tier === 'veryLong').length,
    };
  }
  
  export function analyzePace(words, durationSec) {
    if (!words || !durationSec) return { wpm: 0, rating: 'unknown' };
  
    const wpm = Math.round((words.length / durationSec) * 60);
  
    let rating = 'good';
    if (wpm < 100) rating = 'slow';
    else if (wpm < 120) rating = 'slightly slow';
    else if (wpm > 180) rating = 'fast';
    else if (wpm > 160) rating = 'slightly fast';
    // 120–160 = ideal
  
    return { wpm, rating };
  }
  
  export function analyzeAll({ transcript, words, durationSec }) {
    return {
      fillers: countFillers(transcript),
      pauses: analyzePauses(words),
      pace: analyzePace(words, durationSec),
    };
  }