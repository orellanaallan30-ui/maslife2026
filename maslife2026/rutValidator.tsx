// ================================================================
// rutValidator.ts — Validación de RUT Chileno
// Algoritmo: Módulo 11 (estándar SII Chile)
// ================================================================

/**
 * Normaliza un RUT a formato sin puntos y con guión.
 * Ej: "12.345.678-9" → "12345678-9"
 *     "123456789"    → "12345678-9"
 */
export function normalizeRUT(rut: string): string {
  // Eliminar todo excepto dígitos y K
  const clean = rut.replace(/[^0-9kK]/gi, '').toUpperCase();
  if (clean.length < 2) return rut;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return `${body}-${dv}`;
}

/**
 * Formatea RUT con puntos y guión.
 * Ej: "12345678-9" → "12.345.678-9"
 */
export function formatRUT(rut: string): string {
  const normalized = normalizeRUT(rut);
  const [body, dv] = normalized.split('-');
  if (!body || !dv) return rut;
  // Insertar puntos cada 3 dígitos desde la derecha
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots}-${dv}`;
}

/**
 * Calcula el dígito verificador de un RUT.
 * @param bodyStr Cuerpo numérico sin DV (ej: "12345678")
 * @returns Dígito verificador como string ("0"-"9" o "K")
 */
export function calculateDV(bodyStr: string): string {
  const digits = bodyStr.replace(/[^0-9]/g, '');
  if (!digits) return '';
  
  let sum = 0;
  let factor = 2;
  
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += parseInt(digits[i], 10) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  
  const remainder = sum % 11;
  const dv = 11 - remainder;
  
  if (dv === 11) return '0';
  if (dv === 10) return 'K';
  return String(dv);
}

/**
 * Valida si un RUT chileno es válido.
 * Acepta formatos: "12.345.678-9", "12345678-9", "123456789"
 * @returns { valid: boolean, formatted: string, error?: string }
 */
export function validateRUT(rut: string): { valid: boolean; formatted: string; error?: string } {
  if (!rut || rut.trim() === '') {
    return { valid: false, formatted: '', error: 'El RUT es obligatorio' };
  }

  const clean = rut.replace(/[^0-9kK]/gi, '').toUpperCase();

  if (clean.length < 7 || clean.length > 9) {
    return { valid: false, formatted: rut, error: 'Largo de RUT inválido' };
  }

  const body = clean.slice(0, -1);
  const inputDV = clean.slice(-1);
  const expectedDV = calculateDV(body);

  if (inputDV !== expectedDV) {
    return {
      valid: false,
      formatted: formatRUT(clean),
      error: `Dígito verificador incorrecto (esperado: ${expectedDV})`,
    };
  }

  // Rangos válidos (personas naturales y jurídicas en Chile)
  const numeric = parseInt(body, 10);
  if (numeric < 1_000_000 || numeric > 99_999_999) {
    return { valid: false, formatted: formatRUT(clean), error: 'RUT fuera de rango válido' };
  }

  return { valid: true, formatted: formatRUT(clean) };
}

// ── Hook React ────────────────────────────────────────────────────────────────
import { useState, useCallback } from 'react';

export interface RUTFieldState {
  value: string;          // Valor formateado para mostrar
  raw: string;            // Valor limpio para guardar
  valid: boolean | null;  // null = sin validar aún
  error: string;
  touched: boolean;
}

export function useRUTField(initial = '') {
  const [state, setState] = useState<RUTFieldState>({
    value: initial ? formatRUT(initial) : '',
    raw: initial,
    valid: initial ? validateRUT(initial).valid : null,
    error: '',
    touched: false,
  });

  const onChange = useCallback((input: string) => {
    // Permitir escritura libre hasta que haya suficiente longitud
    const clean = input.replace(/[^0-9kK]/gi, '').toUpperCase();
    const display = clean.length > 1 ? formatRUT(clean) : input;
    setState(s => ({ ...s, value: display, raw: clean, touched: true, valid: null, error: '' }));
  }, []);

  const onBlur = useCallback(() => {
    setState(s => {
      if (!s.raw) return { ...s, valid: null, error: '', touched: true };
      const result = validateRUT(s.raw);
      return {
        ...s,
        value: result.formatted,
        raw: s.raw,
        valid: result.valid,
        error: result.error || '',
        touched: true,
      };
    });
  }, []);

  const reset = useCallback(() => {
    setState({ value: '', raw: '', valid: null, error: '', touched: false });
  }, []);

  return { ...state, onChange, onBlur, reset };
}

// ── Componente de campo RUT ────────────────────────────────────────────────────
import React from 'react';

interface RUTInputProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  valid: boolean | null;
  error: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export const RUTInput: React.FC<RUTInputProps> = ({
  label = 'RUT',
  value,
  onChange,
  onBlur,
  valid,
  error,
  disabled = false,
  required = false,
  className = '',
}) => {
  const borderColor =
    valid === null ? 'border-slate-200' :
    valid ? 'border-emerald-400' :
    'border-rose-400';

  const icon =
    valid === null ? null :
    valid ? 'check_circle' :
    'cancel';

  const iconColor = valid ? 'text-emerald-500' : 'text-rose-500';

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-xs font-black text-slate-500 uppercase tracking-wider">
          {label}{required && <span className="text-rose-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder="12.345.678-9"
          maxLength={12}
          className={`w-full border-2 ${borderColor} rounded-xl px-3 py-2.5 text-sm font-bold
            text-slate-800 outline-none focus:border-teal-400 transition-colors
            disabled:bg-slate-50 disabled:cursor-not-allowed pr-9`}
        />
        {icon && (
          <span className={`material-icons-round absolute right-2.5 top-1/2 -translate-y-1/2 text-lg ${iconColor}`}>
            {icon}
          </span>
        )}
      </div>
      {error && (
        <p className="text-xs text-rose-500 font-bold flex items-center gap-1">
          <span className="material-icons-round text-xs">error</span>
          {error}
        </p>
      )}
    </div>
  );
};
