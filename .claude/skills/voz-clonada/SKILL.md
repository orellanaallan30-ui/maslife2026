---
name: voz-clonada
description: Locutar videos de Clínica Mas Life con la voz clonada del profesional (gratis, Chatterbox Multilingual, licencia MIT) y sincronizarla con los tramos del video. Usar cuando el usuario pida "pon mi voz", "locuta el video", "clona mi voz" o quiera voz en off en un video ya editado.
---

# Voz clonada para videos

Herramienta propia sobre **Chatterbox Multilingual** de Resemble AI (licencia MIT, uso comercial permitido, español). Clona una voz con 10-30 s de grabación y genera cada frase del guion; luego la ajusta al tiempo de cada tramo y la mezcla con el video.

## Reglas
- Solo la voz del propio usuario, o de alguien que lo autorice por escrito. Nunca voces de terceros sin permiso.
- Si el video se usa como anuncio en Meta, declarar que la voz es generada con IA (`self_ai_disclosure`).
- Los audios de voz personales no se suben al repositorio (quedan en el scratchpad de la sesión).
- Chatterbox agrega una marca de agua inaudible (PerTh) a todo lo que genera.

## Requisitos del entorno
- Los modelos se descargan de Hugging Face: el dominio `huggingface.co` (y sus descargas `*.hf.co`) debe estar permitido en la red del entorno. Si `curl -sI https://huggingface.co` falla, pedir al usuario que lo agregue en Configuración del entorno → Network access → Allowed domains (guía: https://code.claude.com/docs/en/cloud-environments#network-access).
- Venv aparte (no en la app): `python3 -m venv venv_voz && ./venv_voz/bin/pip install chatterbox-tts==0.1.7` en el scratchpad. Corre en CPU (unos minutos por video corto).

## Grabación que pide al usuario
30-60 s con el celular, en un lugar silencioso, sin música, a 20-30 cm de la boca, con el tono de una consulta. Texto sugerido para leer:

> Hola, soy kinesiólogo en Clínica Mas Life. En cada evaluación vemos cómo te mueves, dónde está el dolor y qué necesitas para volver a tus actividades. Trabajamos movilidad, control y fuerza, paso a paso y a tu ritmo. ¿Tienes dudas? Agenda tu evaluación en clinicamaslife.cl y conversemos.

## Uso
1. Armar `guion.json` con una frase por tramo del video (segundos):
   ```json
   [{"inicio": 0.3, "fin": 5.0, "texto": "Llegó con dolor en las piernas. Pero no tratamos solo el dolor."}]
   ```
   Regla práctica: unas 2,5 palabras por segundo del tramo.
2. Ejecutar:
   ```bash
   ./venv_voz/bin/python .claude/skills/voz-clonada/clonar_voz.py --ref grabacion.m4a --guion guion.json --out salida/ --video video.mp4
   ```
   - `--exag` (0,25 a 1,0): expresividad; 0,5 natural, 0,7 más enfático.
   - `--cfg` (0,2 a 0,8): ritmo; más bajo es más pausado.
   - `--fondo-db`: volumen del audio original bajo la voz (por defecto -18 dB; baja más cuando habla).
3. Revisar los `AVISO` (frases que no caben en su tramo → acortar el texto) y enviar al usuario `video_con_voz.mp4` y `voz.wav`.
4. Si el parecido no convence: pedir una grabación más larga y limpia, o probar `--exag 0.6 --cfg 0.4`.
