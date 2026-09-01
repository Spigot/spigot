import React, { useRef } from 'react';

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
  const parts = content.split(/(```[\s\S]*?```)/g);
  return <>{parts.map((part, index) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const lines = part.split('\n');
      return <React.Fragment key={`code-${index}`}>{renderCodeBlock(lines.slice(1, -1).join('\n'), lines[0].slice(3).trim(), `${messageId}-${index}`)}</React.Fragment>;
    }
    return <span key={`text-${index}`} className={textClassName}>{renderInlineMarkdown(part)}</span>;
  })}</>;
});

function renderInlineMarkdown(text: string): React.ReactNode {
  return text.split(/(\*\*.*?\*\*)/g).map((boldPart, boldIndex) => {
    const value = boldPart.startsWith('**') && boldPart.endsWith('**') ? boldPart.slice(2, -2) : boldPart;
    const inline = value.split(/(`.*?`)/g).map((codePart, codeIndex) => codePart.startsWith('`') && codePart.endsWith('`')
      ? <code key={codeIndex} className="px-1 py-0.5 mx-0.5 rounded bg-editor-hover font-mono text-[11px] border border-editor-border select-all">{codePart.slice(1, -1)}</code>
      : codePart);
    return boldPart.startsWith('**') && boldPart.endsWith('**') ? <strong key={boldIndex} className="font-semibold text-editor-text">{inline}</strong> : <React.Fragment key={boldIndex}>{inline}</React.Fragment>;
  });
}

/** Keeps finalized Markdown blocks mounted while only the active suffix changes. */
export const ProgressiveMessageRenderer: React.FC<ProgressiveMessageRendererProps> = ({
  content, parts, messageId, isStreaming = false, renderThought, renderCodeBlock, textClassName, emptyState,
}) => {
  const boundaryRef = useRef(0);
  const contentRef = useRef('');
  if (!content.startsWith(contentRef.current)) boundaryRef.current = 0;
  contentRef.current = content;

  const displayParts = parts?.length ? [...parts].sort((a, b) => a.ordinal - b.ordinal) : content ? [{ partId: 'legacy-text-0', kind: 'text' as const, ordinal: 0, text: content }] : [];
  const text = displayParts.filter(part => part.kind === 'text').map(part => part.text).join('');
  const boundary = isStreaming ? stableBoundary(text, boundaryRef.current) : text.length;
  boundaryRef.current = boundary;
  const stable = text.slice(0, boundary);
  const active = text.slice(boundary);
  const reasoningParts = displayParts.filter(part => part.kind === 'reasoning');
  const reasoningText = reasoningParts.reduce((acc, part) => acc + part.text, '');

  return <div className="flex flex-col gap-1.5">
    {reasoningText && <>{renderThought(reasoningText, isStreaming)}</>}
    {text && <div className="flex flex-col gap-1">
      {stable && <MessageText content={stable} messageId={`${messageId}-stable`} renderCodeBlock={renderCodeBlock} textClassName={textClassName} />}
      {active && <MessageText content={active} messageId={`${messageId}-active`} renderCodeBlock={renderCodeBlock} textClassName={textClassName} />}
    </div>}
    {!text && isStreaming && emptyState}
  </div>;
};
