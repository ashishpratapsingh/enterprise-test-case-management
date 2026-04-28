import { useCallback, useMemo, useState } from 'react';

/**
 * Field spec passed to ``useBulkEdit`` and ``BulkEditDialog``.
 *
 * Each field becomes a row in the dialog: a "Change <label>" checkbox
 * plus an input. The input is disabled until the checkbox is ticked.
 * When ``required`` is true, an empty value while ticked is treated
 * as a validation error. Set ``required: false`` for assignee-style
 * fields where empty means "unassign" (a legitimate choice).
 *
 * For dropdowns, ``options`` is a list of ``{ value, label }``. The
 * special empty string is reserved for the "(none)" / "Unassigned"
 * option — the apply handler can detect it and translate to a
 * clear/unassign API call.
 */
export interface BulkFieldSpec {
  key: string;
  label: string;
  /** Input type. ``select`` is far the most common in this app. */
  type: 'select' | 'text' | 'number';
  options?: { value: string; label: string }[];
  /** When true, an empty value while the field is ticked is invalid.
   *  Defaults to true. Assignee-like fields (where empty = clear) set
   *  this to false. */
  required?: boolean;
  /** Helper text shown below the input when no error is showing. */
  helperText?: string;
  /** Custom validation. Returns an error message, or undefined for
   *  valid. Layered on top of the empty-when-required check. */
  validate?: (value: string) => string | undefined;
  /** Optional ``aria-label`` for the input — useful so tests can
   *  locate it unambiguously when several fields share a label like
   *  "Status". */
  inputAriaLabel?: string;
}

export interface BulkFieldState {
  changed: boolean;
  value: string;
}

export interface UseBulkEditResult {
  /** Per-field state map. */
  state: Record<string, BulkFieldState>;
  /** Toggle the "Change <field>" checkbox. */
  setChanged: (key: string, changed: boolean) => void;
  /** Update the field's value. */
  setValue: (key: string, value: string) => void;
  /** Reset every field to ``{ changed: false, value: '' }``. */
  reset: () => void;

  /** Per-field validation errors. Only populated when the field is
   *  ticked AND the value is invalid. */
  errors: Record<string, string | undefined>;
  /** True when at least one checkbox is ticked. */
  anyFieldChanged: boolean;
  /** True when the form passes all the validation rules and at least
   *  one field is ticked. */
  isValid: boolean;

  /** Map of changed-field-key → value. The page's apply handler
   *  inspects this to decide which bulk endpoints to call. Empty
   *  strings are preserved (page can detect them as clear/unassign). */
  changedFields: Record<string, string>;
}

const _emptyState = (fields: BulkFieldSpec[]): Record<string, BulkFieldState> =>
  Object.fromEntries(fields.map((f) => [f.key, { changed: false, value: '' }]));

export function useBulkEdit(fields: BulkFieldSpec[]): UseBulkEditResult {
  // The initial state shape depends on the field list, but the spec
  // is stable across the dialog's lifetime. We freeze the keys at
  // hook-mount; passing a new spec array later won't shake the state
  // tree.
  const [state, setState] = useState<Record<string, BulkFieldState>>(() =>
    _emptyState(fields),
  );

  const setChanged = useCallback((key: string, changed: boolean) => {
    setState((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || { value: '' }), changed },
    }));
  }, []);

  const setValue = useCallback((key: string, value: string) => {
    setState((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || { changed: false }), value },
    }));
  }, []);

  // We intentionally don't depend on `fields` for `reset`. Field
  // specs are passed by reference from the page; rebuilding the
  // closure every render creates a new function and breaks downstream
  // memoisation. The closed-over `fields` is fine.
  const reset = useCallback(() => setState(_emptyState(fields)), []);

  const errors = useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const f of fields) {
      const fs = state[f.key];
      if (!fs?.changed) {
        out[f.key] = undefined;
        continue;
      }
      const isRequired = f.required !== false;
      if (isRequired && !fs.value) {
        out[f.key] = `Pick a ${f.label.replace(/^Change\s+/i, '').toLowerCase()} to apply`;
        continue;
      }
      out[f.key] = f.validate?.(fs.value);
    }
    return out;
  }, [state, fields]);

  const anyFieldChanged = useMemo(
    () => fields.some((f) => state[f.key]?.changed),
    [state, fields],
  );

  const isValid = useMemo(
    () => anyFieldChanged && Object.values(errors).every((e) => !e),
    [anyFieldChanged, errors],
  );

  const changedFields = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of fields) {
      const fs = state[f.key];
      if (fs?.changed) out[f.key] = fs.value;
    }
    return out;
  }, [state, fields]);

  return {
    state,
    setChanged,
    setValue,
    reset,
    errors,
    anyFieldChanged,
    isValid,
    changedFields,
  };
}

export default useBulkEdit;
