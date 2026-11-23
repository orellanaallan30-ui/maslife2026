import React from 'react';
import { AbsoluteFill, Audio, Freeze, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Sequence, delayRender, continueRender } from 'remotion';

// Colores de marca (tienda / Mas Life)
const PETROLEO = '#0B4F5C';
const NARANJA = '#E8731C';
// Fuente local (el navegador de render no sale a internet).
const fuente = new FontFace('Manrope', `url(${staticFile('manrope-800.woff2')})`, { weight: '800' });
const espera = delayRender('Cargando Manrope');
fuente.load().then(f => { document.fonts.add(f); continueRender(espera); }).catch(() => continueRender(espera));
const FUENTE = "'Manrope', system-ui, sans-serif";

// Frases de la voz con sus tiempos (segundos, medidos con silencedetect sobre voz.mp3).
const FRASES: Array<{ ini: number; fin: number; texto: string; resalta: string[] }> = [
  { ini: 0.05, fin: 2.86, texto: 'El dolor crónico no tiene por qué ser para siempre.', resalta: ['dolor', 'crónico', 'siempre.'] },
  { ini: 3.21, fin: 7.34, texto: 'Kinesiología a domicilio en Ovalle, Sotaquí, Punitaqui y Monte Patria.', resalta: ['domicilio', 'Ovalle,', 'Sotaquí,', 'Punitaqui', 'Monte', 'Patria.'] },
  { ini: 7.64, fin: 9.12, texto: 'Escríbenos hoy por WhatsApp.', resalta: ['WhatsApp.'] },
];

/** Reparte el tiempo de la frase entre sus palabras según su largo (aprox. de habla). */
function palabrasConTiempo(f: typeof FRASES[number]) {
  const ps = f.texto.split(' ');
  const total = ps.reduce((a, p) => a + p.length + 1, 0);
  let t = f.ini;
  return ps.map(p => {
    const d = ((p.length + 1) / total) * (f.fin - f.ini);
    const r = { p, ini: t, fin: t + d };
    t += d;
    return r;
  });
}

type Frase = typeof FRASES[number];
const Subtitulo: React.FC<{ frases?: Frase[] }> = ({ frases = FRASES }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const frase = frases.find(f => t >= f.ini - 0.05 && t <= f.fin + 0.25);
  if (!frase) return null;
  const palabras = palabrasConTiempo(frase);
  return (
    <div style={{ position: 'absolute', left: 70, right: 70, top: 1565, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 18px' }}>
      {palabras.map(({ p, ini }, i) => {
        const visible = t >= ini - 0.02;
        const s = spring({ frame: frame - Math.round(ini * fps), fps, config: { damping: 14, stiffness: 180 } });
        const destacado = frase.resalta.includes(p);
        return (
          <span key={i} style={{
            fontFamily: FUENTE, fontWeight: 800, fontSize: 62, lineHeight: 1.1, letterSpacing: -1,
            color: destacado ? '#FFD08A' : 'white',
            opacity: visible ? 1 : 0.0,
            transform: `translateY(${visible ? (1 - s) * 24 : 24}px) scale(${visible ? 0.9 + s * 0.1 : 0.9})`,
            textShadow: '0 4px 18px rgba(0,0,0,.65), 0 2px 4px rgba(0,0,0,.8)',
          }}>{p}</span>
        );
      })}
    </div>
  );
};

const Marca: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', top: 70, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: o }}>
      <div style={{ background: 'rgba(255,255,255,.94)', borderRadius: 999, padding: '14px 30px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 10px 30px rgba(0,0,0,.25)' }}>
        <div style={{ width: 22, height: 22, borderRadius: 99, background: NARANJA }} />
        <span style={{ fontFamily: FUENTE, fontWeight: 800, fontSize: 38, color: PETROLEO }}>Clínica Mas Life</span>
        <span style={{ fontFamily: FUENTE, fontWeight: 800, fontSize: 26, color: '#64748b' }}>· Kinesiología</span>
      </div>
    </div>
  );
};

const Comunas: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nombres = ['Ovalle', 'Sotaquí', 'Punitaqui', 'Monte Patria'];
  return (
    <div style={{ position: 'absolute', top: 190, left: 60, right: 60, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 14 }}>
      {nombres.map((n, i) => {
        const s = spring({ frame: frame - i * 6, fps, config: { damping: 15 } });
        return (
          <span key={n} style={{ fontFamily: FUENTE, fontWeight: 800, fontSize: 32, color: 'white', background: 'rgba(11,79,92,.92)', border: '2px solid rgba(255,255,255,.35)', borderRadius: 999, padding: '10px 24px', transform: `scale(${s})`, boxShadow: '0 8px 20px rgba(0,0,0,.25)' }}>
            📍 {n}
          </span>
        );
      })}
    </div>
  );
};

const Cierre: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 12 } });
  const pulso = 1 + Math.sin(frame / 4) * 0.03;
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingTop: 40, background: `rgba(0,0,0,${interpolate(frame, [0, 10], [0, 0.35], { extrapolateRight: 'clamp' })})` }}>
      <div style={{ transform: `scale(${s * pulso})`, background: '#25D366', borderRadius: 999, padding: '30px 58px', display: 'flex', alignItems: 'center', gap: 20, boxShadow: '0 18px 40px rgba(0,0,0,.35)' }}>
        <svg width="62" height="62" viewBox="0 0 24 24" fill="white" aria-hidden><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2Zm5.8 14.04c-.25.69-1.44 1.32-1.98 1.4-.51.08-1.15.11-1.86-.12-.43-.14-.98-.32-1.68-.62-2.96-1.28-4.9-4.27-5.04-4.47-.15-.2-1.2-1.6-1.2-3.05 0-1.45.76-2.16 1.03-2.46.27-.3.59-.37.79-.37h.57c.18 0 .43-.07.67.51.25.59.84 2.04.91 2.19.07.15.12.32.02.52-.1.2-.15.32-.3.49-.15.17-.31.39-.44.52-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.06 1.13 1.01 2.09 1.32 2.38 1.47.3.15.47.12.64-.07.17-.2.74-.86.94-1.16.2-.3.39-.25.66-.15.27.1 1.72.81 2.01.96.3.15.49.22.57.34.07.12.07.71-.18 1.4Z"/></svg>
        <span style={{ fontFamily: FUENTE, fontWeight: 800, fontSize: 52, color: 'white' }}>Escríbenos por WhatsApp</span>
      </div>
    </AbsoluteFill>
  );
};

// El clip de Kling salió en 16:9 y 5 s: se reproduce a 0,72x (≈7 s) y se recorta en vertical
// siguiendo a las personas (plano 1: el hombre; plano 2: kinesióloga + paciente).
const VEL = 0.72;
const FIN_CLIP = Math.floor((5.0 / VEL) * 30); // ≈ 208 frames
const ALTO = 1150; const ANCHO = Math.round(1920 * (ALTO / 1080)); // 2044
const Escena: React.FC<{ fondo?: boolean }> = ({ fondo }) => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [84, 92], [184, 376], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (fondo) {
    return <OffthreadVideo src={staticFile('escena.mp4')} muted playbackRate={VEL} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(36px) brightness(.55)', transform: 'scale(1.2)' }} />;
  }
  return (
    <div style={{ position: 'absolute', top: 385, left: 0, width: 1080, height: ALTO, overflow: 'hidden', borderRadius: 36, boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
      <OffthreadVideo src={staticFile('escena.mp4')} muted playbackRate={VEL} style={{ position: 'absolute', top: 0, left: -x, width: ANCHO, height: ALTO }} />
    </div>
  );
};

export const Anuncio: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: PETROLEO }}>
      <Sequence durationInFrames={FIN_CLIP}><AbsoluteFill><Escena fondo /></AbsoluteFill><Escena /></Sequence>
      <Sequence from={FIN_CLIP}>
        <Freeze frame={FIN_CLIP - 3}><AbsoluteFill><Escena fondo /></AbsoluteFill><Escena /></Freeze>
      </Sequence>
      <Audio src={staticFile('voz.mp3')} />
      <Sequence from={FIN_CLIP}><Cierre /></Sequence>
      <Marca />
      <Sequence from={96}><Comunas /></Sequence>
      <Subtitulo />
    </AbsoluteFill>
  );
};

// v2: clip vertical 9:16 de 10 s nativo (más luminoso). Pantalla completa, sin recorte ni cámara lenta.
/** Tiempos (s) de inicio/fin de cada frase, medidos con silencedetect sobre el audio elegido. */
export type PropsV2 = { voz: string; tiempos: Array<[number, number]> };
export const AnuncioV2: React.FC<PropsV2> = ({ voz, tiempos }) => {
  const frases = FRASES.map((f, i) => ({ ...f, ini: tiempos[i]?.[0] ?? f.ini, fin: tiempos[i]?.[1] ?? f.fin }));
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, 300], [1, 1.06]);
  return (
    <AbsoluteFill style={{ background: 'black' }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <OffthreadVideo src={staticFile('escena2.mp4')} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.40) 0%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 62%, rgba(0,0,0,.55) 82%, rgba(0,0,0,.7) 100%)' }} />
      <Audio src={staticFile(voz)} />
      <Sequence from={228}><Cierre /></Sequence>
      <Marca />
      <Sequence from={96}><Comunas /></Sequence>
      <Subtitulo frases={frases} />
    </AbsoluteFill>
  );
};
