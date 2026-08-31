import { describe, expect, it } from 'vitest';
import { parseMessageThinking } from './messageParser';

describe('parseMessageThinking', () => {
  it('removes whitespace between repeated thinking blocks from the visible response', () => {
    const result = parseMessageThinking(
      'First answer\n\n<think>\nfirst thought\n</think>\n\n\n\n\n<think>\nsecond thought\n</think>\n\nSecond answer'
    );

    expect(result).toEqual({
      thought: 'first thought\nsecond thought',
      response: 'First answer\n\nSecond answer',
      isThinking: false,
    });
    expect(result.response).not.toMatch(/\n{3,}/);
  });

  it('preserves deliberate paragraph formatting inside a visible segment', () => {
    const response = 'First paragraph.\n\nSecond paragraph.\nStill second paragraph.';

    expect(parseMessageThinking(response).response).toBe(response);
  });

  it('preserves blank lines inside fenced code blocks', () => {
    const response = 'Example:\n\n```ts\nconst first = 1;\n\nconst second = 2;\n```\n\nFinished.';

    expect(parseMessageThinking(`<think>\nprepare example\n</think>\n\n${response}`).response).toBe(response);
  });

  it('classifies an incomplete streaming thinking block without exposing its tag', () => {
    expect(parseMessageThinking('Visible so far.\n\n<think>\nStill reasoning')).toEqual({
      thought: 'Still reasoning',
      response: 'Visible so far.',
      isThinking: true,
    });
  });

  it('classifies content before an orphaned closing tag as thought', () => {
    expect(parseMessageThinking('Recovered reasoning\n</think>\nVisible answer')).toEqual({
      thought: 'Recovered reasoning',
      response: 'Visible answer',
      isThinking: false,
    });
  });

  it('keeps literal inline thinking tags visible in explanatory prose', () => {
    const response = 'The model may emit `<think>...</think>` tags. Do not copy <think>this example</think>.';

    expect(parseMessageThinking(response)).toEqual({ thought: '', response, isThinking: false });
  });

  it.each([
    {
      name: 'backtick',
      response: 'Before\n\n````md\n<think>\nliteral code\n</think>\n```\nstill code\n````\n\nAfter',
    },
    {
      name: 'tilde',
      response: 'Before\n\n~~~xml\n  <think>  \nliteral code\n\t</think>\t\n~~~\n\nAfter',
    },
  ])('keeps standalone-looking tags inside $name fences visible', ({ response }) => {
    expect(parseMessageThinking(response)).toEqual({ thought: '', response, isThinking: false });
  });

  it.each(['<', '<t', '<th', '<thi', '<thin', '<think'])(
    'suppresses the incomplete streaming prefix %s at a standalone boundary',
    (prefix) => {
      expect(parseMessageThinking(`Visible so far.\n\n \t${prefix}\t`)).toEqual({
        thought: '',
        response: 'Visible so far.',
        isThinking: false,
      });
    }
  );

  it.each([
    '<think>not standalone</think>',
    'before <think>\nafter',
    '<think >\ncontent\n</think >',
    '<thinking>\ncontent\n</thinking>',
    'prefix <think',
  ])('keeps malformed or non-standalone syntax visible: %s', (response) => {
    expect(parseMessageThinking(response)).toEqual({ thought: '', response, isThinking: false });
  });

  it('handles CRLF control lines while preserving CRLF inside segments', () => {
    expect(
      parseMessageThinking(
        'First line\r\nSecond line\r\n\t<think>\t\r\nstep one\r\n\r\nstep two\r\n</think>\r\nFinal line'
      )
    ).toEqual({
      thought: 'step one\r\n\r\nstep two',
      response: 'First line\r\nSecond line\n\nFinal line',
      isThinking: false,
    });
  });
});
