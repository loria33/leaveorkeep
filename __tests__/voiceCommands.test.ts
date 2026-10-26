import {
  advanceVoiceUtterance,
  classifyVoiceWord,
  closeVoiceUtterance,
  EMPTY_VOICE_UTTERANCE,
  toVoiceWords,
  VoiceUtteranceState,
} from '../src/utils/voiceCommands';

// Feeds a sequence of partial transcripts and returns the commands each one produced
const run = (transcripts: string[], start = EMPTY_VOICE_UTTERANCE) => {
  let state: VoiceUtteranceState = start;
  return transcripts.map(transcript => {
    const { next, commands } = advanceVoiceUtterance(state, transcript);
    state = next;
    return commands;
  });
};

describe('toVoiceWords', () => {
  it('lower-cases, strips punctuation and splits on whitespace', () => {
    expect(toVoiceWords('  Keep, Flick!  next ')).toEqual([
      'keep',
      'flick',
      'next',
    ]);
  });
});

describe('classifyVoiceWord', () => {
  it('maps every synonym to its command', () => {
    expect(classifyVoiceWord('keep')).toBe('keep');
    expect(classifyVoiceWord('swipe')).toBe('keep');
    expect(classifyVoiceWord('flick')).toBe('trash');
    expect(classifyVoiceWord('delete')).toBe('trash');
    expect(classifyVoiceWord('keeps')).toBeNull();
  });
});

describe('advanceVoiceUtterance', () => {
  it('turns a single heard word into one command', () => {
    expect(run(['keep'])).toEqual([['keep']]);
  });

  it('yields only the new command as the transcript grows', () => {
    expect(run(['keep', 'keep keep', 'keep keep flick'])).toEqual([
      ['keep'],
      ['keep'],
      ['trash'],
    ]);
  });

  it('ignores a repeated identical transcript', () => {
    expect(run(['keep', 'keep', 'keep'])).toEqual([['keep'], [], []]);
  });

  it('does not re-run consumed words while the last word is still being revised', () => {
    expect(run(['keep fl', 'keep flick', 'keep flick'])).toEqual([
      ['keep'],
      ['trash'],
      [],
    ]);
  });

  it('runs a word that only becomes a command once the engine finishes it', () => {
    expect(run(['kee', 'keep'])).toEqual([[], ['keep']]);
  });

  it('runs every command when several words arrive at once, in order', () => {
    expect(run(['keep keep flick next'])).toEqual([
      ['keep', 'keep', 'trash', 'keep'],
    ]);
  });

  it('shows non-command words without running anything', () => {
    const { next, commands } = advanceVoiceUtterance(
      EMPTY_VOICE_UTTERANCE,
      'keeps the photo',
    );
    expect(commands).toEqual([]);
    expect(next.words).toEqual(['keeps', 'the', 'photo']);
  });

  it('starts over when the engine begins a new, shorter transcript', () => {
    expect(run(['keep flick', 'keep'])).toEqual([['keep', 'trash'], ['keep']]);
  });

  it('runs the same word again after a final result closed the utterance', () => {
    const first = advanceVoiceUtterance(EMPTY_VOICE_UTTERANCE, 'keep');
    expect(first.commands).toEqual(['keep']);
    const second = advanceVoiceUtterance(EMPTY_VOICE_UTTERANCE, 'keep');
    expect(second.commands).toEqual(['keep']);
  });
});

describe('advanceVoiceUtterance across a closed utterance', () => {
  // Apple reports a benign error on every pause while keeping one recognition
  // session, so the next partial still carries the words already acted on.
  it('runs only the new word when the session carries its transcript forward', () => {
    const first = advanceVoiceUtterance(
      EMPTY_VOICE_UTTERANCE,
      'swipe',
      false,
      1000,
    );
    expect(first.commands).toEqual(['keep']);

    const afterPause = closeVoiceUtterance(first.next, 1500);
    const second = advanceVoiceUtterance(
      afterPause,
      'swipe swipe',
      false,
      4000,
    );
    expect(second.commands).toEqual(['keep']);
  });

  it('does not let the carried transcript pile up over several pauses', () => {
    let state = EMPTY_VOICE_UTTERANCE;
    const spoken = ['swipe', 'swipe swipe', 'swipe swipe flick'];
    const perUtterance = spoken.map((transcript, turn) => {
      const result = advanceVoiceUtterance(
        state,
        transcript,
        false,
        2000 * (turn + 1),
      );
      // A pause, and with it the engine's benign error, follows every word
      state = closeVoiceUtterance(result.next, 2000 * (turn + 1) + 100);
      return result.commands;
    });
    expect(perUtterance).toEqual([['keep'], ['keep'], ['trash']]);
  });

  it('shows only the current utterance, not the carried transcript', () => {
    const first = advanceVoiceUtterance(
      EMPTY_VOICE_UTTERANCE,
      'swipe',
      false,
      1000,
    );
    expect(first.words).toEqual(['swipe']);

    const afterPause = closeVoiceUtterance(first.next, 1500);
    const second = advanceVoiceUtterance(
      afterPause,
      'swipe swipe',
      false,
      4000,
    );
    expect(second.words).toEqual(['swipe']);

    // Still the current utterance while the engine revises its last word
    const revised = advanceVoiceUtterance(
      second.next,
      'swipe swipe flick',
      false,
      4200,
    );
    expect(revised.words).toEqual(['swipe', 'flick']);
    expect(revised.commands).toEqual(['trash']);
  });

  it('shows the whole transcript again when the session drops what it carried', () => {
    const first = advanceVoiceUtterance(
      EMPTY_VOICE_UTTERANCE,
      'swipe',
      false,
      1000,
    );
    const afterPause = closeVoiceUtterance(first.next, 1500);
    const carried = advanceVoiceUtterance(
      afterPause,
      'swipe swipe',
      false,
      4000,
    );
    const restarted = advanceVoiceUtterance(carried.next, 'flick', false, 4500);
    expect(restarted.words).toEqual(['flick']);
    expect(restarted.commands).toEqual(['trash']);
  });

  it('starts over when the session drops the transcript it closed', () => {
    const first = advanceVoiceUtterance(
      EMPTY_VOICE_UTTERANCE,
      'swipe',
      false,
      1000,
    );
    const afterPause = closeVoiceUtterance(first.next, 1500);
    const second = advanceVoiceUtterance(afterPause, 'flick', false, 4000);
    expect(second.commands).toEqual(['trash']);
  });
});

describe('advanceVoiceUtterance echo guard', () => {
  // A final result closes the utterance; the engine then re-arms and can
  // re-deliver what it just finalized, which must not run the word twice.
  const final = (state: VoiceUtteranceState, transcript: string, at: number) =>
    advanceVoiceUtterance(state, transcript, true, at);

  it('ignores the transcript a re-arming engine repeats after a final', () => {
    const closed = final(EMPTY_VOICE_UTTERANCE, 'flick', 1000);
    expect(closed.commands).toEqual(['trash']);

    const echo = advanceVoiceUtterance(closed.next, 'flick', false, 1050);
    expect(echo.commands).toEqual([]);
  });

  it('ignores an echo that is only the start of the closed utterance', () => {
    const closed = final(EMPTY_VOICE_UTTERANCE, 'keep flick', 1000);
    expect(closed.commands).toEqual(['keep', 'trash']);

    const echo = advanceVoiceUtterance(closed.next, 'keep', false, 1100);
    expect(echo.commands).toEqual([]);
  });

  it('runs the word again once the echo window has passed', () => {
    const closed = final(EMPTY_VOICE_UTTERANCE, 'flick', 1000);
    const spokenAgain = advanceVoiceUtterance(
      closed.next,
      'flick',
      false,
      3000,
    );
    expect(spokenAgain.commands).toEqual(['trash']);
  });

  it('runs a different word spoken right after a final', () => {
    const closed = final(EMPTY_VOICE_UTTERANCE, 'flick', 1000);
    const next = advanceVoiceUtterance(closed.next, 'keep', false, 1050);
    expect(next.commands).toEqual(['keep']);
  });

  it('still runs both words of a single utterance spoken in one breath', () => {
    const first = advanceVoiceUtterance(
      EMPTY_VOICE_UTTERANCE,
      'flick',
      false,
      1000,
    );
    expect(first.commands).toEqual(['trash']);
    const second = advanceVoiceUtterance(
      first.next,
      'flick flick',
      false,
      1200,
    );
    expect(second.commands).toEqual(['trash']);
  });
});
