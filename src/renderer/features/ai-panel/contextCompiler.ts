import { FileNode } from '../../store/workspaceStore';

// Walks tree recursively to collect all file paths inside a directory node
function collectFiles(node: FileNode): string[] {
  if (!node.isDirectory) return [node.path];
  
  let files: string[] = [];
  if (node.children) {
    for (const child of node.children) {
      files = [...files, ...collectFiles(child)];
    }
  }
  return files;
}

// Find a specific node by path in the file tree
function findNodeByPath(nodes: FileNode[], targetPath: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node;
    if (node.isDirectory && node.children) {
      const found = findNodeByPath(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

interface CompileResult {
  text: string;
  filesCompiled: string[];
  limitExceeded: boolean;
  contextSource: 'default' | 'explicit';
}

export async function compileContext(
  workspacePath: string | null,
  fileTree: FileNode[],
  selectedPath: string | null,
  mentionedPaths: string[] = [],
  semanticQuery = ''
): Promise<CompileResult> {
  let pathsToRead: string[] = [];
  let selectionName = 'Raíz del proyecto';

  // 1. First add explicitly mentioned files (@filename) with top priority
  if (mentionedPaths && mentionedPaths.length > 0) {
    for (const mPath of mentionedPaths) {
      if (!pathsToRead.includes(mPath)) {
        pathsToRead.push(mPath);
      }
    }
  }

  // 2. Add selected path / active tree node
  if (pathsToRead.length === 0 && selectedPath && workspacePath) {
    const node = findNodeByPath(fileTree, selectedPath);
    if (node) {
      selectionName = node.name;
      if (node.isDirectory) {
        for (const f of collectFiles(node)) {
          if (!pathsToRead.includes(f)) pathsToRead.push(f);
        }
      } else {
        if (!pathsToRead.includes(node.path)) pathsToRead.push(node.path);
      }
    } else {
      for (const f of fileTree.flatMap(collectFiles)) {
        if (!pathsToRead.includes(f)) pathsToRead.push(f);
      }
    }
  }

  // Always look for PROJECT.md or README.md at the root
  let projectMdPath: string | null = null;
  const projectMdNode = fileTree.find(n => n.name.toLowerCase() === 'project.md' || n.name.toLowerCase() === 'readme.md');
  if (projectMdNode && !projectMdNode.isDirectory) {
    projectMdPath = projectMdNode.path;
  }

  if (projectMdPath && pathsToRead.length === 0 && !pathsToRead.includes(projectMdPath)) {
    pathsToRead.push(projectMdPath);
  }

  let semanticText = '';
  if (workspacePath && semanticQuery.trim() && mentionedPaths.length > 0 && (window as any).api?.semantic?.retrieve) {
    try {
      const semantic = await (window as any).api.semantic.retrieve({ workspacePath, query: semanticQuery, explicitPaths: mentionedPaths });
      if (semantic.status === 'ok' || semantic.status === 'fallback_lexical') {
        semanticText = semantic.snippets.map((snippet: { citation: string; text: string }) => `--- SEMANTIC SOURCE: ${snippet.citation} ---\n${snippet.text}`).join('\n');
      }
    } catch (err) {
      console.warn('Semantic context unavailable:', err);
    }
  }

  const filesCompiled: string[] = [];
  let text = '';
  let limitExceeded = false;
  let totalBytes = 0;
  const hasExplicitContext = mentionedPaths.length > 0 || Boolean(selectedPath);
  const MAX_FILES = hasExplicitContext ? 25 : 2;
  const MAX_BYTES = hasExplicitContext ? 500 * 1024 : 16 * 1024;

  for (const fPath of pathsToRead) {
    if (filesCompiled.length >= MAX_FILES || totalBytes >= MAX_BYTES) {
      limitExceeded = true;
      break;
    }

    // Skip large binary files or lockfiles
    const lower = fPath.toLowerCase();
    if (
      lower.endsWith('.png') || 
      lower.endsWith('.jpg') || 
      lower.endsWith('.ico') || 
      lower.endsWith('.exe') ||
      lower.endsWith('.dll') ||
      lower.endsWith('.zip') ||
      lower.endsWith('package-lock.json')
    ) {
      continue;
    }

    try {
      const content = await (window as any).api.fs.readFile(fPath);
      const relativePath = workspacePath ? fPath.replace(workspacePath, '') : fPath;
      
      const fileHeader = `\n--- ARCHIVO: ${relativePath} ---\n`;
      text += fileHeader + content + '\n';
      
      filesCompiled.push(relativePath);
      totalBytes += content.length + fileHeader.length;
    } catch (err) {
      console.error(`Failed to read path for AI Context compiler: ${fPath}`, err);
    }
  }

  // Prepend summary
  let summary = `Contexto del Agente (Seleccionado: ${selectionName})\n`;
  summary += `Archivos analizados:\n` + filesCompiled.map(f => `- ${f}`).join('\n') + '\n';
  summary += `=========================================\n`;

  return {
    text: summary + text + (semanticText ? `\n${semanticText}\n` : ''),
    filesCompiled,
    limitExceeded,
    contextSource: hasExplicitContext ? 'explicit' : 'default',
  };
}
