import { describe, expect, it } from 'vitest';
import {
  autoCorrectWord,
  checkGrammar,
  fixTwoInitialCapitals,
  readabilityStats,
  smartQuote,
} from './proofing';

describe('AutoCorrect', () => {
  it('replaces a known typo and follows the typed capitalisation', () => {
    expect(autoCorrectWord('teh')).toBe('the');
    expect(autoCorrectWord('Teh')).toBe('The');
    expect(autoCorrectWord('TEH')).toBe('THE');
  });

  it('keeps a replacement that carries its own capitalisation', () => {
    expect(autoCorrectWord('ive')).toBe("I've");
  });

  it('leaves words it does not know alone', () => {
    expect(autoCorrectWord('the')).toBeNull();
    expect(autoCorrectWord('Officewrite')).toBeNull();
  });

  it('fixes two initial capitals', () => {
    expect(fixTwoInitialCapitals('THe')).toBe('The');
    // An all-caps acronym is not a mistake.
    expect(fixTwoInitialCapitals('PDF')).toBeNull();
  });

  it('chooses the opening or closing curly quote from the previous character', () => {
    expect(smartQuote('"', '')).toBe('“');
    expect(smartQuote('"', ' ')).toBe('“');
    expect(smartQuote('"', 'd')).toBe('”');
    expect(smartQuote("'", 'n')).toBe('’');
  });
});

describe('grammar rules', () => {
  const rules = (text: string) => checkGrammar(text).map((issue) => issue.rule);

  it('flags a repeated word and suggests dropping one', () => {
    const [issue] = checkGrammar('The the cat sat.');
    expect(issue.rule).toBe('repeated-word');
    expect(issue.suggestions).toEqual(['The']);
  });

  it('flags the wrong article', () => {
    const issue = checkGrammar('Eat a apple daily.').find((i) => i.rule === 'article-agreement');
    expect(issue?.suggestions).toEqual(['an']);
  });

  it('checks whole repeated words across Unicode text and preserves correction offsets', () => {
    expect(checkGrammar('An élan élan.').find((i) => i.rule === 'repeated-word')).toMatchObject({
      from: 3, to: 12, text: 'élan élan', suggestions: ['élan'],
    });
    for (const input of ['αtest test', 'abcαa αa', 'word wordish', '123the the', 'the the123', '_the the']) {
      expect(rules(input)).not.toContain('repeated-word');
    }
    expect(checkGrammar('AA aa aa aa').filter((i) => i.rule === 'repeated-word').map((i) => [i.from, i.to]))
      .toEqual([[0, 5], [6, 11]]);
  });

  it('does not retry repeated-word matching inside long mixed-script words', () => {
    const started = performance.now();
    expect(checkGrammar('Aα'.repeat(50_000))).toEqual([]);
    expect(rules('αA'.repeat(50_000))).toEqual(['sentence-capital']);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('accepts an article that matches the following sound', () => {
    expect(rules('Eat an apple daily.')).not.toContain('article-agreement');
    expect(rules('It took an hour.')).not.toContain('article-agreement');
    expect(rules('She is a university lecturer.')).not.toContain('article-agreement');
  });

  it('flags "should of" and offers "should have"', () => {
    const issue = checkGrammar('We should of asked.').find((i) => i.rule === 'modal-of');
    expect(issue?.suggestions).toEqual(['should have']);
  });

  it('flags spacing mistakes', () => {
    expect(rules('Two  spaces here.')).toContain('double-space');
    expect(rules('A space before , the comma.')).toContain('space-before-punctuation');
    expect(rules('Missing,space here.')).toContain('missing-space');
  });

  it('flags a sentence that starts lowercase', () => {
    expect(rules('Done. now this.')).toContain('sentence-capital');
  });

  it('preserves punctuation correction ranges and only consumes ordinary spaces', () => {
    for (const punctuation of ',.;:!?') {
      const issue = checkGrammar('Hello   ' + punctuation).find((i) => i.rule === 'space-before-punctuation');
      expect(issue).toMatchObject({ from: 5, to: 9, text: '   ' + punctuation, suggestions: [punctuation] });
    }
    expect(rules('Hello\t,')).not.toContain('space-before-punctuation');
    expect(rules('Hello\u00a0,')).not.toContain('space-before-punctuation');
  });

  it('handles long nonmatching space runs without stalling', () => {
    const started = performance.now();
    expect(checkGrammar(' '.repeat(100_000) + 'X')).toEqual([]);
    expect(rules('Word' + ' '.repeat(100_000) + 'Next')).toEqual(['double-space']);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('reports nothing for clean prose', () => {
    expect(checkGrammar('The quick brown fox jumps over the lazy dog.')).toEqual([]);
  });

  it('never returns overlapping ranges', () => {
    const issues = checkGrammar('the the  cat is a apple , really.');
    for (let i = 1; i < issues.length; i += 1) {
      expect(issues[i].from).toBeGreaterThanOrEqual(issues[i - 1].to);
    }
  });

  it('retains many separate corrections without rescanning all earlier issues', () => {
    const started = performance.now();
    const issues = checkGrammar('Word , '.repeat(50_000));
    expect(issues).toHaveLength(50_000);
    expect(issues[0]).toMatchObject({ from: 4, to: 6, rule: 'space-before-punctuation' });
    expect(issues[49_999]).toMatchObject({ from: 349_997, to: 349_999 });
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});

describe('readability', () => {
  it.each([
    ['Hello!!World', 1],
    ['Hello!! World? Again.', 3],
    ['... \t !!\n??', 0],
    ['Hello.\r\nWorld!', 2],
    ['Hi.\u00a0Bye!\u2028Next?', 3],
    ['One. Two!Three? Four', 3],
  ])('preserves sentence boundaries in %j', (text, sentences) => {
    expect(readabilityStats(text).sentences).toBe(sentences);
  });

  it('handles long punctuation runs followed by ordinary text without stalling', () => {
    const punctuation = '.!?'.repeat(40_000);
    const started = performance.now();
    expect(readabilityStats(punctuation + 'Word').sentences).toBe(1);
    expect(readabilityStats('Hello' + punctuation + ' World.').sentences).toBe(2);
    expect(readabilityStats(punctuation).sentences).toBe(0);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('counts words and sentences', () => {
    const stats = readabilityStats('The cat sat on the mat. It slept.');
    expect(stats.words).toBe(8);
    expect(stats.sentences).toBe(2);
    expect(stats.readingEase).toBeGreaterThan(80);
  });

  it('returns zeroes for empty text rather than NaN', () => {
    expect(readabilityStats('   ')).toEqual({
      words: 0,
      sentences: 0,
      syllables: 0,
      readingEase: 0,
      gradeLevel: 0,
    });
  });
});
