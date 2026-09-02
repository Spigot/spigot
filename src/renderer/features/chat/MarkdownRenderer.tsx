import React from 'react';
import { FileCode, Link as LinkIcon } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  renderCodeBlock?: (code: string, language: string, codeId: string) => React.ReactNode;
  textClassName?: string;
  messageId?: string;
}

const FILE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'json', 'md', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h',
  'css', 'scss', 'html', 'yaml', 'yml', 'toml', 'sh', 'bash', 'ps1', 'sql', 'lock',
]);

function isFilePathOrName(text: string): boolean {
  if (text.includes('/') || text.includes('\\')) return true;
  const dotIndex = text.lastIndexOf('.');
  if (dotIndex > 0 && dotIndex < text.length - 1) {
    const ext = text.slice(dotIndex + 1).toLowerCase();
    return FILE_EXTENSIONS.has(ext);
  }
  return false;
}

export function renderInlineMarkdown(text: string): React.ReactNode {
  // 1. Split by Markdown links [label](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const linkSegments: Array<{ type: 'link' | 'text'; text: string; url?: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      linkSegments.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }
    linkSegments.push({ type: 'link', text: match[1], url: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    linkSegments.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return linkSegments.map((segment, segIdx) => {
    if (segment.type === 'link') {
      return (
        <a
          key={`link-${segIdx}`}
          href={segment.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-editor-accent underline hover:opacity-80 transition-opacity"
        >
          <LinkIcon className="w-3 h-3 inline-block" />
          <span>{segment.text}</span>
        </a>
      );
    }

    // 2. Split by standalone file links / bracketed items e.g. [README.md]
    const bracketRegex = /\[([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)\]/g;
    const bracketSegments: Array<{ type: 'file' | 'text'; text: string }> = [];
    let bLastIndex = 0;
    let bMatch: RegExpExecArray | null;

    while ((bMatch = bracketRegex.exec(segment.text)) !== null) {
      if (bMatch.index > bLastIndex) {
        bracketSegments.push({ type: 'text', text: segment.text.slice(bLastIndex, bMatch.index) });
      }
      bracketSegments.push({ type: 'file', text: bMatch[1] });
      bLastIndex = bMatch.index + bMatch[0].length;
    }
    if (bLastIndex < segment.text.length) {
      bracketSegments.push({ type: 'text', text: segment.text.slice(bLastIndex) });
    }

    return bracketSegments.map((bSegment, bIdx) => {
      if (bSegment.type === 'file' || isFilePathOrName(bSegment.text)) {
        if (bSegment.type === 'file') {
          return (
            <span
              key={`file-${segIdx}-${bIdx}`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded bg-editor-active/70 border border-editor-border font-mono text-[11px] text-editor-accent font-medium select-text"
            >
              <FileCode className="w-3 h-3 inline-block text-editor-accent shrink-0" />
              <span>{bSegment.text}</span>
            </span>
          );
        }
      }

      // 3. Split by bold **text**
      const boldParts = bSegment.text.split(/(\*\*.*?\*\*)/g);
      return boldParts.map((boldPart, boldIdx) => {
        const isBold = boldPart.startsWith('**') && boldPart.endsWith('**') && boldPart.length >= 4;
        const innerText = isBold ? boldPart.slice(2, -2) : boldPart;

        // 4. Split by inline code `code`
        const codeParts = innerText.split(/(`.*?`)/g);
        const renderedCode = codeParts.map((codePart, codeIdx) => {
          if (codePart.startsWith('`') && codePart.endsWith('`') && codePart.length >= 2) {
            const rawCode = codePart.slice(1, -1);
            const isFile = isFilePathOrName(rawCode);
            return (
              <code
                key={`c-${codeIdx}`}
                className={`px-1.5 py-0.5 mx-0.5 rounded font-mono text-[11px] border border-editor-border select-text ${
                  isFile
                    ? 'bg-editor-active/60 text-editor-accent border-editor-accent/30 font-medium'
                    : 'bg-editor-hover text-editor-text'
                }`}
              >
                {rawCode}
              </code>
            );
          }

          return (
            <React.Fragment key={`text-${codeIdx}`}>
              {codePart}
            </React.Fragment>
          );
        });

        return isBold ? (
          <strong key={`b-${boldIdx}`} className="font-semibold text-editor-text">
            {renderedCode}
          </strong>
        ) : (
          <React.Fragment key={`b-${boldIdx}`}>{renderedCode}</React.Fragment>
        );
      });
    });
  });
}

function isTableDelimiterRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
  const cells = trimmed.slice(1, -1).split('|');
  return cells.length > 0 && cells.every(cell => /^[\s:-]+$/.test(cell) && cell.includes('-'));
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  renderCodeBlock,
  textClassName = '',
  messageId = 'msg',
}) => {
  // Split blocks: code fences vs regular text
  const blocks = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className={`space-y-2 text-[12.5px] leading-relaxed text-editor-text ${textClassName}`}>
      {blocks.map((block, blockIndex) => {
        if (block.startsWith('```') && block.endsWith('```')) {
          const lines = block.split('\n');
          const language = lines[0].slice(3).trim();
          const code = lines.slice(1, -1).join('\n');
          const codeId = `${messageId}-code-${blockIndex}`;

          if (renderCodeBlock) {
            return <React.Fragment key={`code-block-${blockIndex}`}>{renderCodeBlock(code, language, codeId)}</React.Fragment>;
          }

          return (
            <div key={`code-block-${blockIndex}`} className="my-2 rounded border border-editor-border bg-editor-bg overflow-hidden">
              {language && (
                <div className="px-3 py-1 bg-editor-sidebar border-b border-editor-border text-[10px] font-mono uppercase text-editor-textDark font-semibold">
                  {language}
                </div>
              )}
              <pre className="p-3 font-mono text-[11.5px] overflow-x-auto text-editor-text">
                <code>{code}</code>
              </pre>
            </div>
          );
        }

        // Process non-code text line by line to assemble paragraphs, headings, lists, tables, and rules
        const lines = block.split('\n');
        const elements: React.ReactNode[] = [];
        let i = 0;

        while (i < lines.length) {
          const line = lines[i];
          const trimmed = line.trim();

          // Empty line
          if (!trimmed) {
            i++;
            continue;
          }

          // Horizontal rule
          if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
            elements.push(<hr key={`hr-${i}`} className="my-3 border-editor-border" />);
            i++;
            continue;
          }

          // Headings
          if (trimmed.startsWith('# ') || trimmed.startsWith('## ') || trimmed.startsWith('### ') || trimmed.startsWith('#### ')) {
            const level = trimmed.startsWith('#### ') ? 4 : trimmed.startsWith('### ') ? 3 : trimmed.startsWith('## ') ? 2 : 1;
            const headingText = trimmed.replace(/^#{1,4}\s+/, '');

            if (level === 1) {
              elements.push(
                <h1 key={`h1-${i}`} className="text-[15px] font-bold text-editor-text mt-3.5 mb-1.5 tracking-tight border-b border-editor-border/50 pb-1">
                  {renderInlineMarkdown(headingText)}
                </h1>
              );
            } else if (level === 2) {
              elements.push(
                <h2 key={`h2-${i}`} className="text-[14px] font-semibold text-editor-text mt-3 mb-1 tracking-tight">
                  {renderInlineMarkdown(headingText)}
                </h2>
              );
            } else if (level === 3) {
              elements.push(
                <h3 key={`h3-${i}`} className="text-[13px] font-semibold text-editor-text mt-2.5 mb-1">
                  {renderInlineMarkdown(headingText)}
                </h3>
              );
            } else {
              elements.push(
                <h4 key={`h4-${i}`} className="text-[12px] font-semibold text-editor-text mt-2 mb-0.5">
                  {renderInlineMarkdown(headingText)}
                </h4>
              );
            }
            i++;
            continue;
          }

          // Blockquote
          if (trimmed.startsWith('>')) {
            const quoteLines: string[] = [];
            while (i < lines.length && lines[i].trim().startsWith('>')) {
              quoteLines.push(lines[i].trim().replace(/^>\s*/, ''));
              i++;
            }
            elements.push(
              <blockquote key={`quote-${i}`} className="border-l-2 border-editor-accent pl-3 py-1 my-1.5 italic text-editor-textDark bg-editor-sidebar/30 rounded-r text-[12px]">
                {renderInlineMarkdown(quoteLines.join(' '))}
              </blockquote>
            );
            continue;
          }

          // Tables
          if (trimmed.startsWith('|') && trimmed.endsWith('|') && i + 1 < lines.length && isTableDelimiterRow(lines[i + 1])) {
            const headerCells = trimmed.slice(1, -1).split('|').map(c => c.trim());
            i += 2; // skip header and delimiter

            const rows: string[][] = [];
            while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
              const rowCells = lines[i].trim().slice(1, -1).split('|').map(c => c.trim());
              rows.push(rowCells);
              i++;
            }

            elements.push(
              <div key={`table-${i}`} className="my-2.5 overflow-x-auto rounded-md border border-editor-border bg-editor-bg shadow-sm">
                <table className="w-full text-left text-[11.5px] border-collapse">
                  <thead className="bg-editor-sidebar border-b border-editor-border text-editor-text font-semibold">
                    <tr>
                      {headerCells.map((cell, cIdx) => (
                        <th key={`th-${cIdx}`} className="px-3 py-1.5 border-r border-editor-border last:border-r-0 font-medium">
                          {renderInlineMarkdown(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-editor-border text-editor-text">
                    {rows.map((row, rIdx) => (
                      <tr key={`tr-${rIdx}`} className="hover:bg-editor-hover/40 transition-colors">
                        {row.map((cell, cIdx) => (
                          <td key={`td-${rIdx}-${cIdx}`} className="px-3 py-1.5 border-r border-editor-border last:border-r-0">
                            {renderInlineMarkdown(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
            continue;
          }

          // Unordered list (bullets)
          if (/^(\s*)[-*•]\s+/.test(line)) {
            const listItems: Array<{ indent: number; text: string }> = [];
            while (i < lines.length && /^(\s*)[-*•]\s+/.test(lines[i])) {
              const match = lines[i].match(/^(\s*)[-*•]\s+(.*)$/);
              if (match) {
                listItems.push({ indent: match[1].length, text: match[2] });
              }
              i++;
            }

            elements.push(
              <ul key={`ul-${i}`} className="space-y-1 my-1 pl-4 list-disc text-editor-text leading-relaxed">
                {listItems.map((item, lIdx) => (
                  <li key={`li-${lIdx}`} className={item.indent > 1 ? 'ml-4 list-[circle] text-editor-textDark' : ''}>
                    {renderInlineMarkdown(item.text)}
                  </li>
                ))}
              </ul>
            );
            continue;
          }

          // Ordered list (numbers)
          if (/^(\s*)\d+\.\s+/.test(line)) {
            const listItems: Array<{ text: string }> = [];
            while (i < lines.length && /^(\s*)\d+\.\s+/.test(lines[i])) {
              const match = lines[i].match(/^(\s*)\d+\.\s+(.*)$/);
              if (match) {
                listItems.push({ text: match[2] });
              }
              i++;
            }

            elements.push(
              <ol key={`ol-${i}`} className="space-y-1 my-1 pl-4 list-decimal text-editor-text leading-relaxed">
                {listItems.map((item, lIdx) => (
                  <li key={`oli-${lIdx}`}>
                    {renderInlineMarkdown(item.text)}
                  </li>
                ))}
              </ol>
            );
            continue;
          }

          // Regular paragraph lines
          const paragraphLines: string[] = [];
          while (
            i < lines.length &&
            lines[i].trim() &&
            !lines[i].trim().startsWith('#') &&
            !lines[i].trim().startsWith('>') &&
            !(lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) &&
            !/^(\s*)[-*•]\s+/.test(lines[i]) &&
            !/^(\s*)\d+\.\s+/.test(lines[i]) &&
            lines[i].trim() !== '---' &&
            lines[i].trim() !== '***'
          ) {
            paragraphLines.push(lines[i]);
            i++;
          }

          if (paragraphLines.length > 0) {
            elements.push(
              <p key={`p-${i}`} className="my-1.5 leading-relaxed">
                {renderInlineMarkdown(paragraphLines.join('\n'))}
              </p>
            );
          }
        }

        return <React.Fragment key={`block-${blockIndex}`}>{elements}</React.Fragment>;
      })}
    </div>
  );
};
