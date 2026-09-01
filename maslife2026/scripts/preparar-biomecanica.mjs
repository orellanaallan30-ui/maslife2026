// Deja en public/mediapipe/ lo que necesita la detección de puntos anatómicos.
//
// Por qué en tiempo de compilación y no en el repositorio: son ~18 MB de
// binarios (12 MB de WebAssembly y 5,6 MB del modelo). Versionarlos engorda el
// historial para siempre y no aportan nada revisable en un diff.
//
// Y por qué se sirven desde nuestro dominio y no desde un CDN público: esto se
// usa en consulta, a veces en redes de clínicas con salida restringida. Un
// modelo que no carga significa una evaluación que no se puede hacer con el
// paciente delante. El WebAssembly ya está en node_modules tras `npm install`,
// así que solo el modelo necesita red.

import { mkdir, copyFile, access, stat, writeFile } from 'fs/promises';
import { createWriteStream } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');
const destino = join(raiz, 'public', 'mediapipe');
const wasmOrigen = join(raiz, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');

// Modelo "lite": 5,6 MB frente a 9 MB del "full". En fotografía clínica —sujeto
// centrado, quieto y bien iluminado— la diferencia de precisión no justifica
// casi duplicar lo que el profesional tiene que descargar.
const MODELO_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const MODELO_MIN_BYTES = 4_000_000;

const existe = async (p) => { try { await access(p); return true; } catch { return false; } };

async function copiarWasm() {
  // Solo la variante SIMD: todos los navegadores actuales la soportan y la de
  // respaldo son 11 MB más.
  const archivos = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];
  for (const f of archivos) {
    const origen = join(wasmOrigen, f);
    if (!(await existe(origen))) {
      throw new Error(`falta ${f} en node_modules/@mediapipe/tasks-vision/wasm — ¿se ejecutó npm install?`);
    }
    await copyFile(origen, join(destino, f));
  }
  console.log('[biomecánica] WebAssembly copiado desde node_modules');
}

async function descargarModelo() {
  const ruta = join(destino, 'pose_landmarker_lite.task');
  if (await existe(ruta)) {
    const { size } = await stat(ruta);
    if (size > MODELO_MIN_BYTES) {
      console.log('[biomecánica] el modelo ya está descargado');
      return;
    }
  }
  const r = await fetch(MODELO_URL);
  if (!r.ok) throw new Error(`el modelo respondió ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  // Un fichero truncado se detectaría en el navegador como un error opaco, así
  // que se comprueba aquí, donde el mensaje es útil.
  if (buf.length < MODELO_MIN_BYTES) throw new Error(`descarga incompleta: ${buf.length} bytes`);
  await writeFile(ruta, buf);
  console.log(`[biomecánica] modelo descargado (${(buf.length / 1e6).toFixed(1)} MB)`);
}

try {
  await mkdir(destino, { recursive: true });
  await copiarWasm();
  await descargarModelo();
} catch (e) {
  // No se rompe la compilación. El resto de la plataforma —agenda, fichas,
  // cobros— no depende de esto, y tumbar un despliegue entero porque no se pudo
  // bajar un modelo sería desproporcionado. La interfaz avisa si falta.
  console.error(`[biomecánica] AVISO: no se prepararon los recursos (${e.message}).`);
  console.error('[biomecánica] La medición sobre fotografías quedará deshabilitada en este despliegue.');
}
