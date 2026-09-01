import React, { useRef } from 'react';
import { parseMessageThinking } from './messageParser';
import { MarkdownRenderer } from './MarkdownRenderer';

export type AssistantDisplayPart = {
  partId: string;
  kind: 'text' | 'reasoning';
  ordinal: number;
  text: string;
};

export interface ProgressiveMessageRendererProps {
  content: string;
  parts?: AssistantDisplayPart[];
  messageId: string;
  isStreaming?: boolean;
  renderThought: (thought: string, isThinking: boolean) => React.ReactNode;
  renderCodeBlock: (code: string, language: string, codeId: string) => React.ReactNode;
  textClassName: string;
  emptyState: React.ReactNode;
}

function stableBoundary(content: string, previousBoundary: number): number {
  let boundary = previousBoundary;
  const fence = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[ \t]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(content))) boundary = match.index + match[0].length;

  // Paragraph boundaries are structurally final and avoid rebuilding earlier prose.
  const paragraphBoundary = content.lastIndexOf('\n\n');
  if (paragraphBoundary >= 0) boundary = Math.max(boundary, paragraphBoundary + 2);
  return Math.max(previousBoundary, boundary);
}

/** @deprecated Marker streams are legacy-only; typed parts do not need this projection. */
export function getPartialThinkingTag(content: string): string {
  const candidate = content.match(/(?:^|\n)\s*(<[^\s]*)\s*$/i)?.[1].toLowerCase();
  return candidate && ['<', '<t', '<th', '<thi', '<thin', '<think'].includes(candidate) ? candidate : '';
}

const MessageText = React.memo(function MessageText({
  content,
  messageId,
  renderCodeBlock,
  textClassName,
}: Pick<ProgressiveMessageRendererProps, 'content' | 'messageId' | 'renderCodeBlock' | 'textClassName'>) {
  return (
    <MarkdownRenderer
      content={content}
      messageId={messageId}
      renderCodeBlock={renderCodeBlock}
      textClassName={textClassName}
    />
  );
});

/** Keeps finalized Markdown blocks mounted while only the active suffix changes. */
export const ProgressiveMessageRenderer: React.FC<ProgressiveMessageRendererProps> = ({
  content, parts, messageId, isStreaming = false, renderThought, renderCodeBlock, textClassName, emptyState,
}) => {
  const boundaryRef = useRef(0);
  const contentRef = useRef('');
  if (!content.startsWith(contentRef.current)) boundaryRef.current = 0;
  contentRef.current = content;

  const displayParts = parts?.length ? [...parts].sort((a, b) => a.ordinal - b.ordinal) : content ? [{ partId: 'legacy-text-0', kind: 'text' as const, ordinal: 0, text: content }] : [];
  let text = displayParts.filter(part => part.kind === 'text').map(part => part.text).join('');
  const reasoningParts = displayParts.filter(part => part.kind === 'reasoning');
  let reasoningText = reasoningParts.reduce((acc, part) => acc + part.text, '');

  if (text.includes('<think>') || text.includes('</think>') || text.toLowerCase().includes('<think')) {
    const parsed = parseMessageThinking(text);
    if (parsed.thought) {
      reasoningText = reasoningText ? `${reasoningText}\n${parsed.thought}` : parsed.thought;
    }
    text = parsed.response;
  }

  const boundary = isStreaming ? stableBoundary(text, boundaryRef.current) : text.length;
  boundaryRef.current = boundary;
  const stable = text.slice(0, boundary);
  const active = text.slice(boundary);

  return <div className="flex flex-col gap-1.5">
    {reasoningText && <>{renderThought(reasoningText, isStreaming)}</>}
    {text && <div className="flex flex-col gap-1">
      {stable && <MessageText content={stable} messageId={`${messageId}-stable`} renderCodeBlock={renderCodeBlock} textClassName={textClassName} />}
      {active && <MessageText content={active} messageId={`${messageId}-active`} renderCodeBlock={renderCodeBlock} textClassName={textClassName} />}
    </div>}
    {!text && isStreaming && emptyState}
  </div>;
};
