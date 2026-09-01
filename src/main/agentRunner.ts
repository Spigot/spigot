import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { pathToFileURL } from 'url';
import { getModelEffortCapability, type ModelAssignment, type ModelConfiguration, type ModelEffort, type GentleRoleId, GENTLE_ROLE_LABELS } from '../shared/modelConfiguration';
import { STANDARD_TOOLS, getRolePrompt, getToolsForRole, isToolAllowedForRole } from './engine/rolePrompts';
import { dispatchSubagentRole } from './engine/SubagentRoleRunner';
import type { EngineEventListener } from './engine/types';
import type { ProviderStreamPart } from './engine/providers/types';
import { lspManager } from './lspManager';
import { semanticCatalogService } from './SemanticCatalogService';
import { estimateTokens, resolveContextBudget, type ContextBoundEvent } from '../shared/contextBudget';
import type { WorkspaceChangeSetService } from './changes/WorkspaceChangeSetService';
import { createChatLogger } from '../shared/chatLogger';
import {
  type ToolDefinition,
  type ToolCall,
  type ToolResult,
  type UnifiedMessage,
  providerRegistry,
  recoverMessageHistory,
} from './engine/providers';
import { getValidAccessToken } from './oauth/antigravityOAuth';

export type { ToolDefinition, ToolCall, ToolResult, UnifiedMessage };

const execAsync = promisify(exec);
const chatLog = createChatLogger();

// ==========================================
// 1. Tool Schemas & Unified Definitions
// ==========================================

const SYSTEM_PROMPT_ORCHESTRATOR = `You are Gentle AI Orchestrator, an elite Senior Software Architect and SDD Coordinator integrated directly into the Spigot code editor.
You coordinate complex multi-step development, architectural exploration, task decomposition, and rigorous verification.

Core Directives:
1. UNDERSTAND & EXPLORE:
   - Begin by analyzing the codebase context, imports, and boundaries using 'glob_search', 'grep_search', 'list_dir', and 'read_file'.
2. PLAN & ARCHITECT:
   - Formulate clear, grounded steps before executing modifications.
   - Decompose complex requirements into manageable units of work following Clean Architecture, SOLID, and Spec-Driven Development (SDD) principles.
3. SURGICAL EXECUTION:
   - Execute changes using 'edit_file' for surgical edits and 'write_file' for new components or tests.
   - Maintain strict workspace containment and consistent code style.
4. SELF-VERIFICATION LOOP:
   - Always run tests and typechecks using 'run_command' (e.g. 'pnpm test', 'npm test', 'tsc --noEmit') to verify changes before concluding.
5. NO REDUNDANT EXPLORATION:
   - DO NOT repeatedly execute 'list_dir' or 'glob_search' if you already know the workspace context or if the directory is empty. Immediately proceed to write the requested code with 'write_file'.
6. CONCISE SYNTHESIS & CLEAN FORMATTING:
   - Present your final answer with clean GitHub-flavored Markdown: use clear headings (#, ##), clean markdown tables, bullet lists, and code blocks.
   - When executing tools, do NOT emit conversational filler, repetitive greetings, or intermediate chatter. Go straight to tool execution and present your answer cleanly upon receiving the tool results.`;

const SYSTEM_PROMPT_BUILD = `You are Spigot Builder, an expert autonomous AI software engineer integrated directly into the Spigot code editor.
You have tools to explore, search, read, surgically edit, create files, and execute terminal commands in the active workspace.

Key Instructions:
1. CODE EDITING & FILE CREATION:
   - When asked to write, create, implement, refactor, or fix code, ALWAYS execute the changes directly using your tools.
   - DO NOT merely state your intent or narrate what you are about to do without calling tools. Invoke the appropriate tool ('write_file' or 'edit_file') IMMEDIATELY in the same turn to perform the action.
   - Use 'write_file' to create new files or write complete scripts.
   - Use 'edit_file' for surgical modifications: provide the exact 'oldString' and 'newString'.
   - Use 'read_file', 'grep_search', or 'glob_search' first if you need to inspect existing code before editing.
   - Once a file is created or modified with 'write_file' or 'edit_file', your task is COMPLETE. DO NOT call the same write tool again for the same file.
2. NO REPETITIVE EXPLORATION:
   - DO NOT call 'list_dir' or 'glob_search' repeatedly. If the workspace is empty or you have listed it, IMMEDIATELY create the requested file with 'write_file'.
3. VERIFICATION & EXECUTION:
   - You can use 'run_command' to run tests, typechecks, linters, or build scripts to verify your changes.
4. CONCISENESS & CLEAN FORMATTING:
   - Keep responses direct, structured, and beautifully formatted with Markdown headings, lists, and tables. Avoid conversational filler.`;

const SYSTEM_PROMPT_PLAN = `You are Spigot Architect & Planner, a dedicated planning and system design assistant integrated directly into Spigot.
Your purpose is to formulate structured implementation plans, breakdown complex features, analyze tradeoffs, and guide architectural strategy.
You have read-only tools to explore and read the workspace ('read_file', 'list_dir', 'glob_search', 'grep_search', 'git_status', 'git_diff') to ground your plans in the actual codebase.
You must NOT mutate files or execute arbitrary commands in Plan mode.`;

const SYSTEM_PROMPT_REVIEW = `You are Spigot Senior Reviewer, a Senior Software Architect and Code Auditor.
Your goal is to perform critical, in-depth architectural and code reviews evaluating Clean Architecture, SOLID principles, security vulnerabilities, edge cases, and performance bottlenecks.
You have read-only tools to inspect the workspace ('read_file', 'list_dir', 'glob_search', 'grep_search', 'git_status', 'git_diff'). You must NOT mutate files or execute arbitrary commands.`;

export function getSystemPrompt(mode: 'orchestrator' | 'build' | 'plan' | 'review' = 'orchestrator'): string {
  if (mode === 'orchestrator') return SYSTEM_PROMPT_ORCHESTRATOR;
  if (mode === 'plan') return SYSTEM_PROMPT_PLAN;
  if (mode === 'review') return SYSTEM_PROMPT_REVIEW;
  return SYSTEM_PROMPT_BUILD;
}

export const TOOLS: ToolDefinition[] = STANDARD_TOOLS;

// ==========================================
// 2. Mappers to API-specific formats & Mode Capabilities
// ==========================================

const READ_ONLY_TOOLS = new Set([
  'read_file',
  'list_dir',
  'glob_search',
  'grep_search',
  'git_status',
  'git_diff',
  'lsp_error_diagnostics',
  'lsp_document_symbols',
  'lsp_workspace_symbols',
  'lsp_definition',
  'lsp_references',
  'semantic_context',
]);

const LSP_TOOL_RESULT_LIMIT = 12_000;
const LSP_TOOL_MAX_RESULTS = 50;
const LSP_TOOL_TIMEOUT_MS = 1_500;

export function getToolsForMode(mode: 'orchestrator' | 'build' | 'plan' | 'review' = 'orchestrator'): ToolDefinition[] {
  if (mode === 'plan' || mode === 'review') {
    return TOOLS.filter(t => READ_ONLY_TOOLS.has(t.name));
  }
  if (mode === 'build') {
    return TOOLS.filter(t => t.name !== 'delegate_subagent');
  }
  return TOOLS;
}

export function getAnthropicTools(toolsOrMode?: ToolDefinition[] | 'orchestrator' | 'build' | 'plan' | 'review') {
  const tools = Array.isArray(toolsOrMode) ? toolsOrMode : getToolsForMode(toolsOrMode);
  if (tools.length === 0) return undefined;
  return providerRegistry.getAdapter('anthropic').sanitizeTools?.(tools);
}

export function getOpenAITools(toolsOrMode?: ToolDefinition[] | 'orchestrator' | 'build' | 'plan' | 'review') {
  const tools = Array.isArray(toolsOrMode) ? toolsOrMode : getToolsForMode(toolsOrMode);
  if (tools.length === 0) return undefined;
  return providerRegistry.getAdapter('openai').sanitizeTools?.(tools);
}

export function getGeminiTools(toolsOrMode?: ToolDefinition[] | 'orchestrator' | 'build' | 'plan' | 'review') {
  const tools = Array.isArray(toolsOrMode) ? toolsOrMode : getToolsForMode(toolsOrMode);
  if (tools.length === 0) return undefined;
  return providerRegistry.getAdapter('gemini').sanitizeTools?.(tools);
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

export function assertPathContained(targetPath: string, workspacePath: string): string {
  if (!workspacePath) {
    throw new Error('No se ha configurado un directorio de workspace válido para la ejecución de herramientas.');
  }

  const normalizedWorkspace = path.resolve(workspacePath);
  const rawTarget = targetPath || '.';
  const resolvedTarget = path.isAbsolute(rawTarget)
    ? path.resolve(rawTarget)
    : path.resolve(normalizedWorkspace, rawTarget);

  const rel = path.relative(normalizedWorkspace, resolvedTarget);
  const isContained = !rel.startsWith('..') && !path.isAbsolute(rel);

  if (!isContained) {
    throw new Error(`Acceso denegado por seguridad: La ruta "${targetPath}" está fuera del workspace permitido ("${workspacePath}").`);
  }

  return resolvedTarget;
}

export type ExecuteToolContext = {
  role?: GentleRoleId;
  modelConfig?: ModelConfiguration;
  fallbackAssignment?: ModelAssignment;
  providers?: Record<string, { apiKey: string; [key: string]: unknown }>;
  apiKey?: string;
  signal?: AbortSignal;
  agentRunner?: (options: AgentRunOptions) => Promise<boolean>;
  onEvent?: EngineEventListener;
  turnId?: string;
  sessionId?: string;
  changeSetService?: WorkspaceChangeSetService;
  changeSetId?: string;
  toolCallId?: string;
};

export async function executeTool(
  name: string,
  args: any,
  workspacePath: string,
  mode: 'orchestrator' | 'build' | 'plan' | 'review' = 'orchestrator',
  context?: ExecuteToolContext
): Promise<string> {
  try {
    if (context?.role) {
      if (!isToolAllowedForRole(context.role, name)) {
        throw new Error(`Acceso denegado: El rol "${context.role}" no tiene permisos para ejecutar la herramienta "${name}".`);
      }
    } else if ((mode === 'plan' || mode === 'review') && !READ_ONLY_TOOLS.has(name)) {
      const modeLabel = mode === 'plan' ? 'Plan' : 'Review';
      throw new Error(`Acceso denegado: El modo ${modeLabel} solo permite herramientas de lectura y análisis (intento de ejecutar "${name}").`);
    }

    const resolvePath = (p: string) => assertPathContained(p, workspacePath);
    const lspLanguageFor = (filePath: string) => {
      const extension = path.extname(filePath).toLowerCase();
      return extension === '.ts' ? 'typescript' : extension === '.tsx' ? 'typescriptreact' : extension === '.js' ? 'javascript' : extension === '.jsx' ? 'javascriptreact' : null;
    };
    const lspResult = (value: unknown) => {
      const serialized = JSON.stringify(value);
      return serialized.length <= LSP_TOOL_RESULT_LIMIT ? serialized : JSON.stringify({ status: 'result_too_large', items: [] });
    };
    const postWriteDiagnostics = async (file: string, content?: string) => {
      const languageId = lspLanguageFor(file);
      if (!languageId) return { status: 'unsupported', items: [] };
      const text = content ?? await fs.readFile(file, 'utf-8');
      return lspManager.synchronizeAndRefresh(workspacePath, languageId, file, text, LSP_TOOL_TIMEOUT_MS);
    };

    switch (name) {
      case 'delegate_subagent': {
        const targetRole = args?.role as GentleRoleId;
        const task = args?.task as string;
        const subContext = args?.context as string | undefined;

        if (!targetRole || !task) {
          throw new Error('La herramienta delegate_subagent requiere los parámetros "role" y "task".');
        }

        const subResult = await dispatchSubagentRole({
          role: targetRole,
          input: task,
          contextText: subContext,
          workspaceRoot: workspacePath,
          modelConfig: context?.modelConfig,
          fallbackAssignment: context?.fallbackAssignment,
          providers: context?.providers,
          apiKey: context?.apiKey,
          signal: context?.signal,
          agentRunner: context?.agentRunner,
          onEvent: context?.onEvent,
          turnId: context?.turnId,
          sessionId: context?.sessionId,
        });

        if (!subResult.success) {
          return `[Error en Subagente ${targetRole}]: ${subResult.error || 'Fallo desconocido en la ejecución del subagente.'}`;
        }
        return `[Resultado del Subagente ${targetRole}]:\n${subResult.output}`;
      }

      case 'edit_file': {
        const file = resolvePath(args.filePath);
        const relativePath = path.relative(workspacePath, file).replaceAll('\\', '/');
        const stagedContent = context?.changeSetId ? await context.changeSetService?.overlay(context.changeSetId, relativePath) : undefined;
        const content = stagedContent ?? await fs.readFile(file, 'utf-8');
        if (content === null) throw new Error('Cannot edit a file staged for deletion.');
        const { updatedContent, count } = findAndReplaceContent(
          content,
          args.oldString,
          args.newString,
          Boolean(args.replaceAll)
        );
        if (context?.changeSetId && context.changeSetService) {
          await context.changeSetService.capture(context.changeSetId, { relativePath, proposedContent: updatedContent, source: { toolName: name, toolCallId: context.toolCallId || 'tool' }, handoff: { kind: 'disk' } });
        } else {
          await fs.writeFile(file, updatedContent, 'utf-8');
          semanticCatalogService.invalidate(workspacePath, file);
        }
        const diagnostics = await postWriteDiagnostics(file, updatedContent);
        context?.onEvent?.({ type: 'tool', turnId: context.turnId || 'turn-default', id: `lsp-post-write-${Date.now()}`, name: 'lsp_post_write_diagnostics', status: 'end', data: diagnostics });
        return `Edición exitosa en ${path.relative(workspacePath, file) || file} (${count} reemplazo(s) aplicado(s)).\nLSP_POST_WRITE_DIAGNOSTICS:${lspResult(diagnostics)}`;
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
        const relativePath = path.relative(workspacePath, file).replaceAll('\\', '/');
        const stagedContent = context?.changeSetId ? await context.changeSetService?.overlay(context.changeSetId, relativePath) : undefined;
        let content = stagedContent ?? await fs.readFile(file, 'utf-8');
        if (content === null) throw new Error('File is staged for deletion.');
        
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

      case 'delete_file': {
        const file = resolvePath(args.filePath);
        const relativePath = path.relative(workspacePath, file).replaceAll('\\', '/');
        if (!context?.changeSetId || !context.changeSetService) throw new Error('Text deletion requires a staged change-set.');
        await context.changeSetService.capture(context.changeSetId, { relativePath, proposedContent: null, source: { toolName: name, toolCallId: context.toolCallId || 'tool' }, handoff: { kind: 'disk' } });
        return `Deletion staged for ${relativePath}.`;
      }

      case 'write_file': {
        const file = resolvePath(args.filePath);
        const relativePath = path.relative(workspacePath, file).replaceAll('\\', '/');
        if (context?.changeSetId && context.changeSetService) {
          await context.changeSetService.capture(context.changeSetId, { relativePath, proposedContent: args.content, source: { toolName: name, toolCallId: context.toolCallId || 'tool' }, handoff: { kind: 'disk' } });
        } else {
          await fs.mkdir(path.dirname(file), { recursive: true });
          await fs.writeFile(file, args.content, 'utf-8');
          semanticCatalogService.invalidate(workspacePath, file);
        }
        const diagnostics = await postWriteDiagnostics(file, args.content);
        context?.onEvent?.({ type: 'tool', turnId: context.turnId || 'turn-default', id: `lsp-post-write-${Date.now()}`, name: 'lsp_post_write_diagnostics', status: 'end', data: diagnostics });
        return `Archivo creado/escrito exitosamente en: ${file}\nLSP_POST_WRITE_DIAGNOSTICS:${lspResult(diagnostics)}`;
      }

      case 'lsp_error_diagnostics': {
        const file = resolvePath(args.filePath);
        const languageId = lspLanguageFor(file);
        if (!languageId) return lspResult({ status: 'unsupported', items: [] });
        return lspResult(await lspManager.errorDiagnostics(workspacePath, languageId, { filePath: file, version: Number(args.documentVersion), timeoutMs: LSP_TOOL_TIMEOUT_MS, maxResults: Math.min(Number(args.maxResults) || LSP_TOOL_MAX_RESULTS, LSP_TOOL_MAX_RESULTS) }));
      }

      case 'lsp_document_symbols': {
        const file = resolvePath(args.filePath);
        const languageId = lspLanguageFor(file);
        if (!languageId) return lspResult({ status: 'unsupported', items: [] });
        return lspResult(await lspManager.documentSymbols(workspacePath, languageId, { filePath: file, timeoutMs: LSP_TOOL_TIMEOUT_MS, maxResults: Math.min(Number(args.maxResults) || LSP_TOOL_MAX_RESULTS, LSP_TOOL_MAX_RESULTS) }));
      }

      case 'lsp_workspace_symbols': {
        const query = String(args.query || '').trim();
        if (!query) return lspResult({ status: 'invalid_query', items: [] });
        return lspResult(await lspManager.workspaceSymbols(workspacePath, 'typescript', { query, timeoutMs: LSP_TOOL_TIMEOUT_MS, maxResults: Math.min(Number(args.maxResults) || LSP_TOOL_MAX_RESULTS, LSP_TOOL_MAX_RESULTS) }));
      }

      case 'lsp_definition':
      case 'lsp_references': {
        const file = resolvePath(args.filePath);
        const languageId = lspLanguageFor(file);
        if (!languageId) return lspResult({ status: 'unsupported', items: [] });
        const location = { uri: pathToFileURL(file).toString(), line: Math.max(0, Number(args.line)), character: Math.max(0, Number(args.character)), timeoutMs: LSP_TOOL_TIMEOUT_MS, maxResults: Math.min(Number(args.maxResults) || LSP_TOOL_MAX_RESULTS, LSP_TOOL_MAX_RESULTS) };
        const result = name === 'lsp_definition'
          ? await lspManager.definition(workspacePath, languageId, location)
          : await lspManager.references(workspacePath, languageId, { ...location, includeDeclaration: Boolean(args.includeDeclaration) });
        return lspResult(result);
      }

      case 'semantic_context': {
        const query = String(args.query || '').trim();
        if (!query) return lspResult({ status: 'invalid_query', symbols: [], snippets: [] });
        return lspResult(await semanticCatalogService.retrieve({
          workspacePath,
          query,
          explicitPaths: Array.isArray(args.filePaths) ? args.filePaths.map(resolvePath) : [],
          signal: context?.signal,
        }));
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
        let cmd = 'git diff';
        if (args.filePath) {
          const diffFile = resolvePath(args.filePath);
          cmd = `git diff "${path.relative(workspacePath, diffFile)}"`;
        }
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
export function budgetRequestComponents(input: {
  provider: string;
  model: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  prompt: string;
  context: string | null;
  history: UnifiedMessage[];
  contextSource: 'default' | 'explicit';
}): { context: string | null; history: UnifiedMessage[]; warning?: ContextBoundEvent } {
  const capability = resolveContextBudget(input.provider, input.model);
  const inputBudget = capability.inputTokens - capability.responseReserveTokens;
  const fixedTokens = estimateTokens(input.systemPrompt) + estimateTokens(input.tools) + estimateTokens(input.prompt);
  let context = input.context;
  let history = [...input.history];
  let removedContext = 0;
  let removedHistory = 0;
  const contextParts = context?.split(/(?=--- ARCHIVO: |--- SEMANTIC SOURCE: )/) ?? [];

  // Remove lowest-priority context units first, then oldest history. The estimate is
  // intentionally conservative and is recomputed before every provider request.
  while (contextParts.length > 0 && fixedTokens + estimateTokens(contextParts.join('')) + estimateTokens(history) > inputBudget) {
    contextParts.pop();
    removedContext += 1;
  }
  context = contextParts.length > 0 ? contextParts.join('') : null;
  while (history.length > 0 && fixedTokens + estimateTokens(context) + estimateTokens(history) > inputBudget) {
    history.shift();
    removedHistory += 1;
  }
  if (fixedTokens + estimateTokens(context) + estimateTokens(history) > inputBudget && history.length > 0) {
    const last = history[history.length - 1];
    if (last.tool_results?.length) {
      history[history.length - 1] = {
        ...last,
        tool_results: last.tool_results.map(result => ({ ...result, content: result.content.slice(0, 3_000) })),
      };
      removedHistory += 1;
    }
  }

  const removedItems = removedContext + removedHistory;
  return {
    context,
    history,
    ...(removedItems > 0 ? {
      warning: {
        modelId: capability.modelId,
        keptItems: contextParts.length + history.length,
        removedItems,
        reason: 'input_budget' as const,
        omittedExplicitContext: removedContext > 0 && input.contextSource === 'explicit',
        omittedHistory: removedHistory > 0,
      },
    } : {}),
  };
}

// ==========================================
// 4. Recursive Agent Loop
// ==========================================

export type AgentRunOptions = {
  mode?: 'orchestrator' | 'build' | 'plan' | 'review';
  role?: GentleRoleId;
  provider: string;
  model: string;
  apiKey: string;
  effort?: ModelEffort;
  prompt: string;
  contextText: string | null;
  contextSource?: 'default' | 'explicit';
  history: any[];
  image: string | null;
  workspacePath: string;
  sendChunk: (chunk: string) => void;
  sendPart?: (part: ProviderStreamPart) => void;
  sendError: (err: string) => void;
  sendEnd: (aborted?: boolean) => void;
  signal: AbortSignal;
  customTools?: ToolDefinition[];
  customSystemPrompt?: string;
  modelConfig?: ModelConfiguration;
  providers?: Record<string, { apiKey: string; [key: string]: unknown }>;
  onEvent?: EngineEventListener;
  turnId?: string;
  sessionId?: string;
  changeSetService?: WorkspaceChangeSetService;
  changeSetId?: string;
};

export function applyModelEffort(
  body: Record<string, unknown>,
  provider: string,
  model: string,
  effort: ModelEffort | undefined,
): Record<string, unknown> {
  const capability = getModelEffortCapability({ providerId: provider, modelId: model });
  if (!effort || !capability?.levels.includes(effort)) return body;
  if (capability.payload === 'openai' && provider === 'openai') {
    return { ...body, reasoning_effort: effort };
  }
  if (capability.payload === 'anthropic' && provider === 'anthropic') {
    return { ...body, output_config: { effort } };
  }
  return body;
}

export async function runAgentLoop({
  mode = 'orchestrator',
  role,
  provider,
  model,
  apiKey,
  effort,
  prompt,
  contextText,
  contextSource = 'default',
  history,
  image: _image,
  workspacePath,
  sendChunk,
  sendPart,
  sendError,
  sendEnd,
  signal,
  customTools,
  customSystemPrompt,
  modelConfig,
  providers,
  onEvent,
  turnId,
  sessionId,
  changeSetService,
  changeSetId,
}: AgentRunOptions): Promise<boolean> {
  let turn = 0;
  const logContext = { conversationId: sessionId, turnId, mode, providerModelId: `${provider}/${model}`, startedAt: Date.now() };
  let executingToolName: string | undefined;
  const maxTurns = 25;
  const executedWriteSignatures = new Set<string>();
  const executedToolCounts = new Map<string, number>();

  // Standardize historical conversation messages for tool execution context
  const rawHistory: UnifiedMessage[] = (history || []).map((msg: any) => {
    return {
      role: msg.role === 'assistant' ? 'assistant' : msg.role === 'tool' ? 'tool' : 'user',
      content: msg.content,
      ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
      ...(msg.tool_results && { tool_results: msg.tool_results }),
      ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
      ...(msg.name && { name: msg.name }),
    };
  });

  let messages: UnifiedMessage[] = recoverMessageHistory(rawHistory);

  let generatedPart = 0;
  const sendReasoning = (text: string) => {
    if (!sendPart) {
      sendChunk(text);
      return;
    }
    const partId = `agent-reasoning-${generatedPart++}`;
    sendPart({ partId, kind: 'reasoning', lifecycle: 'start' });
    sendPart({ partId, kind: 'reasoning', lifecycle: 'delta', text });
    sendPart({ partId, kind: 'reasoning', lifecycle: 'end' });
  };

  let accumulatedOutputLength = 0;

  while (turn < maxTurns) {
    if (signal.aborted) {
      sendEnd(true);
      return false;
    }

    turn++;

    try {
      // Prepare Tool Schemas and System Prompt for API call
      const effectiveMode = mode || 'orchestrator';
      const activeSystemPrompt = customSystemPrompt || (role ? getRolePrompt(role) : getSystemPrompt(effectiveMode));
      const effectiveTools = customTools || (role ? getToolsForRole(role, TOOLS) : getToolsForMode(effectiveMode));
      const budgeted = budgetRequestComponents({
        provider, model, systemPrompt: activeSystemPrompt, tools: effectiveTools, prompt,
        context: contextText, history: messages, contextSource,
      });
      if (budgeted.warning) onEvent?.({ type: 'context:bounded', turnId: turnId || 'turn-default', data: budgeted.warning });
      const fullUserPrompt = budgeted.context
        ? `=== CONTEXTO DEL PROYECTO ===\n${budgeted.context}\n\n=== FIN CONTEXTO ===\n\nPregunta / Instrucción del usuario:\n${prompt}`
        : prompt;
      const requestMessages = [...budgeted.history, { role: 'user' as const, content: fullUserPrompt }];

      // Resolve modular provider adapter
      const adapter = providerRegistry.get(provider);

      // Validate & recover message history (injects synthetic tool result if prior turn was cancelled)
      const sanitizedMessages = recoverMessageHistory(requestMessages);

      let effectiveApiKey = apiKey;
      if (provider === 'gemini' && apiKey) {
        try {
          const validAuth = await getValidAccessToken(apiKey);
          if (validAuth) {
            effectiveApiKey = JSON.stringify({
              accessToken: validAuth.accessToken,
              projectId: validAuth.projectId,
              isOAuth: true,
            });
          }
        } catch {
          // Fallback to raw apiKey
        }
      }

      const requestPayload = adapter.buildRequest({
        provider,
        model,
        apiKey: effectiveApiKey,
        prompt: fullUserPrompt,
        systemPrompt: activeSystemPrompt,
        messages: sanitizedMessages,
        tools: effectiveTools,
        effort,
        signal,
      });

      const response = await fetch(requestPayload.url, {
        method: 'POST',
        headers: requestPayload.headers,
        body: JSON.stringify(requestPayload.body),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API returned HTTP ${response.status}: ${errText}`);
      }

      let turnEmittedText = false;
      const wrappedSendChunk = (chunk: string) => {
        if (!chunk) return;
        if (accumulatedOutputLength > 0 && !turnEmittedText && !chunk.startsWith('\n')) {
          sendChunk('\n\n' + chunk);
        } else {
          sendChunk(chunk);
        }
        turnEmittedText = true;
        accumulatedOutputLength += chunk.length;
      };

      const wrappedSendPart = sendPart ? (part: ProviderStreamPart) => {
        if (part.kind === 'text' && part.text) {
          if (accumulatedOutputLength > 0 && !turnEmittedText && !part.text.startsWith('\n')) {
            sendPart({ ...part, text: '\n\n' + part.text, partId: `provider-${turn}-${part.partId}` });
          } else {
            sendPart({ ...part, partId: `provider-${turn}-${part.partId}` });
          }
          turnEmittedText = true;
          accumulatedOutputLength += part.text.length;
        } else {
          sendPart({ ...part, partId: `provider-${turn}-${part.partId}` });
        }
      } : undefined;

      const { textContent, reasoningContent, toolCalls } = await adapter.parseStream(response, {
        sendChunk: wrappedSendChunk,
        signal,
        provider,
        model,
        onPart: wrappedSendPart,
      });

      if (!textContent && !reasoningContent && toolCalls.length === 0) {
        const message = 'El proveedor terminó sin contenido de respuesta. Intente nuevamente.';
        chatLog('warn', logContext, 'main.provider', 'stream.empty_response', { turn });
        sendError(message);
        return false;
      }

      // Save this turn's response to conversation state
      const assistantMessage: UnifiedMessage = {
        role: 'assistant',
        content: textContent,
      };

      if (toolCalls.length > 0) {
        assistantMessage.tool_calls = toolCalls;
      }

      messages.push(assistantMessage);

      // ==========================================
      // 5. Tool Execution & Feed Back Loop
      // ==========================================
      if (toolCalls.length > 0) {
        const results: ToolResult[] = [];
        
        for (const tc of toolCalls) {
          if (signal.aborted) {
            sendEnd(true);
            return false;
          }

          const sig = `${tc.name}:${JSON.stringify(tc.input || {})}`;
          const currentCount = (executedToolCounts.get(sig) || 0) + 1;
          executedToolCounts.set(sig, currentCount);

          if ((tc.name === 'write_file' || tc.name === 'edit_file' || tc.name === 'delete_file') && executedWriteSignatures.has(sig)) {
            sendReasoning(`[Finalizado] La herramienta \`${tc.name}\` ya creó y aplicó los cambios correctamente en el archivo.`);
            sendChunk('\n\nOperación completada exitosamente. El archivo ha sido creado en tu espacio de trabajo.');
            sendEnd();
            return true;
          }

          const currentTurnId = turnId || 'turn-default';
          const toolCallId = tc.id || `tool-${Date.now()}`;

          onEvent?.({
            type: 'tool',
            turnId: currentTurnId,
            id: toolCallId,
            name: tc.name,
            status: 'start',
            data: tc.input,
          });
          chatLog('info', logContext, 'main.tool', tc.name === 'delegate_subagent' ? 'subagent.started' : 'tool.started', { toolIdPresent: Boolean(toolCallId) });
          executingToolName = tc.name;

          let resultStr: string;
          if (currentCount > 2 && (tc.name === 'list_dir' || tc.name === 'glob_search' || tc.name === 'read_file')) {
            resultStr = `[AVISO ANTI-LOOP] Ya consultaste '${tc.name}' con estos mismos parámetros anteriormente. NO repitas esta llamada. Procedé de inmediato a escribir el código o archivo solicitado con 'write_file' o 'edit_file', o respondé al usuario.`;
          } else if (tc.name === 'delegate_subagent') {
            const targetRole = (tc.input as any)?.role as GentleRoleId;
            const roleLabel = GENTLE_ROLE_LABELS[targetRole] || targetRole || 'subagente';
            sendReasoning(`Delegando tarea al subagente \`${roleLabel}\`...\n`);
            resultStr = await executeTool(tc.name, tc.input, workspacePath, effectiveMode, {
              role,
              modelConfig,
              providers,
              apiKey,
              signal,
              onEvent,
              turnId: currentTurnId,
              sessionId,
              changeSetService,
              changeSetId,
              toolCallId,
            });
            sendReasoning(`Subagente \`${roleLabel}\` completó su tarea.\n`);
          } else {
            sendReasoning(`Ejecutando herramienta \`${tc.name}\` en el workspace...\n`);
            resultStr = await executeTool(tc.name, tc.input, workspacePath, effectiveMode, {
              role,
              modelConfig,
              providers,
              apiKey,
              signal,
              onEvent,
              turnId: currentTurnId,
              sessionId,
              changeSetService,
              changeSetId,
              toolCallId,
            });
            if (tc.name === 'write_file' || tc.name === 'edit_file' || tc.name === 'delete_file') {
              executedWriteSignatures.add(sig);
            }
            sendReasoning(`Herramienta \`${tc.name}\` completada.\n`);
          }

          onEvent?.({
            type: 'tool',
            turnId: currentTurnId,
            id: toolCallId,
            name: tc.name,
            status: 'end',
            data: {
              result: resultStr,
            },
          });
          chatLog('info', logContext, 'main.tool', tc.name === 'delegate_subagent' ? 'subagent.completed' : 'tool.completed', { toolIdPresent: Boolean(toolCallId), resultBytes: resultStr.length });
          executingToolName = undefined;

          results.push({
            tool_use_id: tc.id,
            name: tc.name,
            content: resultStr,
          });
        }

        if (signal.aborted) {
          sendEnd(true);
          return false;
        }

        // Append the tool results
        messages.push({
          role: 'user',
          content: 'Resultados de las herramientas ejecutadas. Por favor, presenta tu confirmación final al usuario.',
          tool_results: results,
        });

        // Continue to the next turn in the loop!
      } else {
        // No tool calls requested, we are done!
        sendEnd();
        return true;
      }
    } catch (err: any) {
      if (executingToolName) chatLog('error', logContext, 'main.tool', executingToolName === 'delegate_subagent' ? 'subagent.error' : 'tool.error');
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
