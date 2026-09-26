import { useCallback, useEffect, useRef, useState } from 'react';

// Voz para el Asistente MasLife: dictado con la Web Speech API del navegador
// (Chrome/Edge/Android y Safari iOS 14.5+) y lectura de respuestas con
// speechSynthesis. No sube audio a ningún servidor propio. Donde no existe
// (Firefox), `soportado` es false y el botón no se muestra.

type SR = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

const obtenerSR = (): (new () => SR) | null => {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

/** Mensaje claro para cada error del reconocimiento; null = no avisar (silencio, cancelado). */
export function mensajeErrorVoz(codigo: string): string | null {
  switch (codigo) {
    case 'no-speech':
    case 'aborted':
      return null;
    case 'not-allowed':
    case 'service-not-allowed':
      return 'No tengo permiso para usar el micrófono. Actívalo en los ajustes del navegador (ícono del candado junto a la dirección) e intenta de nuevo.';
    case 'audio-capture':
      return 'No se detectó un micrófono. Revisa que esté conectado y no lo esté usando otra aplicación.';
    case 'network':
      return 'El dictado necesita internet y la conexión falló. Intenta de nuevo o escribe tu mensaje.';
    case 'language-not-supported':
      return 'Tu navegador no admite dictado en español. Escribe tu mensaje, por favor.';
    default:
      return 'No pude escucharte bien. Intenta de nuevo o escribe tu mensaje.';
  }
}

/** Limpia el texto para leerlo en voz alta: sin emojis, viñetas ni markdown. */
export function textoParaVoz(texto: string): string {
  return texto
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')           // [texto](url) → texto
    .replace(/https?:\/\/\S+/g, '')                     // URLs sueltas
    .replace(/[*_#`>~]/g, '')                           // markdown
    .replace(/^\s*[•\-–]\s*/gm, '')                     // viñetas
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '') // emojis (✅, ⚠️…)
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function useDictado(opciones: {
  /** Texto parcial mientras habla (para mostrarlo en el campo). */
  onParcial: (texto: string) => void;
  /** Texto final al terminar de hablar. */
  onFinal: (texto: string) => void;
  onError: (mensaje: string) => void;
}) {
  const [escuchando, setEscuchando] = useState(false);
  const soportado = obtenerSR() !== null;
  const recRef = useRef<SR | null>(null);
  const cbRef = useRef(opciones);
  cbRef.current = opciones;

  const detener = useCallback(() => { recRef.current?.stop(); }, []);

  const cancelar = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    rec.onresult = null; rec.onerror = null; rec.onend = null;
    try { rec.abort(); } catch { /* ya detenido */ }
    recRef.current = null;
    setEscuchando(false);
  }, []);

  const iniciar = useCallback(() => {
    const Ctor = obtenerSR();
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.lang = 'es-CL';
    rec.interimResults = true;
    rec.continuous = false; // se detiene solo al hacer una pausa
    rec.maxAlternatives = 1;

    let final = '';
    rec.onresult = (e: any) => {
      let parcial = '';
      final = '';
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0]?.transcript || '';
        if (e.results[i].isFinal) final += t; else parcial += t;
      }
      cbRef.current.onParcial((final + parcial).trim());
    };
    rec.onerror = (e: any) => {
      const msg = mensajeErrorVoz(e?.error || '');
      if (msg) cbRef.current.onError(msg);
    };
    rec.onend = () => {
      recRef.current = null;
      setEscuchando(false);
      const texto = final.trim();
      if (texto) cbRef.current.onFinal(texto);
    };

    try {
      rec.start();
      recRef.current = rec;
      setEscuchando(true);
    } catch {
      cbRef.current.onError(mensajeErrorVoz('')!);
    }
  }, []);

  useEffect(() => cancelar, [cancelar]);

  return { soportado, escuchando, iniciar, detener, cancelar };
}

// ── Lectura en voz alta ──────────────────────────────────────

const sintesis = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

const vozEspanol = (): SpeechSynthesisVoice | undefined => {
  const voces = sintesis()?.getVoices() || [];
  return voces.find(v => v.lang === 'es-CL')
    || voces.find(v => v.lang.startsWith('es-4') || v.lang === 'es-MX' || v.lang === 'es-US')
    || voces.find(v => v.lang.startsWith('es'));
};

export const vozDisponible = () => sintesis() !== null;

/** iOS solo permite hablar si antes hubo un gesto del usuario: llamar dentro de un click. */
export function desbloquearVoz() {
  const s = sintesis();
  if (!s) return;
  try { const u = new SpeechSynthesisUtterance(''); u.volume = 0; s.speak(u); } catch { /* sin voz */ }
}

export function hablar(texto: string) {
  const s = sintesis();
  const limpio = textoParaVoz(texto);
  if (!s || !limpio) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(limpio);
  u.lang = 'es-CL';
  const v = vozEspanol();
  if (v) u.voice = v;
  u.rate = 1.05;
  s.speak(u);
}

export function callar() {
  try { sintesis()?.cancel(); } catch { /* sin voz */ }
}
