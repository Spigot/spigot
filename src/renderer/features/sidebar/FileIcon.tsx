import React from 'react';
import { 
  Folder, FolderOpen, Image, Star, Code2, 
  GitBranch, Info, Zap, FileText, Database, Terminal
} from 'lucide-react';

interface FileIconProps {
  name: string;
  isDirectory: boolean;
  isOpen?: boolean;
  className?: string;
}

export const FileIcon: React.FC<FileIconProps> = ({ 
  name, 
  isDirectory, 
  isOpen = false, 
  className = '' 
}) => {
  if (isDirectory) {
    return isOpen ? (
      <FolderOpen className={`w-3.5 h-3.5 text-[#388bfd] shrink-0 ${className}`} />
    ) : (
      <Folder className={`w-3.5 h-3.5 text-[#388bfd] shrink-0 ${className}`} />
    );
  }

  const lowerName = name.toLowerCase();

  // Special exact filenames
  if (lowerName === '.npmrc') {
    return (
      <span className={`inline-flex items-center justify-center bg-[#cb3837] text-white text-[7px] font-bold px-0.5 py-0 rounded-[1px] font-mono leading-none shrink-0 ${className}`}>
        npm
      </span>
    );
  }

  if (lowerName === '.gitignore' || lowerName === '.gitmodules' || lowerName === '.gitattributes') {
    return <GitBranch className={`w-3.5 h-3.5 text-[#f05032] shrink-0 ${className}`} />;
  }

  if (lowerName === 'readme.md') {
    return <Info className={`w-3.5 h-3.5 text-[#58a6ff] shrink-0 ${className}`} />;
  }

  if (lowerName === 'vite.config.ts' || lowerName === 'vite.config.js') {
    return <Zap className={`w-3.5 h-3.5 text-[#e3a808] fill-[#e3a808] shrink-0 ${className}`} />;
  }

  if (lowerName.endsWith('.ico')) {
    return <Star className={`w-3.5 h-3.5 text-[#e3a808] fill-[#e3a808] shrink-0 ${className}`} />;
  }

  // Extensions
  if (lowerName.endsWith('.tsx')) {
    return (
      <span className={`inline-flex items-center justify-center bg-[#3178c6] text-white text-[7.5px] font-bold px-0.5 rounded-[2px] font-mono leading-tight shrink-0 ${className}`}>
        TS
      </span>
    );
  }

  if (lowerName.endsWith('.ts') || lowerName.endsWith('.mts') || lowerName.endsWith('.cts')) {
    return (
      <span className={`inline-flex items-center justify-center bg-[#3178c6] text-white text-[8px] font-bold px-0.5 rounded-[2px] font-mono leading-tight shrink-0 ${className}`}>
        TS
      </span>
    );
  }

  if (lowerName.endsWith('.jsx')) {
    return (
      <span className={`inline-flex items-center justify-center bg-[#f7df1e] text-black text-[7.5px] font-bold px-0.5 rounded-[2px] font-mono leading-tight shrink-0 ${className}`}>
        JS
      </span>
    );
  }

  if (lowerName.endsWith('.js') || lowerName.endsWith('.mjs') || lowerName.endsWith('.cjs')) {
    return (
      <span className={`inline-flex items-center justify-center bg-[#f7df1e] text-black text-[8px] font-bold px-0.5 rounded-[2px] font-mono leading-tight shrink-0 ${className}`}>
        JS
      </span>
    );
  }

  if (lowerName.endsWith('.json') || lowerName.endsWith('.jsonc')) {
    return (
      <span className={`inline-flex items-center justify-center text-[#cbcb41] font-bold text-[11px] font-mono leading-none shrink-0 ${className}`}>
        {'{ }'}
      </span>
    );
  }

  if (lowerName.endsWith('.yaml') || lowerName.endsWith('.yml')) {
    return (
      <span className={`inline-flex items-center justify-center text-[#cb89fc] font-extrabold text-[12px] font-mono leading-none shrink-0 ${className}`}>
        !
      </span>
    );
  }

  if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
    return <Code2 className={`w-3.5 h-3.5 text-[#e44d26] shrink-0 ${className}`} />;
  }

  if (
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.gif') ||
    lowerName.endsWith('.webp') ||
    lowerName.endsWith('.svg')
  ) {
    return <Image className={`w-3.5 h-3.5 text-[#cb89fc] shrink-0 ${className}`} />;
  }

  if (lowerName.endsWith('.md') || lowerName.endsWith('.mdx')) {
    return (
      <span className={`inline-flex items-center justify-center text-[#58a6ff] text-[10px] font-mono font-bold leading-none shrink-0 ${className}`}>
        M↓
      </span>
    );
  }

  if (lowerName.endsWith('.sql')) {
    return <Database className={`w-3.5 h-3.5 text-[#e3a808] shrink-0 ${className}`} />;
  }

  if (lowerName.endsWith('.sh') || lowerName.endsWith('.bash') || lowerName.endsWith('.zsh')) {
    return <Terminal className={`w-3.5 h-3.5 text-[#3fb950] shrink-0 ${className}`} />;
  }

  return <FileText className={`w-3.5 h-3.5 text-[#858585] shrink-0 ${className}`} />;
};

export default FileIcon;
