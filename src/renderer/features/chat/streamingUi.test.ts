import { describe, expect, it } from 'vitest';
import { isNearScrollBottom, SCROLL_FOLLOW_THRESHOLD_PX } from './useScrollFollow';
import { parseMessageThinking } from './messageParser';
import { getPartialThinkingTag, ProgressiveMessageRenderer } from './ProgressiveMessageRenderer';

describe('streaming UI invariants', () => {
  it('renders typed reasoning as a part rather than a card per newline', () => {
    const source = ProgressiveMessageRenderer.toString();
    expect(source).toMatch(/part\.kind\s*===\s*['"]reasoning['"]/);
    expect(source).toContain('reasoningText');
    expect(source).not.toContain('reasoningParts.map');
    expect(source).not.toContain("thought.split('\\n')");
  });
  it('keeps incomplete fences and thinking tags as text until their delimiter arrives', () => {
    expect(parseMessageThinking('before\n```ts\nconst x =').response).toContain('```ts');
    expect(getPartialThinkingTag('before\n<thi')).toBe('<thi');
  });

  it('follows only when the scroll container is near its bottom', () => {
    const element = { scrollHeight: 1000, clientHeight: 200, scrollTop: 720 };
    expect(isNearScrollBottom(element)).toBe(true);
    element.scrollTop = 719 - SCROLL_FOLLOW_THRESHOLD_PX;
    expect(isNearScrollBottom(element)).toBe(false);
  });
});
