import React from 'react';

interface MemoizedMessageRowProps {
  message: { id: string };
  renderVersion?: boolean;
  children: React.ReactNode;
}

/** Historical messages are immutable; live streaming is rendered as a sibling. */
export const MemoizedMessageRow = React.memo(function MemoizedMessageRow({ children }: MemoizedMessageRowProps) {
  return <>{children}</>;
}, (previous, next) => previous.message === next.message && previous.renderVersion === next.renderVersion);
