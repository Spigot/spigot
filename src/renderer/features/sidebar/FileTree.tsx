import React, { useState } from 'react';
import { useWorkspaceStore, FileNode } from '../../store/workspaceStore';
import { 
  Folder, FolderOpen, FileCode, Plus, FolderPlus, Trash2, ChevronRight, ChevronDown, FolderClosed 
} from 'lucide-react';

export const FileTree: React.FC = () => {
  const { 
    workspacePath, fileTree, selectWorkspace, openFile, activeTabPath, createItem, deleteItem,
    explorerSelectedPath, setExplorerSelectedPath, gitChangedFiles
  } = useWorkspaceStore();

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [activeCreation, setActiveCreation] = useState<{ path: string; type: 'file' | 'directory' } | null>(null);
  const [creationName, setCreationName] = useState('');

  const toggleExpand = (path: string) => {
    setExpandedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creationName.trim() || !activeCreation) return;
    
    await createItem(creationName.trim(), activeCreation.type, activeCreation.path);
    setActiveCreation(null);
    setCreationName('');
  };

  // Render a single file or directory node recursively
  const renderNode = (node: FileNode, depth = 0) => {
    const isFolder = node.isDirectory;
    const isExpanded = !!expandedFolders[node.path];
    const isFileActive = activeTabPath === node.path;
    const isExplorerSelected = explorerSelectedPath === node.path;

    const normalizedNodePath = node.path.replace(/\\/g, '/').replace(/\/+/g, '/');
    const hasGitChanges = isFolder
      ? gitChangedFiles.some(
          (f) => f.replace(/\\/g, '/').replace(/\/+/g, '/').startsWith(normalizedNodePath + '/')
        )
      : gitChangedFiles.some(
          (f) => f.replace(/\\/g, '/').replace(/\/+/g, '/') === normalizedNodePath
        );

    return (
      <div key={node.path} className="flex flex-col">
        {/* Row element */}
        <div 
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          className={`group flex items-center justify-between py-1 pr-2 hover:bg-editor-hover cursor-pointer text-sm transition-all-custom border-l-2 relative ${
            isExplorerSelected 
              ? 'bg-zinc-800/60 border-white text-white font-medium' 
              : isFileActive 
                ? 'bg-editor-active border-transparent text-white' 
                : 'border-transparent text-editor-text'
          }`}
          onClick={() => {
            setExplorerSelectedPath(node.path);
            if (isFolder) {
              toggleExpand(node.path);
            } else {
              openFile(node.path);
            }
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {isFolder ? (
              <>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-editor-textDark shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-editor-textDark shrink-0" />
                )}
                {isExpanded ? (
                  <FolderOpen className="w-4.5 h-4.5 text-amber-400 shrink-0" />
                ) : (
                  <Folder className="w-4.5 h-4.5 text-amber-400 shrink-0" />
                )}
              </>
            ) : (
              <>
                <div className="w-4 h-4 shrink-0" /> {/* Alignment spacer */}
                <span className={`text-[13.5px] font-bold shrink-0 select-none w-4.5 h-4.5 flex items-center justify-center transition-colors ${hasGitChanges ? 'text-amber-500 font-extrabold' : 'text-sky-400'}`}>
                  &gt;
                </span>
              </>
            )}
            <span className={`truncate ${hasGitChanges && !isFileActive && !isExplorerSelected ? 'text-amber-400/90 font-medium' : ''}`}>
              {node.name}
            </span>
            {hasGitChanges && (
              <span 
                className="w-2 h-2 rounded-full bg-amber-500 shrink-0 ml-1" 
                title="Cambios sin confirmar" 
              />
            )}
          </div>

          {/* Inline Action buttons shown on hover */}
          <div className="hidden group-hover:flex items-center gap-1">
            {isFolder && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedFolders((p) => ({ ...p, [node.path]: true }));
                    setActiveCreation({ path: node.path, type: 'file' });
                  }}
                  className="p-0.5 hover:bg-zinc-700 rounded text-editor-textDark hover:text-white"
                  title="Nuevo Archivo"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedFolders((p) => ({ ...p, [node.path]: true }));
                    setActiveCreation({ path: node.path, type: 'directory' });
                  }}
                  className="p-0.5 hover:bg-zinc-700 rounded text-editor-textDark hover:text-white"
                  title="Nueva Carpeta"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`¿Estás seguro de eliminar ${node.name}?`)) {
                  deleteItem(node.path);
                }
              }}
              className="p-0.5 hover:bg-zinc-700 rounded text-editor-textDark hover:text-red-400"
              title="Eliminar"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Input box to create file or folder inline */}
        {activeCreation && activeCreation.path === node.path && (
          <form 
            onSubmit={handleCreate}
            style={{ paddingLeft: `${(depth + 1) * 12 + 16}px` }}
            className="flex items-center gap-1.5 py-1 pr-2 bg-editor-hover"
            onClick={(e) => e.stopPropagation()}
          >
            {activeCreation.type === 'file' ? (
              <FileCode className="w-4 h-4 text-sky-400" />
            ) : (
              <Folder className="w-4 h-4 text-amber-400" />
            )}
            <input
              autoFocus
              type="text"
              value={creationName}
              onChange={(e) => setCreationName(e.target.value)}
              onBlur={() => setActiveCreation(null)}
              placeholder={activeCreation.type === 'file' ? 'nombre.txt' : 'Nueva carpeta'}
              className="bg-editor-bg border border-editor-accent text-[11px] px-1 py-0.5 rounded outline-none text-white w-full"
            />
          </form>
        )}

        {/* Render children folders recursively */}
        {isFolder && isExpanded && node.children && (
          <div className="flex flex-col">
            {node.children.map((child) => renderNode(child, depth + 1))}
            {node.children.length === 0 && (
              <div 
                style={{ paddingLeft: `${(depth + 1) * 12 + 24}px` }}
                className="text-[10px] text-editor-textDark py-1 font-mono italic"
              >
                (Vacío)
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!workspacePath) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center p-6 text-center h-full min-h-[300px]">
        <FolderClosed className="w-12 h-12 text-editor-textDark mb-4 opacity-40 animate-pulse" />
        <p className="text-xs text-editor-textDark mb-4 leading-relaxed font-medium">
          No hay ninguna carpeta de proyecto cargada en el explorador.
        </p>
        <button
          onClick={selectWorkspace}
          className="bg-white text-black text-xs font-semibold px-4 py-2 rounded shadow hover:bg-zinc-200 active:scale-95 transition-all-custom"
        >
          Abrir Carpeta
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col py-1">
      {/* Root actions header */}
      <div className="px-3 py-1.5 flex items-center justify-between text-[11px] text-editor-textDark font-bold uppercase tracking-wider select-none bg-zinc-800/40">
        <span>Archivos</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveCreation({ path: workspacePath, type: 'file' })}
            className="hover:text-white transition-all-custom"
            title="Nuevo Archivo Raíz"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setActiveCreation({ path: workspacePath, type: 'directory' })}
            className="hover:text-white transition-all-custom"
            title="Nueva Carpeta Raíz"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Root creation form inline */}
      {activeCreation && activeCreation.path === workspacePath && (
        <form 
          onSubmit={handleCreate}
          className="flex items-center gap-1.5 py-1 px-4 bg-editor-hover border-y border-zinc-800"
        >
          {activeCreation.type === 'file' ? (
            <FileCode className="w-4 h-4 text-sky-400" />
          ) : (
            <Folder className="w-4 h-4 text-amber-400" />
          )}
          <input
            autoFocus
            type="text"
            value={creationName}
            onChange={(e) => setCreationName(e.target.value)}
            onBlur={() => setActiveCreation(null)}
            placeholder={activeCreation.type === 'file' ? 'nombre.txt' : 'Nueva carpeta'}
            className="bg-editor-bg border border-editor-accent text-[11px] px-1 py-0.5 rounded outline-none text-white w-full"
          />
        </form>
      )}

      {/* Directory Node Renders */}
      <div className="flex flex-col mt-1">
        {fileTree.map((node) => renderNode(node))}
        {fileTree.length === 0 && (
          <div className="px-4 py-3 text-center text-xs text-editor-textDark italic">
            El directorio está vacío.
          </div>
        )}
      </div>
    </div>
  );
};
export default FileTree;
