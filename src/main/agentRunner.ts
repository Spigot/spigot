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

const SYSTEM_PROMPT = `You are Spigot, an expert autonomous AI software engineer integrated directly into the Spigot code editor.
You have tools to explore, search, read, surgically edit, create files, and execute terminal commands in the active workspace.

Key Instructions:
1. CODE EDITING & FILE CREATION:
   - When asked to write, create, implement, refactor, or fix code, ALWAYS execute the changes directly using your tools.
   - DO NOT merely state your intent or narrate what you are about to do without calling tools. Invoke the appropriate tool ('write_file' or 'edit_file') IMMEDIATELY in the same turn to perform the action.
   - Use 'write_file' to create new files or write complete scripts.
   - Use 'edit_file' for surgical modifications: provide the exact 'oldString' and 'newString'.
   - Use 'read_file', 'grep_search', or 'glob_search' first if you need to inspect existing code before editing.
   - Once a file is created or modified with 'write_file' or 'edit_file', your task is COMPLETE. DO NOT call the same write tool again for the same file.
2. VERIFICATION & EXECUTION:
   - You can use 'run_command' to run tests, typechecks, linters, or build scripts to verify your changes.
3. CONCISENESS & COMPLETION:
   - Keep responses direct and concise. After executing your tools, provide a brief summary of what was accomplished and finish.`;

const TOOLS: ToolDefinition[] = [
  {
    name: 'edit_file',
    description: 'Surgically edits a file by replacing an exact snippet of code (oldString) with new code (newString). Always inspect or read the file first with read_file to ensure oldString matches accurately.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute or relative path to the file to edit in the workspace.'
        },
        oldString: {
          type: 'string',
          description: 'The exact snippet of code in the file to be replaced.'
        },
        newString: {
          type: 'string',
          description: 'The new code to replace oldString with.'
        },
        replaceAll: {
          type: 'boolean',
          description: 'If true, replaces all occurrences of oldString in the file. Defaults to false.'
        }
      },
      required: ['filePath', 'oldString', 'newString']
    }
  },
  {
    name: 'glob_search',
    description: 'Finds files in the workspace matching a glob pattern (e.g. "**/*.tsx", "src/components/*.ts"). Excludes node_modules, .git, and dist folders.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern to search for (e.g. "**/*.ts", "*.json", "src/**").'
        },
        dirPath: {
          type: 'string',
          description: 'Optional directory path to search within. Defaults to workspace root.'
        }
      },
      required: ['pattern']
    }
  },
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
// 3. String & File Edit Helpers
// ==========================================

export function normalizeQuotes(str: string): string {
  return str
    .replaceAll('‘', "'")
    .replaceAll('’', "'")
    .replaceAll('“', '"')
    .replaceAll('”', '"');
}

export function findAndReplaceContent(
  fileContent: string,
  oldString: string,
  newString: string,
  replaceAll: boolean = false
): { updatedContent: string; count: number } {
  if (!oldString) {
    throw new Error('El parámetro oldString no puede estar vacío.');
  }

  // 1. Direct exact match
  if (fileContent.includes(oldString)) {
    if (replaceAll) {
      const parts = fileContent.split(oldString);
      return { updatedContent: parts.join(newString), count: parts.length - 1 };
    }
    const idx = fileContent.indexOf(oldString);
    return {
      updatedContent: fileContent.substring(0, idx) + newString + fileContent.substring(idx + oldString.length),
      count: 1
    };
  }

  // 2. Line-ending normalization (CRLF <-> LF)
  const normalizedFile = fileContent.replaceAll('\r\n', '\n');
  const normalizedOld = oldString.replaceAll('\r\n', '\n');
  const normalizedNew = newString.replaceAll('\r\n', '\n');

  if (normalizedFile.includes(normalizedOld)) {
    let replaced: string;
    let count: number;
    if (replaceAll) {
      const parts = normalizedFile.split(normalizedOld);
      replaced = parts.join(normalizedNew);
      count = parts.length - 1;
    } else {
      const idx = normalizedFile.indexOf(normalizedOld);
      replaced = normalizedFile.substring(0, idx) + normalizedNew + normalizedFile.substring(idx + normalizedOld.length);
      count = 1;
    }
    const finalContent = fileContent.includes('\r\n') ? replaced.replaceAll('\n', '\r\n') : replaced;
    return { updatedContent: finalContent, count };
  }

  // 3. Quote-tolerant normalization
  const quotesFile = normalizeQuotes(normalizedFile);
  const quotesOld = normalizeQuotes(normalizedOld);
  if (quotesFile.includes(quotesOld)) {
    const idx = quotesFile.indexOf(quotesOld);
    const count = replaceAll ? quotesFile.split(quotesOld).length - 1 : 1;
    const matchedSegment = normalizedFile.substring(idx, idx + quotesOld.length);
    const replaced = replaceAll
      ? normalizedFile.split(matchedSegment).join(normalizedNew)
      : normalizedFile.substring(0, idx) + normalizedNew + normalizedFile.substring(idx + matchedSegment.length);
    const finalContent = fileContent.includes('\r\n') ? replaced.replaceAll('\n', '\r\n') : replaced;
    return { updatedContent: finalContent, count };
  }

  // 4. Line-by-line whitespace-tolerant matching (stripping trailing whitespace per line)
  const fileLines = normalizedFile.split('\n');
  const oldLines = normalizedOld.split('\n').map(l => l.trimEnd());

  if (oldLines.length > 0) {
    let matchIndex = -1;
    for (let i = 0; i <= fileLines.length - oldLines.length; i++) {
      let matches = true;
      for (let j = 0; j < oldLines.length; j++) {
        if (fileLines[i + j].trimEnd() !== oldLines[j]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        matchIndex = i;
        break;
      }
    }

    if (matchIndex !== -1) {
      const beforeLines = fileLines.slice(0, matchIndex);
      const afterLines = fileLines.slice(matchIndex + oldLines.length);
      const newLines = normalizedNew.split('\n');
      const combined = [...beforeLines, ...newLines, ...afterLines].join('\n');
      const finalContent = fileContent.includes('\r\n') ? combined.replaceAll('\n', '\r\n') : combined;
      return { updatedContent: finalContent, count: 1 };
    }
  }

  throw new Error(
    `No se encontró el bloque 'oldString' en el archivo. Asegurate de usar 'read_file' para copiar el fragmento exacto antes de editar.`
  );
}

// ==========================================
// 4. Tool Implementations (Backend Node Exec)
// ==========================================

export async function executeTool(
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
      case 'edit_file': {
        const file = resolvePath(args.filePath);
        const content = await fs.readFile(file, 'utf-8');
        const { updatedContent, count } = findAndReplaceContent(
          content,
          args.oldString,
          args.newString,
          Boolean(args.replaceAll)
        );
        await fs.writeFile(file, updatedContent, 'utf-8');
        return `Edición exitosa en ${path.relative(workspacePath, file) || file} (${count} reemplazo(s) aplicado(s)).`;
      }

      case 'glob_search': {
        const searchDir = resolvePath(args.dirPath || '.');
        const pattern = args.pattern || '*';
        const results: string[] = [];

        const globToRegex = (glob: string) => {
          const escaped = glob
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*\*/g, '§GLOBSTAR§')
            .replace(/\*/g, '[^/\\\\]*')
            .replace(/§GLOBSTAR§/g, '.*');
          return new RegExp(`^${escaped}$`, 'i');
        };

        const regex = globToRegex(pattern.includes('/') || pattern.includes('\\') ? pattern : `**/${pattern}`);

        async function walk(dir: string) {
          if (results.length >= 100) return;
          const list = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of list) {
            if (results.length >= 100) return;
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.atl' || entry.name === 'release') {
              continue;
            }
            const fullPath = path.resolve(dir, entry.name);
            const relPath = path.relative(workspacePath, fullPath).replace(/\\/g, '/');

            if (entry.isDirectory()) {
              await walk(fullPath);
            } else if (entry.isFile()) {
              if (regex.test(relPath) || regex.test(entry.name)) {
                results.push(relPath);
              }
            }
          }
        }

        await walk(searchDir);
        return JSON.stringify({ success: true, count: results.length, files: results }, null, 2);
      }

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

export type AgentRunOptions = {
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
};

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
}: AgentRunOptions): Promise<boolean> {
  let turn = 0;
  const maxTurns = 25;
  const executedWriteSignatures = new Set<string>();

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
    sendChunk(`<think>\n[ADVERTENCIA] El contexto del proyecto fue optimizado y recortado para ajustarse al límite de tokens del proveedor (${modelLimitMsg}).\n</think>\n`);
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

        const openaiMessages: any[] = [
          { role: 'system', content: SYSTEM_PROMPT }
        ];
        for (const m of formattedMessages) {
          if (m.tool_results) {
            for (const r of m.tool_results) {
              openaiMessages.push({
                role: 'tool',
                tool_call_id: r.tool_use_id,
                name: r.name,
                content: r.content
              });
            }
          } else if (m.tool_calls) {
            openaiMessages.push({
              role: 'assistant',
              content: m.content || null,
              tool_calls: m.tool_calls.map((tc: any) => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input)
                }
              }))
            });
          } else {
            openaiMessages.push({
              role: m.role,
              content: m.content
            });
          }
        }

        body = {
          model,
          messages: openaiMessages,
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
          system: SYSTEM_PROMPT,
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
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
          },
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
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...formattedMessages.map(m => {
              if (m.role === 'tool') return m;
              if (m.tool_calls) {
                return {
                  role: 'assistant',
                  content: m.content || null,
                  tool_calls: m.tool_calls
                };
              }
              return { role: m.role, content: m.content };
            })
          ],
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
      let inReasoningBlock = false;

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
                
                const reasoning = delta?.reasoning_content || delta?.reasoning;
                if (reasoning) {
                  if (!inReasoningBlock) {
                    textContent += '<think>\n';
                    sendChunk('<think>\n');
                    inReasoningBlock = true;
                  }
                  textContent += reasoning;
                  sendChunk(reasoning);
                }

                if (delta?.content) {
                  if (inReasoningBlock) {
                    textContent += '\n</think>\n';
                    sendChunk('\n</think>\n');
                    inReasoningBlock = false;
                  }
                  textContent += delta.content;
                  sendChunk(delta.content);
                }

                if (delta?.tool_calls) {
                  if (inReasoningBlock) {
                    textContent += '\n</think>\n';
                    sendChunk('\n</think>\n');
                    inReasoningBlock = false;
                  }
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

      // Close reasoning block if still open
      if (inReasoningBlock) {
        textContent += '\n</think>\n';
        sendChunk('\n</think>\n');
        inReasoningBlock = false;
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
          if (signal.aborted) {
            sendEnd(true);
            return false;
          }

          const sig = `${tc.name}:${JSON.stringify(tc.input)}`;
          if ((tc.name === 'write_file' || tc.name === 'edit_file') && executedWriteSignatures.has(sig)) {
            sendChunk(`[Finalizado] La herramienta \`${tc.name}\` ya creó y aplicó los cambios correctamente en el archivo.\n</think>\n\nOperación completada exitosamente. El archivo ha sido creado en tu espacio de trabajo.`);
            sendEnd();
            return true;
          }

          sendChunk(`Ejecutando herramienta \`${tc.name}\` en el workspace...\n`);
          
          const resultStr = await executeTool(tc.name, tc.input, workspacePath);
          if (tc.name === 'write_file' || tc.name === 'edit_file') {
            executedWriteSignatures.add(sig);
          }

          results.push({
            tool_use_id: tc.id,
            name: tc.name,
            content: resultStr
          });

          sendChunk(`Herramienta \`${tc.name}\` completada.\n`);
        }

        sendChunk(`</think>\n`);

        if (signal.aborted) {
          sendEnd(true);
          return false;
        }

        // Append the tool results
        messages.push({
          role: 'user', // In OpenAI, this is a separate 'tool' role, but we unify it
          content: 'Resultados de las herramientas ejecutadas. Por favor, presenta tu confirmación final al usuario.',
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
