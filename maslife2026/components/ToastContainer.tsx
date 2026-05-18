import React, { useEffect, useState } from 'react';
import { subscribe, type ToastEvent } from '../lib/toast';

const STYLES: Record<string, { bg: string; icon: string }> = {
  success: { bg: 'bg-emerald-500', icon: 'check_circle'  },
  error:   { bg: 'bg-rose-500',    icon: 'error'          },
  warning: { bg: 'bg-amber-500',   icon: 'warning'        },
  info:    { bg: 'bg-primary',     icon: 'info'           },
};

const DURATION_MS = 4000;

const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastEvent[]>([]);

  useEffect(() => {
    return subscribe(t => {
      setToasts(prev => [...prev, t]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), DURATION_MS);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-8 right-8 z-[99999] flex flex-col gap-3 pointer-events-none no-print">
      {toasts.map(t => {
        const s = STYLES[t.type] || STYLES.info;
        return (
          <div
            key={t.id}
            className={`${s.bg} text-white pl-4 pr-6 py-3.5 rounded-2xl shadow-2xl font-bold text-sm
              flex items-center gap-3 animate-in slide-in-from-right-5 duration-300
              border-b-4 border-black/20`}
          >
            <span className="material-icons-round text-xl shrink-0">{s.icon}</span>
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
};

export default ToastContainer;
