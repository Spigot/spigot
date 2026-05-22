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
          className="bg-white text-black text-xs font-semibold px-4 py-2 rounded-lg shadow hover:bg-zinc-200 active:scale-95 transition-all-custom"
        >
          Abrir Carpeta
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col py-2 px-2 gap-2">
      <div className="px-3 py-2 flex items-center justify-between text-[10px] text-zinc-300 font-bold uppercase tracking-[0.14em] select-none bg-zinc-950/45 border border-zinc-800/80 rounded-xl shadow-sm">
        <div className="min-w-0 flex flex-col leading-tight">
          <span>Archivos</span>
        </div>

        <div className="flex items-center gap-1.5 text-zinc-400">
          <button
            onClick={() => setCollapseVersion((version) => version + 1)}
            className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-white transition-all-custom"
            title="Colapsar todo"
          >
            <ChevronsUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => startCreation('file')}
            className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-white transition-all-custom"
            title="Nuevo Archivo"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => startCreation('directory')}
            className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-white transition-all-custom"
            title="Nueva Carpeta"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDeleteSelected}
            disabled={!selectedNode}
            className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-red-300 disabled:opacity-35 disabled:hover:bg-transparent transition-all-custom"
            title="Eliminar Seleccionado"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {activeCreation && (
        <form
          onSubmit={handleCreate}
          className="flex items-center gap-2 py-1.5 px-3 bg-zinc-950/70 border border-zinc-700/80 rounded-xl shadow-inner"
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
        <div className="px-4 py-5 text-center text-[11px] text-zinc-500 italic border border-zinc-800/70 rounded-xl bg-zinc-950/30">
          El directorio está vacío.
        </div>
      ) : (
        <TreeView
          key={collapseVersion}
          data={treeData}
          selectedIds={explorerSelectedPath ? [explorerSelectedPath] : []}
          onSelectionChange={(selectedIds) => setExplorerSelectedPath(selectedIds[0] ?? null)}
          onNodeClick={async (node) => {
            const meta = node.data as NodeMeta;
            setExplorerSelectedPath(meta.path);
            if (!meta.isDirectory) {
              await openFile(meta.path);
            }
          }}
          defaultExpandedIds={[]}
          indent={16}
          animateExpand
          className="bg-zinc-950/25 border-zinc-800/80 text-zinc-200 shadow-[0_16px_40px_rgba(0,0,0,0.16)] [&_.bg-accent\/80]:bg-zinc-800/90 [&_.hover\:bg-accent\/50:hover]:bg-zinc-800/65 [&_.border-border\/40]:border-zinc-700/45 [&_.text-muted-foreground]:text-zinc-400 [&_.text-sm]:text-[12.5px] [&_.text-sm]:font-semibold [&_.text-sm]:text-zinc-200 [&_.rounded-md]:rounded-lg [&_.py-2]:py-1.5"
        />
      )}
    </div>
  );
};

export default FileTree;
