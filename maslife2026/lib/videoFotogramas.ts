// Fotogramas de un video local (<video> + <canvas>) para el análisis de marcha.
// En iOS un <video> fuera del documento a menudo nunca dispara `seeked` y el
// proceso quedaba colgado en "Procesando video…". Se inserta oculto en la
// página, con muted + playsInline, y cada espera tiene un tiempo máximo.
export async function extraerFotogramas(file: Blob, count = 4): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.preload = 'auto';
  video.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;';
  document.body.appendChild(video);
  const esperar = (evento: 'loadeddata' | 'seeked', ms: number) => new Promise<void>((ok, mal) => {
    const t = setTimeout(() => { limpiar(); mal(new Error('timeout')); }, ms);
    const alOk = () => { limpiar(); ok(); };
    const alError = () => { limpiar(); mal(new Error('error')); };
    const limpiar = () => { clearTimeout(t); video.removeEventListener(evento, alOk); video.removeEventListener('error', alError); };
    video.addEventListener(evento, alOk, { once: true });
    video.addEventListener('error', alError, { once: true });
  });
  try {
    const listo = esperar('loadeddata', 15000);
    video.src = url;
    video.load();
    await listo;
    const dur = video.duration;
    if (!dur || !isFinite(dur)) throw new Error('sin duracion');
    const scale = Math.min(1, 900 / (video.videoWidth || 900));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((video.videoWidth || 900) * scale);
    canvas.height = Math.round((video.videoHeight || 1200) * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('canvas');
    const frames: string[] = [];
    for (let n = 0; n < count; n++) {
      const t = dur * (0.1 + (0.8 * n) / Math.max(1, count - 1));
      const buscado = esperar('seeked', 5000);
      video.currentTime = Math.min(Math.max(0, t), Math.max(0, dur - 0.05));
      await buscado;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      // Fotograma negro = el navegador no decodificó el códec (típico HEVC).
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let suma = 0, muestras = 0;
      for (let k = 0; k < d.length; k += 4 * 997) { suma += d[k] + d[k + 1] + d[k + 2]; muestras++; }
      if (muestras && suma / (muestras * 3) < 4) throw new Error('negro');
      frames.push(canvas.toDataURL('image/jpeg', 0.82));
    }
    return frames;
  } finally {
    video.removeAttribute('src');
    try { video.load(); } catch { /* nada */ }
    video.remove();
    URL.revokeObjectURL(url);
  }
}
