import { useEffect, useRef } from 'react';

export const SCROLL_FOLLOW_THRESHOLD_PX = 80;

export function isNearScrollBottom(element: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>, threshold = SCROLL_FOLLOW_THRESHOLD_PX): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
}

export function useScrollFollow(containerRef: React.RefObject<HTMLElement>, dependencies: readonly unknown[]): void {
  const shouldFollowRef = useRef(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => { shouldFollowRef.current = isNearScrollBottom(container); };
    onScroll();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  });

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (container && shouldFollowRef.current) container.scrollTop = container.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  // The caller supplies stable, render-relevant dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
}
