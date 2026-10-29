#!/usr/bin/env python3
"""Locución con voz clonada (Chatterbox Multilingual, licencia MIT) sincronizada con un video.

Uso:
  python clonar_voz.py --ref muestra.m4a --guion guion.json --out salida/ [--video video.mp4]
                       [--exag 0.5] [--cfg 0.5] [--fondo-db -18] [--idioma es]

guion.json: lista de frases con su tramo del video, en segundos:
  [{"inicio": 0.3, "fin": 5.0, "texto": "Llegó con dolor en las piernas..."}, ...]

Salidas en --out: frase_XX.wav (cada frase), voz.wav (pista completa) y, si se pasa --video,
video_con_voz.mp4 (la voz al frente y el audio original del video de fondo).
Solo clonar la propia voz o la de alguien que lo autorice por escrito.
"""
import argparse, json, os, subprocess, sys, tempfile

def sh(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

def dur(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                         check=True, capture_output=True, text=True).stdout.strip()
    return float(out)

def limpiar_muestra(src, dst):
    # mono 24 kHz, sin silencios largos al inicio/fin, volumen normalizado; máximo 30 s (Chatterbox usa ~10 s)
    sh('ffmpeg', '-y', '-i', src, '-ac', '1', '-ar', '24000',
       '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=1:stop_threshold=-45dB,'
              'highpass=f=70,loudnorm=I=-18:TP=-2', '-t', '30', dst)

def ajustar(src, dst, objetivo, max_cambio=0.15):
    """Acelera o frena la frase para que entre en su tramo (máx. ±15 %). Devuelve (duración, aviso)."""
    d = dur(src)
    aviso, factor = None, 1.0
    if objetivo > 0 and d > objetivo * 1.02:      # si sobra tiempo no se estira: queda silencio natural
        factor = d / objetivo
        if factor > 1 + max_cambio:
            aviso = f'la frase dura {d:.1f}s y el tramo {objetivo:.1f}s: conviene acortar el texto'
            factor = 1 + max_cambio
    sh('ffmpeg', '-y', '-i', src, '-af', f'atempo={factor:.4f}', dst)
    return dur(dst), aviso

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ref', required=True, help='grabación de la voz a clonar (10-60 s, sin música)')
    ap.add_argument('--guion', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--video')
    ap.add_argument('--idioma', default='es')
    ap.add_argument('--exag', type=float, default=0.5, help='expresividad 0.25-1.0 (más alto = más enfático)')
    ap.add_argument('--cfg', type=float, default=0.5, help='apego al ritmo de la muestra 0.2-0.8 (más bajo = más pausado)')
    ap.add_argument('--fondo-db', type=float, default=-18, help='volumen del audio original del video bajo la voz')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    guion = json.load(open(a.guion, encoding='utf-8'))

    import torch, torchaudio
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    torch.set_num_threads(max(1, os.cpu_count() or 1))
    model = ChatterboxMultilingualTTS.from_pretrained(device='cuda' if torch.cuda.is_available() else 'cpu')

    tmp = tempfile.mkdtemp()
    ref = os.path.join(tmp, 'ref.wav'); limpiar_muestra(a.ref, ref)
    partes, avisos = [], []
    for i, fr in enumerate(guion):
        crudo = os.path.join(tmp, f'crudo_{i:02d}.wav')
        wav = model.generate(fr['texto'], language_id=a.idioma, audio_prompt_path=ref,
                             exaggeration=a.exag, cfg_weight=a.cfg)
        torchaudio.save(crudo, wav, model.sr)
        final = os.path.join(a.out, f'frase_{i:02d}.wav')
        d, aviso = ajustar(crudo, final, fr['fin'] - fr['inicio'])
        if aviso:
            avisos.append(f'frase {i + 1}: {aviso}')
        partes.append((fr['inicio'], final))
        print(f'frase {i + 1}/{len(guion)} lista ({d:.1f}s)', flush=True)

    # pista completa: cada frase en su tiempo de inicio
    total = max(fr['fin'] for fr in guion) + 1.0
    if a.video:
        total = max(total, dur(a.video))
    inputs, filtros = [], []
    for k, (ini, path) in enumerate(partes):
        inputs += ['-i', path]
        filtros.append(f'[{k}:a]adelay={int(ini * 1000)}:all=1[v{k}]')
    mezcla = ''.join(f'[v{k}]' for k in range(len(partes)))
    voz = os.path.join(a.out, 'voz.wav')
    sh('ffmpeg', '-y', *inputs, '-filter_complex',
       ';'.join(filtros) + f';{mezcla}amix=inputs={len(partes)}:normalize=0,apad=whole_dur={total},loudnorm=I=-16:TP=-1.5[a]',
       '-map', '[a]', '-ar', '44100', voz)

    if a.video:
        out = os.path.join(a.out, 'video_con_voz.mp4')
        tiene_audio = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index',
                                      '-of', 'csv=p=0', a.video], capture_output=True, text=True).stdout.strip() != ''
        if tiene_audio:
            # la voz al frente; el audio original baja cuando hay voz (sidechain) y queda a fondo-db
            fc = (f'[0:a]volume={a.fondo_db}dB[bg];[1:a]asplit=2[v][sc];[bg][sc]sidechaincompress=threshold=0.03:ratio=6:release=400[duck];'
                  f'[duck][v]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[m]')
            sh('ffmpeg', '-y', '-i', a.video, '-i', voz, '-filter_complex', fc,
               '-map', '0:v', '-map', '[m]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', out)
        else:
            sh('ffmpeg', '-y', '-i', a.video, '-i', voz, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
               '-c:a', 'aac', '-b:a', '192k', '-shortest', out)
        print('video:', out)
    print('voz:', voz)
    for x in avisos:
        print('AVISO:', x)

if __name__ == '__main__':
    sys.exit(main())
