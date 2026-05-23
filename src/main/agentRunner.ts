import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ==========================================
// 1. Tool Schemas & Unified Definitions
// ==========================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'list_dir',
    description: 'Lists all files and directories in a given folder of the workspace. Useful for discovering project structure.',
    parameters: {
      type: 'object',
      properties: {
        dirPath: {
          type: 'string',
          description: 'Relative or absolute directory path to list. Defaults to the workspace root if not provided.'
        }
      }
    }
  },
  {
    name: 'read_file',
    description: 'Reads the full or partial content of a text file in the workspace. Supports startLine and endLine for large files.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute or relative path to the file to read.'
        },
        startLine: {
          type: 'number',
          description: '1-indexed line number to start reading from (inclusive).'
        },
        endLine: {
          type: 'number',
          description: '1-indexed line number to end reading at (inclusive).'
        }
      },
      required: ['filePath']
    }
  },
  {
    name: 'write_file',
    description: 'Creates a new file or overwrites an existing file in the workspace with new content.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute or relative path to the file to write.'
        },
        content: {
          type: 'string',
          description: 'The full string content to write into the file.'
        }
      },
      required: ['filePath', 'content']
    }
  },
  {
    name: 'run_command',
    description: 'Executes a terminal/shell command inside the active workspace directory. Useful for builds, tests, or compiling.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command line string to run (e.g. "npm test", "git log").'
        }
      },
      required: ['command']
    }
  },
  {
    name: 'git_status',
    description: 'Runs "git status" to show modified, untracked, or staged files in the workspace.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'git_diff',
    description: 'Runs "git diff" to inspect detailed code changes in the active workspace.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Optional file path to inspect specific changes.'
        }
      }
    }
  },
  {
    name: 'grep_search',
    description: 'Performs a recursive textual search (regex or exact) inside files in the workspace, similar to grep/ripgrep.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The query string or regex pattern to search for.'
        },
        dirPath: {
          type: 'string',
          description: 'Optional directory path to search. Defaults to workspace root.'
        }
      },
      required: ['pattern']
    }
  }
];

// ==========================================
// 2. Mappers to API-specific formats
// ==========================================

function getAnthropicTools() {
  return TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters
  }));
}

function getOpenAITools() {
  return TOOLS.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }));
}

function getGeminiTools() {
  return [
    {
      functionDeclarations: TOOLS.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }))
    }
  ];
}

// ==========================================
// 3. Tool Implementations (Backend Node Exec)
// ==========================================

async function executeTool(
  name: string,
  args: any,
  workspacePath: string
): Promise<string> {
  const resolvePath = (p: string) => {
    if (!p) return workspacePath;
    if (path.isAbsolute(p)) return p;
    return path.resolve(workspacePath, p);
  };

  try {
    switch (name) {
      case 'list_dir': {
        const dir = resolvePath(args.dirPath || '.');
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const items = entries.map(e => ({
          name: e.name,
          type: e.isDirectory() ? 'directory' : 'file',
          sizeBytes: e.isFile() ? 'unknown' : undefined
        }));
        return JSON.stringify({ success: true, path: dir, items }, null, 2);
      }

      case 'read_file': {
        const file = resolvePath(args.filePath);
        let content = await fs.readFile(file, 'utf-8');
        
        // Handle line slice if startLine or endLine are specified
        const start = args.startLine ? Number(args.startLine) : 1;
        const end = args.endLine ? Number(args.endLine) : undefined;
        
        if (start > 1 || end !== undefined) {
          const lines = content.split('\n');
          const sliced = lines.slice(start - 1, end);
          content = sliced.join('\n') + `\n[Mostrando líneas ${start} a ${end || lines.length} de ${lines.length}]`;
        }
        
        return content;
      }

      case 'write_file': {
        const file = resolvePath(args.filePath);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, args.content, 'utf-8');
        return `Archivo creado/escrito exitosamente en: ${file}`;
      }

      case 'run_command': {
        const { stdout, stderr } = await execAsync(args.command, {
          cwd: workspacePath,
          timeout: 45000 // 45 seconds timeout
        });
        return `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`;
      }

      case 'git_status': {
        const { stdout, stderr } = await execAsync('git status', { cwd: workspacePath });
        return stdout || stderr || 'No hay cambios en git.';
      }

      case 'git_diff': {
        const cmd = args.filePath ? `git diff "${args.filePath}"` : 'git diff';
        const { stdout, stderr } = await execAsync(cmd, { cwd: workspacePath });
        return stdout || stderr || 'No hay diferencias actuales.';
      }

      case 'grep_search': {
        const searchDir = resolvePath(args.dirPath || '.');
        const results: Array<{ file: string; line: number; text: string }> = [];
        const patternRegex = new RegExp(args.pattern, 'i');

        async function walk(dir: string) {
          // Skip node_modules and .git
          if (dir.includes('node_modules') || dir.includes('.git') || dir.includes('dist')) {
            return;
          }
          const list = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of list) {
            const fullPath = path.resolve(dir, entry.name);
            if (entry.isDirectory()) {
              await walk(fullPath);
            } else if (entry.isFile()) {
              // Only search text files (heuristic)
              if (/\.(ts|tsx|js|jsx|json|md|css|html|txt|go|py|rs|yml|yaml)$/i.test(entry.name)) {
                try {
                  const text = await fs.readFile(fullPath, 'utf-8');
                  const lines = text.split('\n');
                  for (let i = 0; i < lines.length; i++) {
                    if (patternRegex.test(lines[i])) {
                      results.push({
                        file: path.relative(workspacePath, fullPath),
                        line: i + 1,
                        text: lines[i].trim()
                      });
                      if (results.length > 100) return; // Cap results at 100
                    }
                  }
                } catch (err) {}
              }
            }
          }
        }

        await walk(searchDir);
        return JSON.stringify({ success: true, count: results.length, matches: results }, null, 2);
      }

      default:
        throw new Error(`Herramienta no implementada: ${name}`);
    }
  } catch (err: any) {
    return `ERROR ejecutando la herramienta '${name}': ${err.message || err}`;
  }
}

// ==========================================
// Helper function to prune contextText and chat history based on provider constraints
function pruneContextAndHistory(
  context: string | null,
  historyMessages: any[],
  currentPrompt: string,
  providerName: string,
  modelName: string
): { prunedContext: string | null; prunedHistory: any[] } {
  const prov = (providerName || '').toLowerCase().trim();
  const mdl = (modelName || '').toLowerCase().trim();
  
  // Set budget in characters.
  // MiniMax has a strict limit around ~2000 tokens (approx 6000-8000 chars total request size) on its trial keys.
  // However, its premium model MiniMax-M2.7 supports 204,800 tokens.
  // To get the absolute best out of high-context models, we set the budget dynamically:
  // - For MiniMax large context models (M2.7, M2.5, text-01), we set a massive budget of 600,000 characters (~150,000 tokens).
  // - For standard MiniMax keys/models that might be trial/restricted, we use a 5,200 character fallback limit.
  // - For all other standard providers, we use a generous safe threshold of 100,000 characters.
  let budget = 100000;
  
  if (prov === 'minimax') {
    if (mdl.includes('m2.7') || mdl.includes('m2.5') || mdl.includes('text-01')) {
      budget = 600000; // ~150,000 tokens (leaving plenty of room for 204.8k limits)
    } else {
      budget = 5200; // Safe trial fallback
    }
  }
  
  const basicOverhead = currentPrompt.length + 800; // Account for tools, system template, prompt wrapper
  let availableForContextAndHistory = budget - basicOverhead;
  if (availableForContextAndHistory < 1000) {
    availableForContextAndHistory = 1000; // Give a minimum floor if prompt itself is huge
  }

  let prunedContext = context;
  let prunedHistory = [...historyMessages];

  // 1. Prune file contents in the context first if it exceeds budget
  if (prunedContext && prunedContext.length > 0) {
    if (prunedContext.length > availableForContextAndHistory * 0.7) {
      const parts = prunedContext.split('--- ARCHIVO: ');
      const header = parts[0];
      const fileParts = parts.slice(1);
      
      const targetContextSize = Math.floor(availableForContextAndHistory * 0.6);
      let accumulatedContext = header;
      
      const numFiles = fileParts.length;
      if (numFiles > 0) {
        // Distribute remaining characters fairly among files
        const fairShare = Math.max(400, Math.floor((targetContextSize - header.length) / numFiles));
        
        for (const part of fileParts) {
          const match = part.match(/(.*?) ---\n([\s\S]*)/);
          if (match) {
            const filePath = match[1];
            const fileContent = match[2];
            
            if (fileContent.length > fairShare) {
              const truncatedContent = fileContent.slice(0, fairShare) + 
                `\n\n[... CONTENIDO TRUNCADO POR LÍMITE DE CONTEXTO DE ${prov === 'minimax' ? 'MINIMAX (2K)' : 'IA'} ...]`;
              accumulatedContext += `--- ARCHIVO: ${filePath} ---\n${truncatedContent}\n`;
            } else {
              accumulatedContext += `--- ARCHIVO: ${filePath} ---\n${fileContent}\n`;
            }
          } else {
            accumulatedContext += `--- ARCHIVO: ${part}`;
          }
        }
      }
      prunedContext = accumulatedContext;
    }
  }

  // 2. Prune history if total size still exceeds the available budget
  const getHistorySize = (history: any[]) => history.reduce((sum, m) => sum + (m.content || '').length, 0);
  const contextLength = prunedContext ? prunedContext.length : 0;

  while (prunedHistory.length > 0 && (contextLength + getHistorySize(prunedHistory) > availableForContextAndHistory)) {
    // Drop the oldest message from the history to keep total size safe
    prunedHistory.shift();
  }

  return { prunedContext, prunedHistory };
}

// ==========================================
// 4. Recursive Agent Loop
// ==========================================

export async function runAgentLoop({
  provider,
  model,
  apiKey,
  prompt,
  contextText,
  history,
  image: _image,
  workspacePath,
  sendChunk,
  sendError,
  sendEnd,
  signal
}: {
  provider: string;
  model: string;
  apiKey: string;
  prompt: string;
  contextText: string | null;
  history: any[];
  image: string | null;
  workspacePath: string;
  sendChunk: (chunk: string) => void;
  sendError: (err: string) => void;
  sendEnd: (aborted?: boolean) => void;
  signal: AbortSignal;
}): Promise<boolean> {
  let turn = 0;
  const maxTurns = 8;

  // Standardize historical conversation messages for tool execution context
  const rawHistory = (history || []).map((msg: any) => {
    return {
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
      ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
      ...(msg.tool_results && { tool_results: msg.tool_results })
    };
  });

  // Prune history and context text dynamically to satisfy strict token/context limits (especially for MiniMax)
  const { prunedContext: activeContext, prunedHistory } = pruneContextAndHistory(
    contextText,
    rawHistory,
    prompt,
    provider,
    model
  );

  let messages = prunedHistory;

  const fullUserPrompt = activeContext
    ? `=== CONTEXTO DEL PROYECTO ===\n${activeContext}\n\n=== FIN CONTEXTO ===\n\nPregunta / Instrucción del usuario:\n${prompt}`
    : prompt;

  messages.push({ role: 'user', content: fullUserPrompt });

  // Inform the user inside thoughts if context was pruned
  if (contextText && activeContext && activeContext.length < contextText.length) {
    const isLargeContextModel = model.toLowerCase().includes('m2.7') || model.toLowerCase().includes('m2.5') || model.toLowerCase().includes('text-01');
    const modelLimitMsg = provider === 'minimax'
      ? (isLargeContextModel ? 'MiniMax 150K Limit' : 'MiniMax 2K Limit')
      : 'Límite de seguridad';
    sendChunk(`<think>\n⚠️ El contexto del proyecto fue optimizado y recortado para ajustarse al límite de tokens del proveedor (${modelLimitMsg}).\n</think>\n`);
  }

  while (turn < maxTurns) {
    if (signal.aborted) {
      sendEnd(true);
      return false;
    }

    turn++;

    try {
      let url = '';
      let headers: Record<string, string> = { 'Content-Type': 'application/json' };
      let body: any = {};

      // Prepare Tool Schemas for API call
      const anthropicTools = getAnthropicTools();
      const openAITools = getOpenAITools();
      const geminiTools = getGeminiTools();

      // Format messages based on API requirements
      let formattedMessages = messages.map(m => {
        // Simple mapping for LLMs
        if (m.tool_results) {
          // Anthropic and OpenAI support tool response representations
          return m;
        }
        return {
          role: m.role,
          content: m.content
        };
      });

      const prov = (provider || '').toLowerCase().trim();

      if (prov === 'openai' || prov === 'deepseek' || prov === 'qwen' || prov === 'kimi' || prov === 'openrouter' || prov === 'minimax') {
        url = prov === 'deepseek' ? 'https://api.deepseek.com/chat/completions' :
              prov === 'kimi' ? 'https://api.moonshot.cn/v1/chat/completions' :
              prov === 'qwen' ? 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' :
              prov === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' :
              prov === 'minimax' ? 'https://api.minimax.io/v1/chat/completions' :
              'https://api.openai.com/v1/chat/completions';

        headers['Authorization'] = `Bearer ${apiKey}`;
        if (prov === 'openrouter') {
          headers['HTTP-Referer'] = 'https://spigot.gentleman.com';
          headers['X-Title'] = 'Spigot';
        }

        body = {
          model,
          messages: formattedMessages.map(m => {
            if (m.role === 'tool') return m;
            if (m.tool_calls) {
              return {
                role: 'assistant',
                content: m.content || null,
                tool_calls: m.tool_calls
              };
            }
            return { role: m.role, content: m.content };
          }),
          tools: openAITools,
          tool_choice: 'auto',
          stream: true
        };
      } else if (prov === 'anthropic') {
        url = 'https://api.anthropic.com/v1/messages';
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        body = {
          model,
          messages: formattedMessages.map(m => {
            if (m.tool_results) {
              return {
                role: 'user',
                content: m.tool_results.map((r: any) => ({
                  type: 'tool_result',
                  tool_use_id: r.tool_use_id,
                  content: r.content
                }))
              };
            }
            if (m.tool_calls) {
              return {
                role: 'assistant',
                content: [
                  { type: 'text', text: m.content || '' },
                  ...m.tool_calls.map((c: any) => ({
                    type: 'tool_use',
                    id: c.id,
                    name: c.name,
                    input: c.input
                  }))
                ]
              };
            }
            return { role: m.role, content: m.content };
          }),
          tools: anthropicTools,
          max_tokens: 4000,
          stream: true
        };
      } else if (prov === 'gemini') {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`;
        // Map history to gemini format
        const contents = formattedMessages.map(m => {
          if (m.tool_results) {
            return {
              role: 'user',
              parts: m.tool_results.map((r: any) => ({
                functionResponse: {
                  name: r.name,
                  response: { result: r.content }
                }
              }))
            };
          }
          if (m.tool_calls) {
            return {
              role: 'model',
              parts: [
                { text: m.content || '' },
                ...m.tool_calls.map((c: any) => ({
                  functionCall: {
                    name: c.name,
                    args: c.input
                  }
                }))
              ]
            };
          }
          return {
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          };
        });

        body = {
          contents,
          tools: geminiTools
        };
      }

      // Safe fallback if URL is empty due to unmapped provider
      if (!url) {
        url = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = {
          model,
          messages: formattedMessages.map(m => {
            if (m.role === 'tool') return m;
            if (m.tool_calls) {
              return {
                role: 'assistant',
                content: m.content || null,
                tool_calls: m.tool_calls
              };
            }
            return { role: m.role, content: m.content };
          }),
          tools: openAITools,
          tool_choice: 'auto',
          stream: true
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API returned HTTP ${response.status}: ${errText}`);
      }

      if (!response.body) {
        throw new Error('Response body is empty');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      let textContent = '';
      let toolCalls: any[] = [];
      let currentToolCall: any = null;

      // Temporary variables for Anthropic/OpenAI parser

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (provider === 'anthropic') {
            if (trimmed.startsWith('data: ')) {
              try {
                const dataStr = trimmed.slice(6);
                if (dataStr.trim() === '[DONE]') continue;
                const parsed = JSON.parse(dataStr);
                
                if (parsed.type === 'content_block_start') {
                  if (parsed.content_block?.type === 'tool_use') {
                    currentToolCall = {
                      id: parsed.content_block.id,
                      name: parsed.content_block.name,
                      input: ''
                    };
                  }
                } else if (parsed.type === 'content_block_delta') {
                  if (parsed.delta?.text) {
                    textContent += parsed.delta.text;
                    sendChunk(parsed.delta.text);
                  } else if (parsed.delta?.partial_json) {
                    if (currentToolCall) {
                      currentToolCall.input += parsed.delta.partial_json;
                    }
                  }
                } else if (parsed.type === 'content_block_stop') {
                  if (currentToolCall) {
                    try {
                      currentToolCall.input = JSON.parse(currentToolCall.input);
                    } catch (e) {}
                    toolCalls.push(currentToolCall);
                    currentToolCall = null;
                  }
                }
              } catch (e) {}
            }
          } else if (provider === 'gemini') {
            try {
              const cleanLine = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
              const parsed = JSON.parse(cleanLine);
              const part = parsed.candidates?.[0]?.content?.parts?.[0];
              if (part?.text) {
                textContent += part.text;
                sendChunk(part.text);
              }
              if (part?.functionCall) {
                toolCalls.push({
                  id: `gemini-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                  name: part.functionCall.name,
                  input: part.functionCall.args || {}
                });
              }
            } catch (e) {}
          } else {
            // OpenAI, DeepSeek, Qwen compatible
            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6);
              if (dataStr.trim() === '[DONE]') continue;
              try {
                const parsed = JSON.parse(dataStr);
                const choice = parsed.choices?.[0];
                const delta = choice?.delta;
                
                if (delta?.content) {
                  textContent += delta.content;
                  sendChunk(delta.content);
                }

                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    if (tc.id) {
                      if (currentToolCall) {
                        try { currentToolCall.input = JSON.parse(currentToolCall.input); } catch(e){}
                        toolCalls.push(currentToolCall);
                      }
                      currentToolCall = {
                        id: tc.id,
                        name: tc.function.name,
                        input: tc.function.arguments || ''
                      };
                    } else if (tc.function?.arguments) {
                      if (currentToolCall) {
                        currentToolCall.input += tc.function.arguments;
                      }
                    }
                  }
                }
              } catch (e) {}
            }
          }
        }
      }

      // Close the last tool call if OpenAI compatible
      if (currentToolCall) {
        try {
          currentToolCall.input = JSON.parse(currentToolCall.input);
        } catch (e) {}
        toolCalls.push(currentToolCall);
        currentToolCall = null;
      }

      // Save this turn's response to memory
      const assistantMessage: any = {
        role: 'assistant',
        content: textContent
      };

      if (toolCalls.length > 0) {
        // Append tool calls representation
        assistantMessage.tool_calls = toolCalls.map(tc => ({
          id: tc.id,
          name: tc.name,
          input: tc.input
        }));
      }

      messages.push(assistantMessage);

      // ==========================================
      // 5. Tool Execution & Feed Back Loop
// ==========================================
      if (toolCalls.length > 0) {
        const results: any[] = [];
        
        // Show tool execution start in thinking tags inside chat
        sendChunk(`\n<think>\n`);
        
        for (const tc of toolCalls) {
          sendChunk(`🔧 Ejecutando herramienta \`${tc.name}\` en el workspace...\n`);
          
          const resultStr = await executeTool(tc.name, tc.input, workspacePath);
          results.push({
            tool_use_id: tc.id,
            name: tc.name,
            content: resultStr
          });

          sendChunk(`✅ Herramienta \`${tc.name}\` completada.\n`);
        }

        sendChunk(`</think>\n`);

        // Append the tool results
        messages.push({
          role: 'user', // In OpenAI, this is a separate 'tool' role, but we unify it
          content: 'Resultados de las herramientas ejecutadas.',
          tool_results: results
        });

        // Continue to the next turn in the loop!
      } else {
        // No tool calls requested, we are done!
        sendEnd();
        return true;
      }
    } catch (err: any) {
      console.error('Error in agent runner loop:', err);
      sendError(err.message || 'Error executing agent loop API call.');
      sendEnd();
      return false;
    }
  }

  // Cap turns exceeded
  sendChunk('\n\n*Límite de turnos del agente alcanzado sin una respuesta definitiva.*');
  sendEnd();
  return false;
}
