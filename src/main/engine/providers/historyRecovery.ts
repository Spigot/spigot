import type { ToolResult, UnifiedMessage } from './types';

export const SYNTHETIC_TOOL_CANCEL_MESSAGE = '[Tool execution was cancelled or interrupted]';

/**
 * Checks if the message history contains assistant tool_calls without corresponding tool responses.
 */
export function hasUnresolvedToolCalls(messages: UnifiedMessage[]): boolean {
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const resolvedIds = new Set<string>();

      // Look ahead for matching tool results
      for (let j = i + 1; j < messages.length; j++) {
        const nextMsg = messages[j];
        if (nextMsg.role === 'assistant') {
          // Reached next assistant turn, stop searching
          break;
        }
        if (nextMsg.role === 'tool' && nextMsg.tool_call_id) {
          resolvedIds.add(nextMsg.tool_call_id);
        }
        if (Array.isArray(nextMsg.tool_results)) {
          for (const result of nextMsg.tool_results) {
            if (result.tool_use_id) {
              resolvedIds.add(result.tool_use_id);
            }
          }
        }
      }

      for (const tc of msg.tool_calls) {
        if (!resolvedIds.has(tc.id)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Validates message history and injects synthetic cancellation tool responses
 * for any dangling assistant tool calls to prevent API 400 errors.
 */
export function recoverMessageHistory(messages: UnifiedMessage[]): UnifiedMessage[] {
  const recovered: UnifiedMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const currentMsg = { ...messages[i] };
    recovered.push(currentMsg);

    if (
      currentMsg.role === 'assistant' &&
      Array.isArray(currentMsg.tool_calls) &&
      currentMsg.tool_calls.length > 0
    ) {
      const toolCalls = currentMsg.tool_calls;
      const nextMsg = i + 1 < messages.length ? messages[i + 1] : undefined;

      // Check if next message already provides some or all tool results
      if (nextMsg && Array.isArray(nextMsg.tool_results)) {
        const existingResultIds = new Set(
          nextMsg.tool_results.map(r => r.tool_use_id).filter(Boolean)
        );

        const missingCalls = toolCalls.filter(tc => !existingResultIds.has(tc.id));
        if (missingCalls.length > 0) {
          // Fill in missing tool results in next message
          const syntheticResults: ToolResult[] = missingCalls.map(tc => ({
            tool_use_id: tc.id,
            name: tc.name,
            content: SYNTHETIC_TOOL_CANCEL_MESSAGE,
          }));

          messages[i + 1] = {
            ...nextMsg,
            tool_results: [...nextMsg.tool_results, ...syntheticResults],
          };
        }
      } else {
        // Next message is missing or does not have tool_results (e.g. next user prompt or end of history)
        const syntheticResults: ToolResult[] = toolCalls.map(tc => ({
          tool_use_id: tc.id,
          name: tc.name,
          content: SYNTHETIC_TOOL_CANCEL_MESSAGE,
        }));

        recovered.push({
          role: 'user',
          content: 'Resultados de las herramientas ejecutadas. (Ejecución interrumpida)',
          tool_results: syntheticResults,
        });
      }
    }
  }

  return recovered;
}
