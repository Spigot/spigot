export interface ParsedMessage {
  thought: string;
  response: string;
  isThinking: boolean;
}

interface Fence {
  character: '`' | '~';
  length: number;
}

const STREAMING_OPEN_TAG_PREFIXES = new Set(['<', '<t', '<th', '<thi', '<thin', '<think']);

function trimHorizontalWhitespace(line: string): string {
  let start = 0;
  let end = line.length;

  while (line[start] === ' ' || line[start] === '\t') start += 1;
  while (end > start && (line[end - 1] === ' ' || line[end - 1] === '\t')) end -= 1;

  return line.slice(start, end);
}

function readFence(line: string): Fence | null {
  let index = 0;
  while (index < line.length && index < 4 && line[index] === ' ') index += 1;
  if (index > 3) return null;

  const character = line[index];
  if (character !== '`' && character !== '~') return null;

  const runStart = index;
  while (line[index] === character) index += 1;
  const length = index - runStart;
  if (length < 3) return null;
  if (character === '`' && line.slice(index).includes('`')) return null;

  return { character, length };
}

function closesFence(line: string, fence: Fence): boolean {
  const candidate = readFence(line);
  if (!candidate || candidate.character !== fence.character || candidate.length < fence.length) {
    return false;
  }

  let index = 0;
  while (line[index] === ' ') index += 1;
  index += candidate.length;

  return trimHorizontalWhitespace(line.slice(index)) === '';
}

export function parseMessageThinking(content: string): ParsedMessage {
  const thoughts: string[] = [];
  const responses: string[] = [];
  let isThinking = false;
  let segmentStart = 0;
  let lineStart = 0;
  let fence: Fence | null = null;

  const addSegment = (segment: string, destination: 'thought' | 'response') => {
    const trimmed = segment.trim();
    if (!trimmed) return;
    (destination === 'thought' ? thoughts : responses).push(trimmed);
  };

  while (lineStart < content.length) {
    const newlineIndex = content.indexOf('\n', lineStart);
    const nextLineStart = newlineIndex === -1 ? content.length : newlineIndex + 1;
    const hasCarriageReturn = newlineIndex !== -1 && content[newlineIndex - 1] === '\r';
    const lineEnd = newlineIndex === -1 ? content.length : newlineIndex - (hasCarriageReturn ? 1 : 0);
    const line = content.slice(lineStart, lineEnd);

    if (fence) {
      if (closesFence(line, fence)) fence = null;
      lineStart = nextLineStart;
      continue;
    }

    const openingFence = readFence(line);
    if (openingFence) {
      fence = openingFence;
      lineStart = nextLineStart;
      continue;
    }

    const boundaryToken = trimHorizontalWhitespace(line).toLowerCase();
    const lowerLine = line.toLowerCase();
    const openIdx = lowerLine.indexOf('<think>');
    const closeIdx = lowerLine.indexOf('</think>');

    if (openIdx !== -1 && closeIdx !== -1 && closeIdx > openIdx && !boundaryToken.includes('`')) {
      addSegment(content.slice(segmentStart, lineStart + openIdx), isThinking ? 'thought' : 'response');
      addSegment(line.slice(openIdx + '<think>'.length, closeIdx), 'thought');
      isThinking = false;
      segmentStart = lineStart + closeIdx + '</think>'.length;
      const remaining = line.slice(closeIdx + '</think>'.length);
      if (trimHorizontalWhitespace(remaining) === '') {
        segmentStart = nextLineStart;
        lineStart = nextLineStart;
        continue;
      }
    } else if (isThinking) {
      if (closeIdx !== -1) {
        addSegment(content.slice(segmentStart, lineStart + closeIdx), 'thought');
        isThinking = false;
        segmentStart = lineStart + closeIdx + '</think>'.length;
        const remaining = line.slice(closeIdx + '</think>'.length);
        if (trimHorizontalWhitespace(remaining) === '') {
          segmentStart = nextLineStart;
          lineStart = nextLineStart;
          continue;
        }
      }
    } else {
      const isStandaloneOpen = boundaryToken === '<think>';
      const isStandaloneClose = boundaryToken === '</think>';
      const isLineEndingClose = boundaryToken.endsWith('</think>') && !boundaryToken.includes('`');
      const isLineStartingOpen = boundaryToken.startsWith('<think>') && !boundaryToken.includes('`');

      if (isStandaloneClose || isLineEndingClose) {
        addSegment(content.slice(segmentStart, lineStart + closeIdx), 'thought');
        isThinking = false;
        segmentStart = lineStart + closeIdx + '</think>'.length;
        const remaining = line.slice(closeIdx + '</think>'.length);
        if (trimHorizontalWhitespace(remaining) === '') {
          segmentStart = nextLineStart;
          lineStart = nextLineStart;
          continue;
        }
      } else if (isStandaloneOpen || isLineStartingOpen) {
        addSegment(content.slice(segmentStart, lineStart + openIdx), 'response');
        isThinking = true;
        segmentStart = lineStart + openIdx + '<think>'.length;
        const remaining = line.slice(openIdx + '<think>'.length);
        if (trimHorizontalWhitespace(remaining) === '') {
          segmentStart = nextLineStart;
          lineStart = nextLineStart;
          continue;
        }
      } else {
        const isTrailingLine = newlineIndex === -1;
        if (isTrailingLine && STREAMING_OPEN_TAG_PREFIXES.has(boundaryToken)) {
          addSegment(content.slice(segmentStart, lineStart), 'response');
          segmentStart = content.length;
        }
      }
    }

    lineStart = nextLineStart;
  }

  addSegment(content.slice(segmentStart), isThinking ? 'thought' : 'response');

  return {
    thought: thoughts.join('\n'),
    response: responses.join('\n\n'),
    isThinking,
  };
}
