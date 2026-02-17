import { useEffect, useMemo, useRef, useState } from "react";

export type UiSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type UiSelectProps = {
  value: string;
  options: UiSelectOption[];
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
};

export function UiSelect({ value, options, onChange, placeholder = "選択してください", disabled, required }: UiSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  useEffect(() => {
    setOpen(false);
  }, [value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className={`ui-select ${disabled ? "is-disabled" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`ui-select-trigger ${open ? "is-open" : ""}`}
        onClick={() => !disabled && setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className={`ui-select-label ${selected ? "" : "is-placeholder"}`}>{selected?.label ?? placeholder}</span>
      </button>

      <input className="ui-select-proxy" value={value} readOnly required={required} tabIndex={-1} aria-hidden />

      {open && (
        <div className="ui-select-menu" role="listbox">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`ui-select-option ${o.value === value ? "is-selected" : ""}`}
              onClick={() => {
                if (o.disabled) return;
                onChange(o.value);
                setOpen(false);
              }}
              disabled={o.disabled}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
