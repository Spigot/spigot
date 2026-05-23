import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
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
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value);
  const isDisabled = disabled || options.length === 0;

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => setIsOpen((current) => !current)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-editor-border bg-editor-hover/60 text-left text-white outline-none transition-all-custom hover:border-zinc-600 focus:border-editor-accent disabled:cursor-default disabled:opacity-50 ${buttonClassName}`}
      >
        <span className="truncate">{selectedOption?.label ?? placeholder}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-editor-textDark transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !isDisabled && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-[70] max-h-72 min-w-full w-max max-w-[250px] overflow-y-auto rounded-lg border border-editor-border bg-editor-bg shadow-2xl">
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`block w-full truncate px-3 py-2 text-left text-xs transition-colors ${
                  isSelected
                    ? 'bg-zinc-800 text-white'
                    : 'text-editor-text hover:bg-editor-hover hover:text-white'
                } ${optionClassName}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StyledSelect;
