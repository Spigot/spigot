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
}

export async function compileContext(
  workspacePath: string | null,
  fileTree: FileNode[],
  selectedPath: string | null
): Promise<CompileResult> {
  let pathsToRead: string[] = [];
  let selectionName = 'Raíz del proyecto';

  if (selectedPath && workspacePath) {
    const node = findNodeByPath(fileTree, selectedPath);
    if (node) {
      selectionName = node.name;
      if (node.isDirectory) {
        pathsToRead = collectFiles(node);
      } else {
        pathsToRead = [node.path];
      }
    } else {
      // Backup: if selected path is root workspace path
      pathsToRead = fileTree.flatMap(collectFiles);
    }
  } else if (workspacePath) {
    pathsToRead = fileTree.flatMap(collectFiles);
  }

  // Always look for PROJECT.md at the root
  let projectMdPath: string | null = null;
  const projectMdNode = fileTree.find(n => n.name.toLowerCase() === 'project.md');
  if (projectMdNode && !projectMdNode.isDirectory) {
    projectMdPath = projectMdNode.path;
  }

  // Ensure PROJECT.md is included, avoiding duplicate addition
  if (projectMdPath && !pathsToRead.includes(projectMdPath)) {
    pathsToRead.push(projectMdPath);
  }

  const filesCompiled: string[] = [];
  let text = '';
  let limitExceeded = false;
  let totalBytes = 0;
  const MAX_FILES = 25;
  const MAX_BYTES = 500 * 1024; // 500KB limit to avoid memory or API bloat

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
  if (limitExceeded) {
    summary += `⚠️ ADVERTENCIA: Se superó el límite de contexto. Algunos archivos se omitieron.\n`;
  }
  summary += `=========================================\n`;

  return {
    text: summary + text,
    filesCompiled,
    limitExceeded
  };
}
