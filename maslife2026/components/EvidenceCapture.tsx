import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { toast } from '../lib/toast';

// Captura de evidencia por ejercicio: el paciente graba un video corto (máx 10s,
// con auto-corte) o adjunta una foto/video. Se sube a un bucket privado; el
// profesional lo revisa y lo elimina. No bloquea el resto de la rutina.

const MAX_SECONDS = 10;

const genId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const extFromType = (type: string): string => {
  if (type.includes('mp4')) return 'mp4';
  if (type.includes('webm')) return 'webm';
  if (type.includes('quicktime')) return 'mov';
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  return 'jpg';
};

const videoDuration = (file: File): Promise<number> => new Promise(resolve => {
  const v = document.createElement('video');
  v.preload = 'metadata';
  v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(v.src); resolve(Number.isFinite(d) ? d : 0); };
  v.onerror = () => resolve(0);
  v.src = URL.createObjectURL(file);
});

const canRecord = () =>
  typeof MediaRecorder !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia;

const pickMime = (): string => {
  const opts = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  for (const m of opts) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* ignore */ } }
  return 'video/webm';
};

interface Props {
  routineId: string;
  itemId: string;
  count: number;
  onUploaded: () => void;
}

export const EvidenceCapture: React.FC<Props> = ({ routineId, itemId, count, onUploaded }) => {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(count);
  const fileRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);

  // Grabador
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [preview, setPreview] = useState<{ blob: Blob; type: string; url: string } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  const upload = async (blob: Blob, type: string) => {
    const isVideo = type.startsWith('video');
    const path = `${routineId}/${itemId}/${genId()}.${extFromType(type)}`;
    const { error } = await supabase.storage.from('routine-evidence')
      .upload(path, blob, { contentType: type || 'application/octet-stream', upsert: false });
    if (error) throw error;
    const { data: res, error: rerr } = await supabase.rpc('add_routine_evidence', {
      p_routine_id: routineId, p_item_id: itemId, p_path: path, p_type: isVideo ? 'video' : 'image',
    });
    if (rerr || (res as { error?: string })?.error) throw new Error((res as { error?: string })?.error || rerr?.message);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    try {
      if (file.type.startsWith('video')) {
        const dur = await videoDuration(file);
        if (dur > MAX_SECONDS + 0.6) {
          toast.error('El video debe durar máximo 10 segundos. Graba uno más corto.');
          return;
        }
      }
      await upload(file, file.type || 'application/octet-stream');
      setSent(s => s + 1);
      onUploaded();
      toast.success('Evidencia enviada a tu profesional');
    } catch (e) {
      console.error('[evidence] adjuntar', e);
      toast.error('No se pudo enviar la evidencia. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  // ── Grabador de cámara con auto-corte a los 10s ──
  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };
  const closeRecorder = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recRef.current && recRef.current.state !== 'inactive') { try { recRef.current.stop(); } catch { /* */ } }
    stopStream();
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null); setRecording(false); setSecs(0); setRecorderOpen(false);
  };

  const openRecorder = async () => {
    if (!canRecord()) { captureRef.current?.click(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      setPreview(null);
      setRecorderOpen(true);
    } catch (e) {
      console.error('[evidence] cámara', e);
      toast.error('No se pudo abrir la cámara. Puedes adjuntar un archivo en su lugar.');
    }
  };

  // Conectar el stream al <video> cuando se abre el modal.
  useEffect(() => {
    if (recorderOpen && !preview && videoElRef.current && streamRef.current) {
      videoElRef.current.srcObject = streamRef.current;
      videoElRef.current.play().catch(() => { /* autoplay bloqueado, no crítico */ });
    }
  }, [recorderOpen, preview]);

  const startRec = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const mime = pickMime();
    chunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: mime });
    recRef.current = mr;
    mr.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      stopStream();
      setPreview({ blob, type: mime, url: URL.createObjectURL(blob) });
    };
    mr.start();
    setRecording(true); setSecs(0);
    timerRef.current = setInterval(() => {
      setSecs(s => {
        if (s + 1 >= MAX_SECONDS) { stopRec(); return MAX_SECONDS; }
        return s + 1;
      });
    }, 1000);
  };

  const stopRec = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recRef.current && recRef.current.state !== 'inactive') { try { recRef.current.stop(); } catch { /* */ } }
    setRecording(false);
  };

  const sendRecorded = async () => {
    if (!preview || busy) return;
    setBusy(true);
    try {
      await upload(preview.blob, preview.type);
      setSent(s => s + 1);
      onUploaded();
      toast.success('Video enviado a tu profesional');
      closeRecorder();
    } catch (e) {
      console.error('[evidence] grabar', e);
      toast.error('No se pudo enviar el video. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => () => { closeRecorder(); }, []); // limpieza al desmontar
  // eslint-disable-next-line react-hooks/exhaustive-deps

  return (
    <div className="pt-1">
      <div className="flex gap-2 flex-wrap">
        <button onClick={openRecorder} disabled={busy}
          className="flex-1 min-w-[130px] min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 transition disabled:opacity-60">
          <span className="material-icons-round text-base">videocam</span> Grabar video
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          className="flex-1 min-w-[130px] min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 transition disabled:opacity-60">
          <span className="material-icons-round text-base">attach_file</span> Adjuntar archivo
        </button>
      </div>
      {sent > 0 && (
        <p className="text-[11px] text-teal-600 font-bold mt-1.5 flex items-center gap-1">
          <span className="material-icons-round text-sm">check_circle</span>
          {sent} {sent === 1 ? 'evidencia enviada' : 'evidencias enviadas'} a tu profesional
        </p>
      )}
      <p className="text-[10px] text-slate-400 mt-1">Video de máximo 10 segundos. Solo lo ve tu profesional.</p>

      {/* inputs ocultos */}
      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.currentTarget.value = ''; void handleFile(f); }} />
      <input ref={captureRef} type="file" accept="video/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.currentTarget.value = ''; void handleFile(f); }} />

      {/* Modal grabador */}
      {recorderOpen && (
        <div className="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center p-4" onClick={closeRecorder}>
          <div className="bg-black rounded-3xl overflow-hidden max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="relative bg-black">
              {!preview ? (
                <video ref={videoElRef} muted playsInline className="w-full h-72 object-cover bg-black" />
              ) : (
                <video src={preview.url} controls playsInline className="w-full h-72 object-contain bg-black" />
              )}
              {recording && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-rose-500 text-white text-xs font-black px-3 py-1 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> {MAX_SECONDS - secs}s
                </div>
              )}
            </div>
            <div className="p-4 flex items-center justify-center gap-3 bg-slate-900">
              {!preview ? (
                <>
                  <button onClick={closeRecorder} className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-300 bg-slate-800">Cancelar</button>
                  {!recording ? (
                    <button onClick={startRec} className="flex-1 min-h-[44px] rounded-xl bg-rose-500 text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-rose-600 transition">
                      <span className="material-icons-round text-lg">fiber_manual_record</span> Grabar (máx 10s)
                    </button>
                  ) : (
                    <button onClick={stopRec} className="flex-1 min-h-[44px] rounded-xl bg-white text-slate-900 text-sm font-bold flex items-center justify-center gap-2">
                      <span className="material-icons-round text-lg">stop</span> Detener
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); void openRecorder(); }}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-300 bg-slate-800">Repetir</button>
                  <button onClick={sendRecorded} disabled={busy}
                    className="flex-1 min-h-[44px] rounded-xl bg-teal-500 text-white text-sm font-bold hover:bg-teal-600 transition disabled:opacity-60">
                    {busy ? 'Enviando...' : 'Enviar a mi profesional'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
