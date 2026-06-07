import { useEffect, useRef, useState } from 'react';
import { Check, Minus, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  /** Label shown when nothing is selected, e.g. "All Statuses". */
  allLabel: string;
  /** Singular noun for the count summary, e.g. "Status". */
  singular: string;
  /** Plural noun for the count summary, e.g. "Statuses". */
  plural: string;
  options: MultiSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  className?: string;
}

/**
 * Checkbox-style multi-select dropdown.
 *
 * - Empty selection = no filter / "all" (the button shows `allLabel`).
 * - The top "All" row selects every option; clicking it again when all are
 *   already selected clears the category back to the neutral/all state.
 * - The menu stays open while toggling, closes on outside click or Escape.
 */
export function MultiSelectDropdown({
  allLabel,
  singular,
  plural,
  options,
  selectedValues,
  onChange,
  className,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const allSelected = options.length > 0 && selectedValues.length === options.length;
  const someSelected = selectedValues.length > 0 && !allSelected;
  const isActive = selectedValues.length > 0;

  const summary =
    selectedValues.length === 0
      ? allLabel
      : `${selectedValues.length} ${selectedValues.length === 1 ? singular : plural}`;

  const toggleValue = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter(v => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const toggleAll = () => {
    if (allSelected) onChange([]); // back to neutral / no filter
    else onChange(options.map(o => o.value));
  };

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex items-center gap-1.5 text-xs border rounded px-2 py-1.5 bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400',
          isActive ? 'border-blue-400 text-blue-700 font-medium' : 'border-gray-300 text-gray-700 hover:bg-gray-50',
        )}
      >
        <span className="whitespace-nowrap">{summary}</span>
        <ChevronDown size={13} className="text-gray-400" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-1 z-50 min-w-[12rem] max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg py-1"
        >
          {/* "All" row */}
          <button
            type="button"
            onClick={toggleAll}
            className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
          >
            <span
              className={cn(
                'flex items-center justify-center w-4 h-4 rounded border shrink-0',
                allSelected
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : someSelected
                    ? 'bg-blue-100 border-blue-400 text-blue-600'
                    : 'border-gray-300',
              )}
            >
              {allSelected ? <Check size={11} /> : someSelected ? <Minus size={11} /> : null}
            </span>
            <span className="font-medium text-gray-700">{allLabel}</span>
          </button>

          <div className="my-1 border-t border-gray-100" />

          {options.map(opt => {
            const checked = selectedValues.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => toggleValue(opt.value)}
                className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
              >
                <span
                  className={cn(
                    'flex items-center justify-center w-4 h-4 rounded border shrink-0',
                    checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300',
                  )}
                >
                  {checked ? <Check size={11} /> : null}
                </span>
                <span className="text-gray-700">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
