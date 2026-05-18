// Sistema de notificaciones tipo toast — módulo singleton
// Uso: import { toast } from '../lib/toast';  →  toast.success('Guardado')

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastEvent {
  id: string;
  type: ToastType;
  message: string;
}

type Listener = (t: ToastEvent) => void;
const listeners: Listener[] = [];

function emit(message: string, type: ToastType = 'info') {
  const event: ToastEvent = { id: `${Date.now()}-${Math.random()}`, type, message };
  listeners.forEach(l => l(event));
}

export function subscribe(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    const i = listeners.indexOf(listener);
    if (i > -1) listeners.splice(i, 1);
  };
}

export const toast = Object.assign(
  (message: string, type: ToastType = 'info') => emit(message, type),
  {
    success: (message: string) => emit(message, 'success'),
    error:   (message: string) => emit(message, 'error'),
    info:    (message: string) => emit(message, 'info'),
    warning: (message: string) => emit(message, 'warning'),
  }
);
