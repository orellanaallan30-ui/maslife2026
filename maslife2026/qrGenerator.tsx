// ================================================================
// qrGenerator.ts — Generación de QR para documentos clínicos
// Librería: qrcode (npm install qrcode @types/qrcode)
// ================================================================

/**
 * Genera un QR como Data URL PNG usando la librería qrcode.
 * Fallback a URL de API pública si qrcode no está disponible.
 */
export async function generateQRDataURL(
  text: string,
  options: {
    size?: number;        // px del canvas (default 200)
    margin?: number;      // celdas de margen (default 2)
    darkColor?: string;   // hex (default #0f172a)
    lightColor?: string;  // hex (default #ffffff)
  } = {}
): Promise<string> {
  const { size = 200, margin = 2, darkColor = '#0f172a', lightColor = '#ffffff' } = options;

  try {
    // Importación dinámica — solo se carga cuando se necesita
    const QRCode = await import('qrcode');
    const dataUrl = await QRCode.default.toDataURL(text, {
      width: size,
      margin,
      color: { dark: darkColor, light: lightColor },
      errorCorrectionLevel: 'M',
    });
    return dataUrl;
  } catch (err) {
    console.warn('[QRGenerator] qrcode no disponible, usando fallback API:', err);
    // Fallback: API pública de QR (solo para desarrollo)
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&bgcolor=ffffff&color=0f172a&margin=10`;
  }
}

/**
 * Genera un QR como string SVG (sin dependencias de canvas).
 * Útil para renderizar inline en React.
 */
export async function generateQRSVG(text: string, size = 180): Promise<string> {
  try {
    const QRCode = await import('qrcode');
    const svg = await QRCode.default.toString(text, {
      type: 'svg',
      width: size,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
    return svg;
  } catch (err) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" fill="#f1f5f9"/>
      <text x="50%" y="50%" text-anchor="middle" dy=".35em" font-size="10" fill="#94a3b8">QR no disponible</text>
    </svg>`;
  }
}

/**
 * Construye la URL canónica de verificación para un código dado.
 * Compatible con HashRouter (/#/verify/CODE).
 */
export function buildVerificationURL(verificationCode: string): string {
  const origin = window.location.origin;
  const base = window.location.pathname.replace(/\/$/, '');
  return `${origin}${base}/#/verify/${verificationCode}`;
}

// ── React Hook ────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';

export function useQRCode(text: string | null, size = 160) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!text) { setQrDataUrl(null); return; }
    let cancelled = false;
    setLoading(true);
    generateQRDataURL(text, { size }).then(url => {
      if (!cancelled) { setQrDataUrl(url); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [text, size]);

  return { qrDataUrl, loading };
}

// ── React Component ───────────────────────────────────────────────────────────
import React from 'react';

interface QRCodeDisplayProps {
  verificationCode: string;
  label?: string;
  size?: number;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  verificationCode,
  label = 'Escanear para verificar autenticidad',
  size = 120,
}) => {
  const url = buildVerificationURL(verificationCode);
  const { qrDataUrl, loading } = useQRCode(url, size);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="rounded-xl overflow-hidden border-2 border-slate-200 bg-white p-2 shadow-sm"
        style={{ width: size + 16, height: size + 16 }}
      >
        {loading ? (
          <div className="flex items-center justify-center w-full h-full">
            <span className="material-icons-round text-slate-300 animate-spin text-2xl">sync</span>
          </div>
        ) : qrDataUrl ? (
          <img src={qrDataUrl} alt="QR de verificación" width={size} height={size} />
        ) : (
          <div className="flex items-center justify-center w-full h-full">
            <span className="material-icons-round text-slate-300 text-3xl">qr_code_2</span>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400 text-center max-w-[140px] leading-tight">{label}</p>
      <p className="font-mono text-xs font-black text-slate-500 tracking-widest">{verificationCode}</p>
    </div>
  );
};
