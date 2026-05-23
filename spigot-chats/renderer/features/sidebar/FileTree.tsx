import React, { useMemo, useState } from 'react';
import { ChevronsUp, Folder, FolderOpen, FileCode, Plus, FolderPlus, Trash2, FolderClosed } from 'lucide-react';
import { TreeNode, TreeView } from '@/components/ui/tree-view';
import { useWorkspaceStore, FileNode } from '../../store/workspaceStore';

type NodeMeta = {
  path: string;
  isDirectory: boolean;
  hasChanges: boolean;
};

export const FileTree: React.FC = () => {
  const {
    workspacePath,
    fileTree,
    selectWorkspace,
    openFile,
    activeTabPath,
    createItem,
    deleteItem,
    explorerSelectedPath,
    setExplorerSelectedPath,
    gitChangedFiles,
  } = useWorkspaceStore();

  const [activeCreation, setActiveCreation] = useState<{ path: string; type: 'file' | 'directory' } | null>(null);
  const [creationName, setCreationName] = useState('');
  const [collapseVersion, setCollapseVersion] = useState(0);

  const normalizePath = (path: string) => path.replace(/\\/g, '/').replace(/\/+/g, '/');

  const changedPaths = useMemo(
    () => gitChangedFiles.map((path) => normalizePath(path)),
    [gitChangedFiles],
  );

  const getHasGitChanges = (node: FileNode) => {
    const normalizedNodePath = normalizePath(node.path);

    return node.isDirectory
      ? changedPaths.some((path) => path.startsWith(`${normalizedNodePath}/`))
      : changedPaths.some((path) => path === normalizedNodePath);
  };

  const fileNodeByPath = useMemo(() => {
    const map = new Map<string, FileNode>();

    const visit = (nodes: FileNode[]) => {
      nodes.forEach((node) => {
        map.set(node.path, node);
        if (node.children) visit(node.children);
      });
    };

    visit(fileTree);
    return map;
  }, [fileTree]);

  const treeData = useMemo<TreeNode[]>(() => {
    const toTreeNode = (node: FileNode): TreeNode => {
      const hasChanges = getHasGitChanges(node);
      const isActive = activeTabPath === node.path;
      const isSelected = explorerSelectedPath === node.path;

      const iconClassName = hasChanges
        ? 'text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.35)]'
        : node.isDirectory
          ? 'text-sky-300'
          : isActive || isSelected
            ? 'text-zinc-100'
            : 'text-zinc-400';

      return {
        id: node.path,
        label: node.name,
        data: { path: node.path, isDirectory: node.isDirectory, hasChanges } satisfies NodeMeta,
        icon: node.isDirectory ? (
          <Folder className={`h-4 w-4 ${iconClassName}`} />
        ) : (
          <FileCode className={`h-4 w-4 ${iconClassName}`} />
        ),
        children: node.children?.map(toTreeNode),
      };
    };

    return fileTree.map(toTreeNode);
  }, [activeTabPath, changedPaths, explorerSelectedPath, fileTree]);

  const selectedNode = explorerSelectedPath ? fileNodeByPath.get(explorerSelectedPath) : undefined;
  const creationBasePath = selectedNode?.isDirectory ? selectedNode.path : workspacePath;

  const startCreation = (type: 'file' | 'directory') => {
    if (!creationBasePath) return;
    setActiveCreation({ path: creationBasePath, type });
    setCreationName('');
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!creationName.trim() || !activeCreation) return;

    await createItem(creationName.trim(), activeCreation.type, activeCreation.path);
    setActiveCreation(null);
    setCreationName('');
  };

  const handleDeleteSelected = async () => {
    if (!selectedNode) return;
    if (confirm(`¿Estás seguro de eliminar ${selectedNode.name}?`)) {
      await deleteItem(selectedNode.path);
      setExplorerSelectedPath(null);
    }
  };

  if (!workspacePath) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center p-5 text-center h-full min-h-[280px]">
        <FolderClosed className="w-10 h-10 text-zinc-500 mb-3 opacity-70" />
        <p className="text-xs text-zinc-400 mb-4 leading-relaxed font-medium">
          No hay ninguna carpeta de proyecto cargada en el explorador.
        </p>
        <button
          onClick={selectWorkspace}
          className="bg-editor-active text-white text-xs font-semibold px-4 py-2 rounded-none shadow-none hover:bg-editor-hover active:scale-95 transition-all-custom"
        >
          Abrir Carpeta
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col py-1 px-1 gap-1">
      <div className="flex items-center justify-between text-[10px] text-zinc-300 font-bold uppercase tracking-[0.14em] select-none border-b border-editor-border">
        <div className="min-w-0 flex flex-col leading-tight">
          <span>Archivos</span>
        </div>

        <div className="flex items-center gap-1.5 text-zinc-400">
          <button
            onClick={() => setCollapseVersion((version) => version + 1)}
            className="p-0.5 rounded-none hover:bg-editor-hover hover:text-white transition-colors"
            title="Colapsar todo"
          >
            <ChevronsUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => startCreation('file')}
            className="p-0.5 rounded-none hover:bg-editor-hover hover:text-white transition-colors"
            title="Nuevo Archivo"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => startCreation('directory')}
            className="p-0.5 rounded-none hover:bg-editor-hover hover:text-white transition-colors"
            title="Nueva Carpeta"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDeleteSelected}
            disabled={!selectedNode}
            className="p-0.5 rounded-none hover:bg-editor-hover hover:text-red-300 disabled:opacity-35 disabled:hover:bg-transparent transition-colors"
            title="Eliminar Seleccionado"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {activeCreation && (
        <form
          onSubmit={handleCreate}
          className="flex items-center gap-2 py-1 px-2 bg-editor-active/80 border border-editor-border rounded-none"
        >
          {activeCreation.type === 'file' ? (
            <FileCode className="w-4 h-4 text-zinc-300 shrink-0" />
          ) : (
            <FolderOpen className="w-4 h-4 text-sky-300 shrink-0" />
          )}
          <input
            autoFocus
            type="text"
            value={creationName}
            onChange={(event) => setCreationName(event.target.value)}
            onBlur={() => setActiveCreation(null)}
            placeholder={activeCreation.type === 'file' ? 'nombre.txt' : 'Nueva carpeta'}
            className="bg-transparent text-[12px] outline-none text-zinc-100 placeholder-zinc-500 w-full"
          />
        </form>
      )}

      {treeData.length === 0 ? (
        <div className="px-3 py-4 text-center text-[11px] text-zinc-500 italic border border-editor-border rounded-none bg-editor-active/15">
          El directorio está vacío.
        </div>
      ) : (
        <TreeView
          key={collapseVersion}
          data={treeData}
          selectedIds={explorerSelectedPath ? [explorerSelectedPath] : []}
          onSelectionChange={(selectedIds: string[]) => setExplorerSelectedPath(selectedIds[0] ?? null)}
          onNodeClick={async (node: any) => {
            const meta = node.data as NodeMeta;
            setExplorerSelectedPath(meta.path);
            if (!meta.isDirectory) {
              await openFile(meta.path);
            }
          }}
          defaultExpandedIds={[]}
          indent={16}
          animateExpand
          className="bg-editor-bg text-zinc-200 [&_.bg-accent\/80]:bg-editor-hover [&_.hover\:bg-accent\/50:hover]:bg-editor-hover [&_.border-border\/40]:border-editor-border [&_.text-muted-foreground]:text-zinc-400 [&_.text-sm]:text-[12.5px] [&_.text-sm]:font-normal [&_.text-sm]:text-zinc-200 [&_.rounded-none]:rounded-none [&_.py-1]:py-1"
        />
      )}
    </div>
  );
};

export default FileTree;

