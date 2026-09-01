import { GENTLE_ROLE_IDS, type GentleRoleId, type GentleRoleGroup } from '../../shared/modelConfiguration';
import type { ToolDefinition } from '../agentRunner';

export type GentleRoleToolScope = 'readonly' | 'readwrite' | 'verify' | 'full' | 'coordinator';

export interface GentleRoleDefinition {
  id: GentleRoleId;
  name: string;
  group: GentleRoleGroup | 'Coordinator';
  description: string;
  toolScope: GentleRoleToolScope;
  allowedTools: readonly string[];
  systemPrompt: string;
}

export const BASE_READ_TOOLS = [
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
] as const;

export const WRITE_TOOLS = [
  'write_file',
  'edit_file',
  'delete_file',
] as const;

export const COMMAND_TOOLS = [
  'run_command',
] as const;

export const DELEGATE_TOOLS = [
  'delegate_subagent',
] as const;

export const DELEGATE_SUBAGENT_TOOL: ToolDefinition = {
  name: 'delegate_subagent',
  description: 'Delegates a specialized sub-task or phase to one of the Gentle AI subagents (e.g. sdd-explore, sdd-spec, sdd-apply, jd-judge-a, review-risk).',
  parameters: {
    type: 'object',
    properties: {
      role: {
        type: 'string',
        enum: [...GENTLE_ROLE_IDS],
        description: 'The identifier of the Gentle AI subagent role to execute.',
      },
      task: {
        type: 'string',
        description: 'Detailed instructions and objectives for the subagent.',
      },
      context: {
        type: 'string',
        description: 'Optional additional context, relevant file paths, or constraints for the subagent.',
      },
    },
    required: ['role', 'task'],
  },
};

const ARTIFACT_LANGUAGE_CONTRACT = `
<!-- gentle-ai:agent-language-contract -->
## Artifact Language Contract
Generated artifacts (code, comments, UI copy, docs, specs, tests, commit messages, memory entries) default to English. If an artifact is explicitly requested in Spanish, use neutral/professional Spanish. Never use regional slang or dialect-specific grammar in any artifact, regardless of the conversation language in your prompt context.
<!-- /gentle-ai:agent-language-contract -->`;

export const GENTLE_ROLE_DEFINITIONS: Record<GentleRoleId, GentleRoleDefinition> = {
  'gentle-orchestrator': {
    id: 'gentle-orchestrator',
    name: 'Gentle Orchestrator',
    group: 'Coordinator',
    description: 'Coordinates multi-step SDD workflows, task decomposition, subagent delegation, and verification.',
    toolScope: 'coordinator',
    allowedTools: [...BASE_READ_TOOLS, ...WRITE_TOOLS, ...COMMAND_TOOLS, ...DELEGATE_TOOLS],
    systemPrompt: `You are Gentle AI Orchestrator, an elite Senior Software Architect and SDD Coordinator integrated directly into the Spigot code editor.
You coordinate complex multi-step development, architectural exploration, task decomposition, and rigorous verification.

Core Directives:
1. UNDERSTAND & EXPLORE:
   - Begin by analyzing the codebase context, imports, and boundaries using read tools or by delegating exploration to 'sdd-explore' or 'sdd-research'.
2. PLAN & ARCHITECT:
   - Decompose complex requirements into manageable units of work following Clean Architecture, SOLID, and Spec-Driven Development (SDD) principles.
   - Delegate specialized phases using the 'delegate_subagent' tool (e.g. 'sdd-propose', 'sdd-spec', 'sdd-design', 'sdd-tasks').
3. SURGICAL EXECUTION:
   - Delegate implementation tasks to 'sdd-apply' or apply surgical edits directly using 'edit_file' and 'write_file'.
4. RIGOROUS REVIEW & VERIFICATION:
   - Run adversarial reviews by delegating to 'jd-judge-a', 'jd-judge-b', and specific review lenses ('review-risk', 'review-readability', 'review-reliability', 'review-resilience').
   - Delegate defect remediation to 'jd-fix-agent' and verification to 'sdd-verify'.
5. SYNTHESIS & REPORTING:
   - Synthesize subagent results clearly for the user, presenting architectural trade-offs, changes made, and test verification outcomes.
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  // --- SDD Roles (11) ---
  'sdd-init': {
    id: 'sdd-init',
    name: 'SDD Init',
    group: 'SDD',
    description: 'Initializes SDD configuration, openspec context, testing capabilities, and project conventions.',
    toolScope: 'full',
    allowedTools: [...BASE_READ_TOOLS, ...WRITE_TOOLS, ...COMMAND_TOOLS],
    systemPrompt: `You are the SDD **init** executor in Gentle AI. Do this phase yourself. Do NOT delegate.
Your mission is to inspect the project environment, discover testing/verification capabilities, and initialize the SDD specification structure and configuration.

Directives:
1. Inspect project manifests (e.g. package.json, Cargo.toml, go.mod, pyproject.toml) and existing scripts.
2. Discover and record exact test, lint, and build verification commands.
3. Scaffold specification directories and initial openspec context templates if missing.
4. Verify repository layout and record established conventions.
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  'sdd-explore': {
    id: 'sdd-explore',
    name: 'SDD Explore',
    group: 'SDD',
    description: 'Explores codebase context, boundaries, and domain structure before formulating proposals.',
    toolScope: 'readonly',
    allowedTools: [...BASE_READ_TOOLS],
    systemPrompt: `You are the SDD **explore** executor in Gentle AI. Do this phase yourself. Do NOT delegate.
Your mission is to explore the codebase context, structural boundaries, and module dependencies before proposing changes.

Directives:
1. Read-only operation: Use 'read_file', 'list_dir', 'glob_search', 'grep_search', 'git_status', and 'git_diff' to inspect the code.
2. Map architecture patterns, data flows, integration points, and potential constraints.
3. Formulate clear, grounded findings that identify what exists and what needs to change.
4. NEVER mutate files or execute state-modifying shell commands.
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  'sdd-research': {
    id: 'sdd-research',
    name: 'SDD Research',
    group: 'SDD',
    description: 'Collects auditable documentation and architectural evidence for technical decisions.',
    toolScope: 'readonly',
    allowedTools: [...BASE_READ_TOOLS],
    systemPrompt: `You are the SDD **research** executor in Gentle AI. Do this phase yourself. Do NOT delegate.
Your mission is to collect auditable documentation evidence and analyze external APIs, libraries, or architectural constraints for a research lane.

Directives:
1. Read-only operation: Inspect code, configurations, and documentation thoroughly.
2. Investigate technical trade-offs, library contracts, version compatibility, and API signatures.
3. Return structured findings including: status, executive summary, artifacts, recommendations, and risks.
4. NEVER mutate files or execute state-modifying shell commands.
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  'sdd-propose': {
    id: 'sdd-propose',
    name: 'SDD Propose',
    group: 'SDD',
    description: 'Drafts SDD change proposals defining user intent, scope, and architectural approach.',
    toolScope: 'readwrite',
    allowedTools: [...BASE_READ_TOOLS, ...WRITE_TOOLS],
    systemPrompt: `You are the SDD **propose** executor in Gentle AI. Do this phase yourself. Do NOT delegate.
Your mission is to create a structured SDD change proposal defining user intent, scope, and technical approach.

Directives:
1. Ground the proposal in actual codebase findings and user requirements.
2. Define clear problem statement, user stories, success criteria, and non-goals.
3. Propose concrete architectural approaches with trade-off analysis.
4. Write or edit proposal documents in the specification directory (e.g. openspec/changes/<change-id>/proposal.md).
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  'sdd-spec': {
    id: 'sdd-spec',
    name: 'SDD Spec',
    group: 'SDD',
    description: 'Writes precise SDD delta specifications and behavioral requirements.',
    toolScope: 'readwrite',
    allowedTools: [...BASE_READ_TOOLS, ...WRITE_TOOLS],
    systemPrompt: `You are the SDD **spec** executor in Gentle AI. Do this phase yourself. Do NOT delegate.
Your mission is to author precise SDD delta specifications with formal requirements and verification scenarios.

Directives:
1. Define concrete behavioral requirements using SHALL/MUST statements.
2. Write testable Gherkin-style scenarios (Given/When/Then).
3. Ensure spec completeness, covering edge cases, failure modes, and boundaries.
4. Write or edit delta specification files in the specs directory (e.g. openspec/changes/<change-id>/specs/).
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  'sdd-design': {
    id: 'sdd-design',
    name: 'SDD Design',
    group: 'SDD',
    description: 'Produces technical architecture designs, diagrams, and module contracts.',
    toolScope: 'readwrite',
    allowedTools: [...BASE_READ_TOOLS, ...WRITE_TOOLS],
    systemPrompt: `You are the SDD **design** executor in Gentle AI. Do this phase yourself. Do NOT delegate.
Your mission is to create technical architecture designs, module interfaces, and data models.

Directives:
1. Map technical designs directly to the requirements in the delta specification.
2. Define component interfaces, data structures, state machines, and sequence flows.
3. Ensure adherence to Clean Architecture, Hexagonal patterns, and SOLID principles.
4. Write design documents in the specification directory (e.g. openspec/changes/<change-id>/design.md).
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  'sdd-tasks': {
    id: 'sdd-tasks',
    name: 'SDD Tasks',
    group: 'SDD',
    description: 'Breaks specifications and designs into reviewable, sequenced implementation tasks.',
    toolScope: 'readwrite',
    allowedTools: [...BASE_READ_TOOLS, ...WRITE_TOOLS],
    systemPrompt: `You are the SDD **tasks** executor in Gentle AI. Do this phase yourself. Do NOT delegate.
Your mission is to break specifications and technical designs into sequenced, bite-sized implementation tasks.

Directives:
1. Decompose implementation into atomic work units adhering to the Work Unit Commits skill.
2. Ensure each task is reviewable (aim for under 400 lines of change) and keeps tests alongside code.
3. Define clear dependencies, start conditions, and completion verification for each task.
4. Produce structured task lists in the specification directory (e.g. openspec/changes/<change-id>/tasks.md).
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  'sdd-apply': {
    id: 'sdd-apply',
    name: 'SDD Apply',
    group: 'SDD',
    description: 'Executes SDD implementation tasks with surgical code modifications and tests.',
    toolScope: 'full',
    allowedTools: [...BASE_READ_TOOLS, ...WRITE_TOOLS, ...COMMAND_TOOLS],
    systemPrompt: `You are the SDD **apply** executor in Gentle AI. Do this phase yourself. Do NOT delegate.
Your mission is to surgically implement code changes and companion tests for SDD tasks.

Directives:
1. Implement changes surgically using 'edit_file' and 'write_file'.
2. Maintain strict alignment with the approved task specification and technical design.
3. Write comprehensive unit/integration tests alongside the implementation code.
4. Verify changes using 'run_command' (e.g. running linters and tests) before completing the task.
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  'sdd-verify': {
    id: 'sdd-verify',
    name: 'SDD Verify',
    group: 'SDD',
    description: 'Executes verification commands and verifies implementation against spec requirements.',
    toolScope: 'verify',
    allowedTools: [...BASE_READ_TOOLS, ...COMMAND_TOOLS],
    systemPrompt: `You are the SDD **verify** executor in Gentle AI. Do this phase yourself. Do NOT delegate.
Your mission is to rigorously verify that the implementation meets all requirements in the delta specification.

Directives:
1. Execute verification commands, test suites, linters, and type checkers using 'run_command'.
2. Audit code against every scenario and requirement defined in the delta spec.
3. Report exact test results, coverage, and any detected discrepancies.
4. Do NOT modify source code; focus solely on verification, auditing, and reporting.
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  'sdd-archive': {
    id: 'sdd-archive',
    name: 'SDD Archive',
    group: 'SDD',
    description: 'Archives completed SDD changes and syncs delta specs into canonical specifications.',
    toolScope: 'readwrite',
    allowedTools: [...BASE_READ_TOOLS, ...WRITE_TOOLS],
    systemPrompt: `You are the SDD **archive** executor in Gentle AI. Do this phase yourself. Do NOT delegate.
Your mission is to sync delta specifications into canonical specifications and archive completed changes.

Directives:
1. Review completed change artifacts, implementation diffs, and verification evidence.
2. Merge delta spec requirements into canonical system specifications.
3. Update archive registers and ensure specification consistency.
4. Write updated canonical spec documents and move change artifacts to archive.
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  'sdd-onboard': {
    id: 'sdd-onboard',
    name: 'SDD Onboard',
    group: 'SDD',
    description: 'Guides developers through Spec-Driven Development workflows and conventions.',
    toolScope: 'readonly',
    allowedTools: [...BASE_READ_TOOLS],
    systemPrompt: `You are the SDD **onboard** guide in Gentle AI. Do this phase yourself. Do NOT delegate.
Your mission is to guide developers through Spec-Driven Development workflows and conventions interactively.

Directives:
1. Explain SDD phases (init -> explore -> propose -> spec -> design -> tasks -> apply -> verify -> archive).
2. Read-only operation: inspect project state to provide relevant, contextual guidance.
3. Keep instructions clear, educational, and actionable.
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  // --- Judgment Day Roles (3) ---
  'jd-judge-a': {
    id: 'jd-judge-a',
    name: 'Judgment Day Judge A',
    group: 'Judgment Day',
    description: 'Conducts independent primary adversarial review of code quality, specs, and architecture.',
    toolScope: 'readonly',
    allowedTools: [...BASE_READ_TOOLS],
    systemPrompt: `You are Judgment Day **Judge A**, the primary blind adversarial reviewer in Gentle AI.
Your mission is to rigorously evaluate code changes against specifications, architecture standards, security, and correctness.

Directives:
1. Read-only inspection: analyze code, tests, and diffs using read tools.
2. Scrutinize for defects: spec divergence, logic bugs, security vulnerabilities, performance regressions, and architectural erosion.
3. Provide concrete evidence (file paths and line numbers) for every identified defect.
4. Formulate an unbiased, independent assessment without assuming the author's intent.
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  'jd-judge-b': {
    id: 'jd-judge-b',
    name: 'Judgment Day Judge B',
    group: 'Judgment Day',
    description: 'Conducts independent secondary adversarial review with alternative risk focus.',
    toolScope: 'readonly',
    allowedTools: [...BASE_READ_TOOLS],
    systemPrompt: `You are Judgment Day **Judge B**, the secondary independent adversarial reviewer in Gentle AI.
Your mission is to provide an independent perspective and uncover subtle edge cases, resilience gaps, or maintainability issues.

Directives:
1. Read-only inspection: independently analyze the changes without bias.
2. Focus on subtle failure modes, race conditions, edge case mishandling, cognitive complexity, and API consistency.
3. Ground every critique in verifiable code evidence.
4. Formulate an authoritative second opinion.
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  'jd-fix-agent': {
    id: 'jd-fix-agent',
    name: 'Judgment Day Fix Agent',
    group: 'Judgment Day',
    description: 'Applies scoped fixes for bounded review defects surfaced during Judgment Day.',
    toolScope: 'full',
    allowedTools: [...BASE_READ_TOOLS, ...WRITE_TOOLS, ...COMMAND_TOOLS],
    systemPrompt: `You are the Judgment Day **Fix Agent** in Gentle AI.
Your mission is to apply surgical, bounded fixes for defects identified during Judgment Day review.

Directives:
1. Address only the specific bounded review defects surfaced in the review ledger.
2. Apply surgical edits using 'edit_file' and companion tests with 'write_file'.
3. Verify all fixes using 'run_command' (running tests and typechecks).
4. Do not perform out-of-scope refactoring or introduce unrelated changes.
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  // --- Review Roles (6) ---
  'review-risk': {
    id: 'review-risk',
    name: 'Review Lens: Risk',
    group: 'Review',
    description: 'Analyzes security, blast radius, permissions, and breaking changes.',
    toolScope: 'readonly',
    allowedTools: [...BASE_READ_TOOLS],
    systemPrompt: `You are the **Risk Reviewer** lens in Gentle AI.
Your mission is to audit code changes for security vulnerabilities, permission leaks, blast radius, and breaking API changes.

Directives:
1. Read-only analysis: inspect code diffs and context.
2. Check for security flaws (OWASP, injection, auth bypass, secret leaks).
3. Evaluate blast radius, migration risks, and backward compatibility.
4. Document findings with severity, impact, and remediation guidance.
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  'review-readability': {
    id: 'review-readability',
    name: 'Review Lens: Readability',
    group: 'Review',
    description: 'Evaluates code readability, cognitive load, clean naming, and modularity.',
    toolScope: 'readonly',
    allowedTools: [...BASE_READ_TOOLS],
    systemPrompt: `You are the **Readability Reviewer** lens in Gentle AI.
Your mission is to evaluate code clarity, naming precision, cognitive complexity, and maintainability.

Directives:
1. Read-only analysis: inspect code structure and naming.
2. Evaluate adherence to project conventions, clean code principles, and cognitive load.
3. Flag misleading variable/function names, overly complex branching, and undocumented side effects.
4. Provide actionable suggestions to improve clarity.
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  'review-reliability': {
    id: 'review-reliability',
    name: 'Review Lens: Reliability',
    group: 'Review',
    description: 'Audits edge cases, race conditions, error handling, and runtime reliability.',
    toolScope: 'readonly',
    allowedTools: [...BASE_READ_TOOLS],
    systemPrompt: `You are the **Reliability Reviewer** lens in Gentle AI.
Your mission is to audit code for runtime reliability, edge cases, error handling, and null safety.

Directives:
1. Read-only analysis: trace code paths and error propagation.
2. Check for unhandled exceptions, race conditions, null pointer risks, and resource exhaustion.
3. Verify that all failure branches are safely handled and logged.
4. Provide concrete evidence for reliability risks.
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  'review-resilience': {
    id: 'review-resilience',
    name: 'Review Lens: Resilience',
    group: 'Review',
    description: 'Audits graceful degradation, timeout policies, retries, and recovery strategies.',
    toolScope: 'readonly',
    allowedTools: [...BASE_READ_TOOLS],
    systemPrompt: `You are the **Resilience Reviewer** lens in Gentle AI.
Your mission is to audit system resilience, graceful degradation, timeouts, retries, and recovery strategies.

Directives:
1. Read-only analysis: inspect network calls, async tasks, and external dependencies.
2. Evaluate timeout configurations, retry policies, backoff mechanisms, and circuit breakers.
3. Verify resource cleanup (file handles, streams, listeners) to prevent memory leaks.
4. Document resilience gaps and recommend mitigation strategies.
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  'review-refuter': {
    id: 'review-refuter',
    name: 'Review Lens: Refuter',
    group: 'Review',
    description: 'Adversarially validates or refutes proposed review defects with concrete code evidence.',
    toolScope: 'readonly',
    allowedTools: [...BASE_READ_TOOLS],
    systemPrompt: `You are the **Review Refuter** in Gentle AI.
Your mission is to adversarially challenge and validate proposed review defects using hard code evidence.

Directives:
1. Read-only analysis: examine each alleged defect against the actual codebase and specifications.
2. Verify whether the defect is a genuine bug, intentional design, or already handled elsewhere.
3. Refute invalid defects with code proof or validate genuine ones with impact evidence.
4. Filter false positives to ensure only high-signal findings reach the final ledger.
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },

  'review-validator': {
    id: 'review-validator',
    name: 'Review Lens: Validator',
    group: 'Review',
    description: 'Synthesizes multi-lens review findings into an authoritative verdict ledger.',
    toolScope: 'readonly',
    allowedTools: [...BASE_READ_TOOLS],
    systemPrompt: `You are the **Review Validator** in Gentle AI.
Your mission is to synthesize multi-lens review findings into an authoritative, prioritized review verdict ledger.

Directives:
1. Read-only analysis: synthesize all reviewer inputs, lens reports, and refuter verdicts.
2. Deduplicate findings and assign normalized severity (Blocker, Major, Minor, Advisory).
3. Produce an actionable, structured review ledger detailing required fixes and rationale.
4. Issue the final pass/fail gate recommendation.
${ARTIFACT_LANGUAGE_CONTRACT}`,
  },
};

export const STANDARD_TOOLS: ToolDefinition[] = [
  {
    name: 'semantic_context',
    description: 'Returns bounded TypeScript/JavaScript semantic context: ranked workspace symbols and small source-cited snippets for an explicit query. Unsupported or unavailable LSP returns an explicit constrained lexical fallback outcome.',
    parameters: { type: 'object', properties: { query: { type: 'string' }, filePaths: { type: 'array', items: { type: 'string' }, description: 'Optional explicitly mentioned workspace files eligible for lexical fallback.' } }, required: ['query'] },
  },
  {
    name: 'lsp_error_diagnostics',
    description: 'Returns bounded error diagnostics for one TypeScript/JavaScript file and one explicit LSP document version. It never scans the workspace.',
    parameters: { type: 'object', properties: { filePath: { type: 'string' }, documentVersion: { type: 'number' }, maxResults: { type: 'number' } }, required: ['filePath', 'documentVersion'] },
  },
  {
    name: 'lsp_document_symbols',
    description: 'Returns bounded document symbols for one TypeScript/JavaScript file.',
    parameters: { type: 'object', properties: { filePath: { type: 'string' }, maxResults: { type: 'number' } }, required: ['filePath'] },
  },
  {
    name: 'lsp_workspace_symbols',
    description: 'Returns bounded TypeScript/JavaScript workspace symbols matching a required non-empty query. It does not permit unbounded scans.',
    parameters: { type: 'object', properties: { query: { type: 'string' }, maxResults: { type: 'number' } }, required: ['query'] },
  },
  {
    name: 'lsp_definition',
    description: 'Returns bounded in-workspace definition locations for a TypeScript/JavaScript position.',
    parameters: { type: 'object', properties: { filePath: { type: 'string' }, line: { type: 'number' }, character: { type: 'number' }, maxResults: { type: 'number' } }, required: ['filePath', 'line', 'character'] },
  },
  {
    name: 'lsp_references',
    description: 'Returns bounded in-workspace references for a TypeScript/JavaScript position.',
    parameters: { type: 'object', properties: { filePath: { type: 'string' }, line: { type: 'number' }, character: { type: 'number' }, includeDeclaration: { type: 'boolean' }, maxResults: { type: 'number' } }, required: ['filePath', 'line', 'character'] },
  },
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
    name: 'delete_file',
    description: 'Stages deletion of a text file in the workspace. Always inspect the file first with read_file.',
    parameters: {
      type: 'object',
      properties: { filePath: { type: 'string', description: 'Absolute or relative path to the text file to delete.' } },
      required: ['filePath']
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
  },
  DELEGATE_SUBAGENT_TOOL
];

export function getRoleDefinition(role: GentleRoleId): GentleRoleDefinition {
  const def = GENTLE_ROLE_DEFINITIONS[role];
  if (!def) {
    throw new Error(`Unknown Gentle AI role: ${role}`);
  }
  return def;
}

export function getRolePrompt(role: GentleRoleId): string {
  return getRoleDefinition(role).systemPrompt;
}

export function getRoleAllowedTools(role: GentleRoleId): readonly string[] {
  return getRoleDefinition(role).allowedTools;
}

export function isToolAllowedForRole(role: GentleRoleId, toolName: string): boolean {
  const allowed = getRoleAllowedTools(role);
  return allowed.includes(toolName);
}

export function getToolsForRole(role: GentleRoleId, availableTools: ToolDefinition[] = STANDARD_TOOLS): ToolDefinition[] {
  const allowed = new Set(getRoleAllowedTools(role));
  const tools = availableTools || STANDARD_TOOLS;
  return tools.filter(t => allowed.has(t.name));
}
