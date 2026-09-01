import { useCallback, useEffect, useRef } from 'react';

export const SCROLL_FOLLOW_THRESHOLD_PX = 80;

export function isNearScrollBottom(
  element: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>,
  threshold = SCROLL_FOLLOW_THRESHOLD_PX
): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
}

export function useScrollFollow(
  containerRef: React.RefObject<HTMLElement>,
  dependencies: readonly unknown[]
): { scrollToBottom: (force?: boolean) => void } {
  const shouldFollowRef = useRef(true);

  const scrollToBottom = useCallback((force = false) => {
    const container = containerRef.current;
    if (!container) return;
    if (force || shouldFollowRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [containerRef]);

  // Track user scrolling behavior via passive event listener (does not force on render)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = () => {
      shouldFollowRef.current = isNearScrollBottom(container);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [containerRef]);

  // Auto-scroll when dependencies update (new messages, streaming deltas, active parts)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (shouldFollowRef.current) {
      container.scrollTop = container.scrollHeight;
    }

    const frame = requestAnimationFrame(() => {
      if (container && shouldFollowRef.current) {
        container.scrollTop = container.scrollHeight;
      }
    });

    return () => cancelAnimationFrame(frame);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  // Auto-follow dynamic DOM height expansion (e.g. streaming markdown/reasoning blocks)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof MutationObserver === 'undefined') return;

    const observer = new MutationObserver(() => {
      if (shouldFollowRef.current && container) {
        container.scrollTop = container.scrollHeight;
      }
    });

    observer.observe(container, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [containerRef]);

  return { scrollToBottom };
}
