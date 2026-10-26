// Pure helpers behind the VoiceIT feature: which words are commands, and how a
// stream of partial transcripts turns into exactly one command per spoken word.

export type VoiceCommand = 'keep' | 'trash';

const KEEP_WORDS = new Set(['keep', 'swipe', 'next', 'continue']);
const TRASH_WORDS = new Set(['trash', 'flick', 'delete', 'remove']);

/**
 * How long after an utterance is closed a transcript repeating it counts as the
 * engine echoing itself rather than the user speaking again. Both engines re-arm
 * after a final result and can re-deliver what they just closed; nobody says the
 * next command that fast.
 */
export const VOICE_ECHO_WINDOW_MS = 400;

export interface VoiceUtteranceState {
  /** Words of the latest transcript seen for the utterance in progress */
  words: string[];
  /** Index just past the last word that already became a command */
  consumed: number;
  /**
   * Leading words of the transcript that belong to utterances already closed.
   * The engine keeps them in every later transcript; they are neither run again
   * nor shown as heard.
   */
  offset: number;
  /** Transcript the engine had when a final result or an error closed the utterance */
  closedWords: string[];
  /** When it closed, or 0 while an utterance is in progress */
  closedAt: number;
}

export const EMPTY_VOICE_UTTERANCE: VoiceUtteranceState = {
  words: [],
  consumed: 0,
  offset: 0,
  closedWords: [],
  closedAt: 0,
};

/** Lower-cases a transcript, drops punctuation and splits it into words */
export const toVoiceWords = (transcript: string): string[] =>
  transcript
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** The command a single heard word stands for, if any */
export const classifyVoiceWord = (word: string): VoiceCommand | null => {
  if (KEEP_WORDS.has(word)) return 'keep';
  if (TRASH_WORDS.has(word)) return 'trash';
  return null;
};

const startsWith = (words: string[], prefix: string[]): boolean =>
  prefix.length <= words.length &&
  prefix.every((word, index) => word === words[index]);

/**
 * Closes the utterance in progress without forgetting what was already acted on.
 *
 * An engine that keeps one recognition session across a pause carries the whole
 * transcript forward, so the next partial still contains the words just handled.
 * Clearing the state outright would make those words look new and run them twice,
 * which is why an error must close the utterance rather than reset it.
 */
export const closeVoiceUtterance = (
  previous: VoiceUtteranceState,
  now: number = Date.now(),
): VoiceUtteranceState => ({
  words: [],
  consumed: 0,
  offset: previous.offset,
  closedWords: previous.words,
  closedAt: now,
});

/**
 * Engines re-send the whole transcript so far on every partial result, and may
 * still be revising the last word. This turns each command word into exactly one
 * command, in the order spoken: words already consumed are skipped, and a
 * transcript that no longer matches the consumed words is a new utterance that
 * starts over (so "keep" twice in a row works).
 *
 * `isFinal` closes the utterance the same way [closeVoiceUtterance] does.
 */
export const advanceVoiceUtterance = (
  previous: VoiceUtteranceState,
  transcript: string,
  isFinal: boolean = false,
  now: number = Date.now(),
): {
  next: VoiceUtteranceState;
  commands: VoiceCommand[];
  /** Words of this utterance alone, to show as "heard" */
  words: string[];
} => {
  const words = toVoiceWords(transcript);

  // Work out where to resume from when the previous utterance was closed
  let base = previous;
  let offset = previous.offset;
  if (previous.closedAt > 0) {
    const closed = previous.closedWords;
    if (words.length > closed.length && startsWith(words, closed)) {
      // Same session carrying its transcript forward: everything up to the close
      // was already acted on, so only the words past it are new
      offset = closed.length;
      base = {
        words: closed,
        consumed: closed.length,
        offset,
        closedWords: [],
        closedAt: 0,
      };
    } else if (
      startsWith(closed, words) &&
      now - previous.closedAt <= VOICE_ECHO_WINDOW_MS
    ) {
      // The engine repeating what it just closed
      return {
        next: previous,
        commands: [],
        words: closed.slice(previous.offset),
      };
    } else {
      // A genuinely new utterance, so the same word may be spoken again
      base = EMPTY_VOICE_UTTERANCE;
      offset = 0;
    }
  }

  let common = 0;
  while (
    common < words.length &&
    common < base.words.length &&
    words[common] === base.words[common]
  ) {
    common += 1;
  }

  // The transcript diverged before the carried-forward part, so the engine
  // dropped it and the whole transcript is this utterance again
  if (common < offset) offset = 0;

  // Everything consumed so far is still there: same utterance, continue after it.
  // Otherwise the engine restarted (or rewrote) the transcript: start over.
  let consumed = common >= base.consumed ? base.consumed : 0;
  const commands: VoiceCommand[] = [];
  for (let i = consumed; i < words.length; i += 1) {
    const command = classifyVoiceWord(words[i]);
    if (command) {
      commands.push(command);
      consumed = i + 1;
    }
  }

  const next: VoiceUtteranceState = isFinal
    ? { words: [], consumed: 0, offset, closedWords: words, closedAt: now }
    : { words, consumed, offset, closedWords: [], closedAt: 0 };

  return { next, commands, words: words.slice(offset) };
};
