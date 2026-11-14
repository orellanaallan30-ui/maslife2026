import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { isAuthorized } from "@/lib/auth";
import { rpc } from "@/lib/db";
import * as ig from "@/lib/instagram";

export const maxDuration = 60;

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e: any) {
    return { content: [{ type: "text", text: `Error: ${e?.message ?? e}` }], isError: true };
  }
}

// Las herramientas que publican o escriben a terceros exigen confirmado=true.
const confirmado = z
  .literal(true)
  .describe("Pon true SOLO después de mostrarle al usuario el texto y el archivo exactos y que él lo apruebe.");

const caption = z.string().max(2200).optional().describe("Texto de la publicación (máx. 2.200 caracteres, máx. 5 hashtags)");
const publicUrl = z.string().url().describe("URL pública (https) del archivo, por ejemplo de Supabase Storage");

const handler = createMcpHandler(
  (server) => {
    // ---------- Configuración ----------
    server.tool(
      "descubrir_ids",
      "Muestra las páginas e IDs de Instagram que ve el token. Úsalo para obtener IG_USER_ID.",
      {},
      () => run(() => ig.discoverIds()),
    );

    // ---------- Lectura ----------
    server.tool("perfil", "Datos del perfil de Instagram: seguidores, bio, cantidad de publicaciones.", {}, () =>
      run(() => ig.getProfile()),
    );

    server.tool(
      "listar_publicaciones",
      "Últimas publicaciones con me gusta, comentarios y enlace.",
      { limite: z.number().int().min(1).max(50).default(12) },
      ({ limite }) => run(() => ig.listMedia(limite)),
    );

    server.tool(
      "estadisticas_cuenta",
      "Estadísticas de la cuenta. Las métricas disponibles cambian según la versión de la API.",
      {
        metricas: z.string().default("reach,views,accounts_engaged,total_interactions,follows_and_unfollows"),
        periodo: z.enum(["day", "week", "days_28", "lifetime"]).default("day"),
        tipo: z.enum(["total_value", "time_series"]).optional().default("total_value"),
        desde: z.string().optional().describe("Fecha ISO de inicio"),
        hasta: z.string().optional().describe("Fecha ISO de término"),
      },
      ({ metricas, periodo, tipo, desde, hasta }) =>
        run(() =>
          ig.accountInsights({
            metrics: metricas,
            period: periodo,
            metricType: tipo,
            since: desde ? Math.floor(Date.parse(desde) / 1000) : undefined,
            until: hasta ? Math.floor(Date.parse(hasta) / 1000) : undefined,
          }),
        ),
    );

    server.tool(
      "estadisticas_publicacion",
      "Estadísticas de una publicación o reel.",
      {
        media_id: z.string(),
        metricas: z.string().default("views,reach,likes,comments,shares,saved,total_interactions"),
      },
      ({ media_id, metricas }) => run(() => ig.mediaInsights(media_id, metricas)),
    );

    // ---------- Publicar ----------
    server.tool(
      "publicar_imagen",
      "Publica una foto en el feed.",
      { imagen_url: publicUrl, caption, confirmado },
      ({ imagen_url, caption }) => run(() => ig.publishImage({ imageUrl: imagen_url, caption })),
    );

    server.tool(
      "publicar_reel",
      "Publica un reel (MP4, 9:16, 3 s a 15 min). Si Meta sigue procesando, devuelve creationId: termínalo con terminar_publicacion.",
      {
        video_url: publicUrl,
        caption,
        portada_url: z.string().url().optional(),
        portada_ms: z.number().int().min(0).optional().describe("Milisegundo del video usado como portada"),
        compartir_en_feed: z.boolean().default(true),
        confirmado,
      },
      (a) =>
        run(() =>
          ig.publishReel({
            videoUrl: a.video_url,
            caption: a.caption,
            coverUrl: a.portada_url,
            thumbOffsetMs: a.portada_ms,
            shareToFeed: a.compartir_en_feed,
          }),
        ),
    );

    server.tool(
      "publicar_carrusel",
      "Publica un carrusel de 2 a 10 imágenes o videos.",
      {
        elementos: z.array(z.object({ tipo: z.enum(["image", "video"]), url: z.string().url() })).min(2).max(10),
        caption,
        confirmado,
      },
      ({ elementos, caption }) =>
        run(() => ig.publishCarousel({ items: elementos.map((e) => ({ type: e.tipo, url: e.url })), caption })),
    );

    server.tool(
      "publicar_historia",
      "Publica una historia con una imagen o un video.",
      { imagen_url: z.string().url().optional(), video_url: z.string().url().optional(), confirmado },
      ({ imagen_url, video_url }) => run(() => ig.publishStory({ imageUrl: imagen_url, videoUrl: video_url })),
    );

    server.tool(
      "terminar_publicacion",
      "Reintenta publicar un contenedor que quedó procesando (por ejemplo, un reel largo).",
      { creation_id: z.string(), confirmado },
      ({ creation_id }) => run(() => ig.publishContainer(creation_id)),
    );

    // ---------- Programar ----------
    server.tool(
      "programar_publicacion",
      "Deja una publicación en cola para una fecha y hora. Se publica sola con el cron.",
      {
        tipo: z.enum(["image", "reel", "carousel", "story"]),
        contenido: z
          .record(z.any())
          .describe("Igual que en publicar_*: imageUrl/videoUrl/caption/coverUrl, o items [{type,url}] para carrusel"),
        publicar_en: z.string().describe("Fecha y hora ISO con zona horaria, ej. 2026-11-20T19:00:00-03:00"),
        confirmado,
      },
      ({ tipo, contenido, publicar_en }) =>
        run(async () => {
          const when = new Date(publicar_en);
          if (isNaN(when.getTime())) throw new Error("Fecha inválida");
          const rows = await rpc<any[]>("ig_schedule_post", {
            p_kind: tipo,
            p_payload: contenido,
            p_publish_at: when.toISOString(),
          });
          return rows?.[0] ?? rows;
        }),
    );

    server.tool(
      "listar_programadas",
      "Muestra la cola de publicaciones programadas.",
      { estado: z.enum(["pending", "processing", "published", "error", "cancelled"]).optional() },
      ({ estado }) =>
        run(async () => {
          return rpc("ig_list_scheduled", { p_status: estado ?? null });
        }),
    );

    server.tool(
      "cancelar_programada",
      "Cancela una publicación programada que aún no sale.",
      { id: z.string().uuid() },
      ({ id }) =>
        run(async () => {
          const rows = await rpc<any[]>("ig_cancel_scheduled", { p_id: id });
          return rows?.[0] ?? rows;
        }),
    );

    // ---------- Comentarios ----------
    server.tool(
      "listar_comentarios",
      "Comentarios de una publicación, con sus respuestas.",
      { media_id: z.string(), limite: z.number().int().min(1).max(100).default(50) },
      ({ media_id, limite }) => run(() => ig.listComments(media_id, limite)),
    );

    server.tool(
      "responder_comentario",
      "Responde públicamente a un comentario.",
      { comment_id: z.string(), mensaje: z.string().min(1).max(2200), confirmado },
      ({ comment_id, mensaje }) => run(() => ig.replyToComment(comment_id, mensaje)),
    );

    server.tool(
      "ocultar_comentario",
      "Oculta o vuelve a mostrar un comentario (spam, ofensivo).",
      { comment_id: z.string(), ocultar: z.boolean().default(true) },
      ({ comment_id, ocultar }) => run(() => ig.setCommentHidden(comment_id, ocultar)),
    );

    // ---------- Mensajes ----------
    server.tool(
      "respuesta_privada",
      "Envía un mensaje directo a quien dejó un comentario (una vez por comentario, dentro de 7 días).",
      { comment_id: z.string(), mensaje: z.string().min(1).max(1000), confirmado },
      ({ comment_id, mensaje }) => run(() => ig.privateReply(comment_id, mensaje)),
    );

    server.tool(
      "listar_conversaciones",
      "Últimas conversaciones de mensajes directos.",
      { limite: z.number().int().min(1).max(25).default(10) },
      ({ limite }) => run(() => ig.listConversations(limite)),
    );

    server.tool(
      "enviar_mensaje",
      "Responde un mensaje directo. Solo funciona si la persona escribió en las últimas 24 h.",
      { igsid: z.string().describe("ID de la persona en la conversación"), mensaje: z.string().min(1).max(1000), confirmado },
      ({ igsid, mensaje }) => run(() => ig.sendMessage(igsid, mensaje)),
    );

    // ---------- Reglas por palabra clave (las usa el webhook) ----------
    server.tool(
      "crear_regla_palabra_clave",
      "Cuando alguien comente la palabra clave, el webhook le manda el mensaje privado y/o responde el comentario.",
      {
        palabra: z.string().min(2).max(40),
        mensaje_privado: z.string().max(1000).optional(),
        respuesta_publica: z.string().max(500).optional(),
        confirmado,
      },
      ({ palabra, mensaje_privado, respuesta_publica }) =>
        run(async () => {
          if (!mensaje_privado && !respuesta_publica) throw new Error("Define al menos un mensaje");
          const rows = await rpc<any[]>("ig_upsert_rule", {
            p_keyword: palabra,
            p_dm: mensaje_privado ?? null,
            p_reply: respuesta_publica ?? null,
          });
          return rows?.[0] ?? rows;
        }),
    );

    server.tool("listar_reglas", "Reglas de palabra clave activas e inactivas.", {}, () =>
      run(async () => {
        return rpc("ig_list_rules", { p_only_active: false });
      }),
    );

    server.tool(
      "activar_regla",
      "Activa o desactiva una regla de palabra clave.",
      { palabra: z.string(), activa: z.boolean() },
      ({ palabra, activa }) =>
        run(async () => {
          return rpc("ig_set_rule_active", { p_keyword: palabra, p_active: activa });
        }),
    );
  },
  { serverInfo: { name: "maslife-instagram", version: "1.0.0" } },
  { basePath: "/api", maxDuration: 60, verboseLogs: false },
);

async function guarded(req: Request) {
  if (!isAuthorized(req)) return new Response("No autorizado", { status: 401 });
  return handler(req);
}

export { guarded as GET, guarded as POST, guarded as DELETE };
