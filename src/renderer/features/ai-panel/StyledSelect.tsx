import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  ariaLabel?: string;
}

interface StyledSelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  buttonClassName?: string;
  optionClassName?: string;
  disabled?: boolean;
  searchable?: boolean;
  placement?: 'auto' | 'top' | 'bottom';
  align?: 'auto' | 'left' | 'right';
  ariaLabel?: string;
}

export const StyledSelect: React.FC<StyledSelectProps> = ({
  value,
  options,
  onChange,
  placeholder,
  className = '',
  buttonClassName = '',
  optionClassName = '',
  disabled = false,
  searchable = false,
  placement = 'auto',
  align = 'auto',
  ariaLabel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({ minWidth: 0 });
  const [listboxMaxHeight, setListboxMaxHeight] = useState<number>(288);
  const selectedOption = options.find((option) => option.value === value);
  const isDisabled = disabled || options.length === 0;
  const filteredOptions = searchable
    ? options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const close = () => {
    setIsOpen(false);
    setQuery('');
    setActiveIndex(0);
  };

  const open = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const shouldOpenTop =
        placement === 'top' || (placement !== 'bottom' && spaceBelow < 220 && spaceAbove > spaceBelow);

      const style: React.CSSProperties = {
        minWidth: rect.width,
      };

      if (shouldOpenTop) {
        style.bottom = Math.max(8, window.innerHeight - rect.top + 4);
        const maxAvailable = Math.max(100, rect.top - 16);
        setListboxMaxHeight(Math.min(288, maxAvailable - (searchable ? 48 : 0)));
      } else {
        style.top = Math.max(8, rect.bottom + 4);
        const maxAvailable = Math.max(100, spaceBelow - 16);
        setListboxMaxHeight(Math.min(288, maxAvailable - (searchable ? 48 : 0)));
      }

      const shouldAlignRight =
        align === 'right' || (align !== 'left' && rect.left + rect.width > window.innerWidth / 2 && window.innerWidth - rect.right >= 8);

      if (shouldAlignRight) {
        style.right = Math.max(8, window.innerWidth - rect.right);
      } else {
        style.left = Math.max(8, rect.left);
      }

      setMenuStyle(style);
    }
    setIsOpen(true);
  };

  const select = (option: SelectOption) => {
    onChange(option.value);
    close();
    buttonRef.current?.focus();
  };

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) {
        close();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (isOpen && searchable) {
      searchRef.current?.focus();
    }
  }, [isOpen, searchable]);

  useEffect(() => {
    if (!isOpen) return;
    const reposition = () => open();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={isDisabled}
        onClick={() => {
          if (isOpen) {
            close();
          } else {
            open();
          }
        }}
        onKeyDown={(event) => {
          if (isDisabled) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            open();
            setActiveIndex(event.key === 'ArrowDown' ? 0 : Math.max(options.length - 1, 0));
          }
          if (event.key === 'Escape') close();
        }}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-editor-border bg-editor-bg text-left text-editor-text outline-none transition-all-custom hover:border-editor-accent focus:border-editor-accent disabled:cursor-default disabled:opacity-50 ${buttonClassName}`}
      >
        <span className="truncate">{selectedOption?.label ?? placeholder}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-editor-textDark transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !isDisabled && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="fixed z-[100] flex flex-col w-max max-w-[calc(100vw-16px)] overflow-hidden rounded-lg border border-editor-border bg-editor-bg shadow-2xl"
        >
          {searchable && (
            <div className="shrink-0 border-b border-editor-border p-2">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    close();
                    buttonRef.current?.focus();
                    return;
                  }
                  if (filteredOptions.length === 0) return;
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setActiveIndex((index) => (index + 1) % filteredOptions.length);
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActiveIndex((index) => (index - 1 + filteredOptions.length) % filteredOptions.length);
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    select(filteredOptions[activeIndex]);
                  }
                }}
                aria-label={`Search ${ariaLabel ?? placeholder}`}
                className="w-full rounded border border-editor-border bg-editor-active px-2 py-1 text-xs text-editor-text outline-none focus:border-editor-accent"
              />
            </div>
          )}
          <div
            role="listbox"
            aria-label={ariaLabel ?? placeholder}
            className="overflow-y-auto"
            style={{ maxHeight: listboxMaxHeight }}
          >
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-editor-textDark">No results</div>
          ) : filteredOptions.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                aria-label={option.ariaLabel}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(option)}
                className={`block w-full truncate px-3 py-2 text-left text-xs transition-colors ${
                  isSelected || isActive
                    ? 'bg-editor-active text-editor-text'
                    : 'text-editor-text hover:bg-editor-hover'
                } ${optionClassName}`}
              >
                {option.label}
              </button>
            );
          })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default StyledSelect;
