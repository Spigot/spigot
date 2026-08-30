import React, { useMemo, useState, useEffect } from 'react';
import { 
  ChevronRight, ChevronDown, Plus, FolderPlus, 
  RotateCw, ChevronsUp, Trash2, FolderClosed
} from 'lucide-react';
import { useWorkspaceStore, FileNode } from '../../store/workspaceStore';
import { useDiagnosticsStore } from '../../store/diagnosticsStore';
import { FileIcon } from './FileIcon';

interface FileTreeItemProps {
  node: FileNode;
  depth: number;
  expandedPaths: Set<string>;
  toggleExpand: (path: string) => void;
  selectedPath: string | null;
  activeTabPath: string | null;
  onSelect: (path: string, isDirectory: boolean) => void;
  gitStatusMap: Record<string, 'M' | 'U' | 'D' | 'I'>;
  activeCreation: { path: string; type: 'file' | 'directory' } | null;
  creationName: string;
  setCreationName: (name: string) => void;
  handleCreateSubmit: (e: React.FormEvent) => void;
  cancelCreation: () => void;
}

const FileTreeItem: React.FC<FileTreeItemProps> = ({
  node,
  depth,
  expandedPaths,
  toggleExpand,
  selectedPath,
  activeTabPath,
  onSelect,
  gitStatusMap,
  activeCreation,
  creationName,
  setCreationName,
  handleCreateSubmit,
  cancelCreation
}) => {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const isActiveTab = activeTabPath === node.path;
  const errorStatus = useDiagnosticsStore.getState().getFileErrorStatus(node.path);

  const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+/g, '/');
  const normalizedPath = normalize(node.path);

  // Check if ignored by git or known ignore patterns
  const isIgnored = useMemo(() => {
    if (gitStatusMap[normalizedPath] === 'I') return true;
    for (const [path, status] of Object.entries(gitStatusMap)) {
      if (status === 'I' && normalizedPath.startsWith(`${path}/`)) {
        return true;
      }
    }
    return false;
  }, [gitStatusMap, normalizedPath]);

  // Determine Git status and color
  const { labelColor, statusBadge } = useMemo(() => {
    if (errorStatus === 'error') {
      return {
        labelColor: 'text-red-400 font-medium',
        statusBadge: <span className="text-[11px] font-bold text-red-400 shrink-0 mr-2 font-mono">!</span>
      };
    }
    if (errorStatus === 'warning') {
      return {
        labelColor: 'text-amber-400 font-medium',
        statusBadge: <span className="text-[11px] font-bold text-amber-400 shrink-0 mr-2 font-mono">!</span>
      };
    }

    if (node.isDirectory) {
      let hasModified = false;
      let hasUntracked = false;

      for (const [path, status] of Object.entries(gitStatusMap)) {
        if (path.startsWith(`${normalizedPath}/`)) {
          if (status === 'M' || status === 'D') hasModified = true;
          else if (status === 'U') hasUntracked = true;
        }
      }

      if (hasModified) {
        return {
          labelColor: 'text-[#e2c08d]',
          statusBadge: <span className="text-[11px] font-bold text-[#e2c08d] shrink-0 mr-2 font-mono">M</span>
        };
      }
      if (hasUntracked) {
        return {
          labelColor: 'text-[#73c991]',
          statusBadge: <span className="text-[11px] font-bold text-[#73c991] shrink-0 mr-2 font-mono">U</span>
        };
      }

      return {
        labelColor: isIgnored ? 'text-editor-textDark/60 opacity-60' : 'text-editor-text',
        statusBadge: null
      };
    }

    // Single file
    const fileStatus = gitStatusMap[normalizedPath];
    if (fileStatus === 'M') {
      return {
        labelColor: 'text-[#e2c08d]',
        statusBadge: <span className="text-[11px] font-bold text-[#e2c08d] shrink-0 mr-2 font-mono">M</span>
      };
    }
    if (fileStatus === 'U') {
      return {
        labelColor: 'text-[#73c991]',
        statusBadge: <span className="text-[11px] font-bold text-[#73c991] shrink-0 mr-2 font-mono">U</span>
      };
    }
    if (fileStatus === 'D') {
      return {
        labelColor: 'text-[#f85149]',
        statusBadge: <span className="text-[11px] font-bold text-[#f85149] shrink-0 mr-2 font-mono">D</span>
      };
    }

    return {
      labelColor: isIgnored ? 'text-editor-textDark/60 opacity-60' : 'text-editor-text',
      statusBadge: null
    };
  }, [errorStatus, node.isDirectory, normalizedPath, gitStatusMap, isIgnored]);

  // Children creation row active in this folder
  const isCreatingInThisFolder = activeCreation && activeCreation.path === node.path && isExpanded;

  return (
    <div className="flex flex-col select-none text-[13px]">
      <div
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.path, node.isDirectory);
          if (node.isDirectory) {
            toggleExpand(node.path);
          }
        }}
        className={`h-[22px] min-h-[22px] flex items-center justify-between cursor-pointer transition-colors group relative ${
          isSelected 
            ? 'bg-editor-active text-white' 
            : isActiveTab 
            ? 'bg-editor-hover/80 text-white' 
            : 'hover:bg-editor-hover text-editor-text'
        }`}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        <div className="flex items-center gap-1 min-w-0 flex-1 h-full pr-1">
          {/* Chevron for folder or empty spacer for files */}
          {node.isDirectory ? (
            <div 
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.path);
              }}
              className="w-3.5 h-3.5 flex items-center justify-center shrink-0 text-editor-textDark hover:text-editor-text"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </div>
          ) : (
            <div className="w-3.5 h-3.5 shrink-0" />
          )}

          {/* Dedicated Material Icon */}
          <div className="w-4 h-4 flex items-center justify-center shrink-0">
            <FileIcon 
              name={node.name} 
              isDirectory={node.isDirectory} 
              isOpen={isExpanded} 
            />
          </div>

          {/* File / Folder Name */}
          <span className={`truncate text-[13px] leading-none ${labelColor}`}>
            {node.name}
          </span>
        </div>

        {/* Right Git / Diagnostic Badge */}
        {statusBadge}
      </div>

      {/* Inline Creation Input if inside this expanded directory */}
      {isCreatingInThisFolder && (
        <form
          onSubmit={handleCreateSubmit}
          className="h-[22px] flex items-center bg-editor-bg border border-editor-accent my-0.5"
          style={{ paddingLeft: `${(depth + 1) * 12 + 6}px` }}
        >
          <div className="w-3.5 h-3.5 shrink-0 mr-1 flex items-center justify-center">
            {activeCreation.type === 'directory' ? (
              <ChevronRight className="w-3.5 h-3.5 text-editor-textDark" />
            ) : null}
          </div>
          <FileIcon 
            name={creationName || (activeCreation.type === 'file' ? 'file.ts' : 'folder')} 
            isDirectory={activeCreation.type === 'directory'} 
          />
          <input
            autoFocus
            type="text"
            value={creationName}
            onChange={(e) => setCreationName(e.target.value)}
            onBlur={cancelCreation}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelCreation();
            }}
            placeholder={activeCreation.type === 'file' ? 'nombre.ext' : 'nombre-carpeta'}
            className="bg-transparent text-[12px] text-editor-text outline-none w-full ml-1 font-sans"
          />
        </form>
      )}

      {/* Expanded Children */}
      {node.isDirectory && isExpanded && node.children && (
        <div className="flex flex-col">
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
              selectedPath={selectedPath}
              activeTabPath={activeTabPath}
              onSelect={onSelect}
              gitStatusMap={gitStatusMap}
              activeCreation={activeCreation}
              creationName={creationName}
              setCreationName={setCreationName}
              handleCreateSubmit={handleCreateSubmit}
              cancelCreation={cancelCreation}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const FileTree: React.FC = () => {
  const {
    workspacePath,
    fileTree,
    selectWorkspace,
    refreshWorkspace,
    openFile,
    activeTabPath,
    createItem,
    deleteItem,
    explorerSelectedPath,
    setExplorerSelectedPath,
    gitStatusMap,
  } = useWorkspaceStore();

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [isRootExpanded, setIsRootExpanded] = useState(true);
  const [isOutlineExpanded, setIsOutlineExpanded] = useState(false);
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);

  const [activeCreation, setActiveCreation] = useState<{ path: string; type: 'file' | 'directory' } | null>(null);
  const [creationName, setCreationName] = useState('');

  // Find workspace root name
  const workspaceRootName = useMemo(() => {
    if (!workspacePath) return '';
    const parts = workspacePath.split(/[/\\]/);
    return parts[parts.length - 1] || 'workspace';
  }, [workspacePath]);

  // Expand folders on initial load
  useEffect(() => {
    if (workspacePath) {
      setExpandedPaths(new Set());
    }
  }, [workspacePath]);

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const collapseAll = () => {
    setExpandedPaths(new Set());
  };

  const startCreation = (type: 'file' | 'directory') => {
    if (!workspacePath) return;
    let targetPath = workspacePath;

    if (explorerSelectedPath) {
      const findNode = (nodes: FileNode[]): FileNode | null => {
        for (const n of nodes) {
          if (n.path === explorerSelectedPath) return n;
          if (n.children) {
            const found = findNode(n.children);
            if (found) return found;
          }
        }
        return null;
      };

      const selectedNode = findNode(fileTree);
      if (selectedNode) {
        if (selectedNode.isDirectory) {
          targetPath = selectedNode.path;
          setExpandedPaths((prev) => new Set(prev).add(targetPath));
        } else {
          const parentParts = selectedNode.path.split(/[/\\]/);
          parentParts.pop();
          targetPath = parentParts.join('/');
        }
      }
    }

    setActiveCreation({ path: targetPath, type });
    setCreationName('');
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creationName.trim() || !activeCreation) return;

    await createItem(creationName.trim(), activeCreation.type, activeCreation.path);
    setActiveCreation(null);
    setCreationName('');
  };

  const handleDeleteSelected = async () => {
    if (!explorerSelectedPath) return;
    const parts = explorerSelectedPath.split(/[/\\]/);
    const itemName = parts[parts.length - 1];
    if (window.confirm(`¿Estás seguro de que deseas eliminar "${itemName}"?`)) {
      await deleteItem(explorerSelectedPath);
      setExplorerSelectedPath(null);
    }
  };

  if (!workspacePath) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center p-5 text-center h-full min-h-[280px] bg-editor-sidebar">
        <FolderClosed className="w-10 h-10 text-editor-textDark mb-3 opacity-60" />
        <p className="text-[12px] text-editor-textDark mb-4 leading-relaxed">
          No hay ninguna carpeta de proyecto abierta en el explorador.
        </p>
        <button
          onClick={selectWorkspace}
          className="bg-editor-active hover:bg-editor-hover text-white text-[12px] font-medium px-4 py-1.5 rounded transition-colors shadow-sm"
        >
          Abrir Carpeta
        </button>
      </div>
    );
  }

  const isCreatingInRoot = activeCreation && activeCreation.path === workspacePath;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-editor-sidebar select-none text-[13px]">
      {/* 1. Main Workspace Root Collapsible Item (VS Code Style) */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {/* Workspace Root Row */}
        <div 
          onClick={() => setIsRootExpanded(!isRootExpanded)}
          className="h-[22px] min-h-[22px] px-2 flex items-center justify-between font-bold text-[11px] text-editor-text tracking-wider uppercase hover:bg-editor-hover cursor-pointer group"
        >
          <div className="flex items-center gap-1 truncate">
            {isRootExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-editor-textDark" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-editor-textDark" />
            )}
            <span className="truncate">{workspaceRootName}</span>
          </div>

          {/* Action Toolbar on Hover */}
          <div 
            className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => startCreation('file')}
              className="p-0.5 hover:bg-editor-active text-editor-textDark hover:text-white rounded"
              title="Nuevo archivo"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => startCreation('directory')}
              className="p-0.5 hover:bg-editor-active text-editor-textDark hover:text-white rounded"
              title="Nueva carpeta"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={refreshWorkspace}
              className="p-0.5 hover:bg-editor-active text-editor-textDark hover:text-white rounded"
              title="Actualizar explorador"
            >
              <RotateCw className="w-3 h-3" />
            </button>
            <button
              onClick={collapseAll}
              className="p-0.5 hover:bg-editor-active text-editor-textDark hover:text-white rounded"
              title="Colapsar carpetas"
            >
              <ChevronsUp className="w-3.5 h-3.5" />
            </button>
            {explorerSelectedPath && (
              <button
                onClick={handleDeleteSelected}
                className="p-0.5 hover:bg-editor-active text-editor-textDark hover:text-red-400 rounded"
                title="Eliminar elemento seleccionado"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Root Inline Creation Input */}
        {isCreatingInRoot && (
          <form
            onSubmit={handleCreateSubmit}
            className="h-[22px] flex items-center bg-editor-bg border border-editor-accent my-0.5 pl-6 pr-2"
          >
            <FileIcon 
              name={creationName || (activeCreation.type === 'file' ? 'file.ts' : 'folder')} 
              isDirectory={activeCreation.type === 'directory'} 
            />
            <input
              autoFocus
              type="text"
              value={creationName}
              onChange={(e) => setCreationName(e.target.value)}
              onBlur={() => setActiveCreation(null)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setActiveCreation(null);
              }}
              placeholder={activeCreation.type === 'file' ? 'nombre.ext' : 'nombre-carpeta'}
              className="bg-transparent text-[12px] text-editor-text outline-none w-full ml-1 font-sans"
            />
          </form>
        )}

        {/* Tree Items List */}
        {isRootExpanded && (
          <div className="flex flex-col">
            {fileTree.map((node) => (
              <FileTreeItem
                key={node.path}
                node={node}
                depth={1}
                expandedPaths={expandedPaths}
                toggleExpand={toggleExpand}
                selectedPath={explorerSelectedPath}
                activeTabPath={activeTabPath}
                onSelect={async (path, isDirectory) => {
                  setExplorerSelectedPath(path);
                  if (!isDirectory) {
                    await openFile(path);
                  }
                }}
                gitStatusMap={gitStatusMap}
                activeCreation={activeCreation}
                creationName={creationName}
                setCreationName={setCreationName}
                handleCreateSubmit={handleCreateSubmit}
                cancelCreation={() => setActiveCreation(null)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 2. Collapsible Bottom Sections (VS Code Style) */}
      <div className="border-t border-editor-border shrink-0">
        {/* Outline Section */}
        <div 
          onClick={() => setIsOutlineExpanded(!isOutlineExpanded)}
          className="h-[22px] min-h-[22px] px-2 flex items-center justify-between text-[11px] font-bold text-editor-textDark hover:text-editor-text uppercase tracking-wider hover:bg-editor-hover cursor-pointer select-none border-b border-editor-border/40"
        >
          <div className="flex items-center gap-1">
            {isOutlineExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            <span>Outline</span>
          </div>
        </div>
        {isOutlineExpanded && (
          <div className="p-3 text-[11px] text-editor-textDark italic text-center bg-editor-sidebar">
            No hay símbolos de esquema disponibles.
          </div>
        )}

        {/* Timeline Section */}
        <div 
          onClick={() => setIsTimelineExpanded(!isTimelineExpanded)}
          className="h-[22px] min-h-[22px] px-2 flex items-center justify-between text-[11px] font-bold text-editor-textDark hover:text-editor-text uppercase tracking-wider hover:bg-editor-hover cursor-pointer select-none"
        >
          <div className="flex items-center gap-1">
            {isTimelineExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            <span>Timeline</span>
          </div>
        </div>
        {isTimelineExpanded && (
          <div className="p-3 text-[11px] text-editor-textDark italic text-center bg-editor-sidebar">
            No hay historial de línea de tiempo.
          </div>
        )}
      </div>
    </div>
  );
};

export default FileTree;
