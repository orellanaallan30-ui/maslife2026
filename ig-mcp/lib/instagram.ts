import { gget, gpost, igUserId, pageId } from "./graph";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type PublishResult =
  | { status: "published"; mediaId: string; permalink?: string }
  | { status: "processing"; creationId: string };

/** Espera a que Meta procese el contenedor. Devuelve false si se acaba el tiempo. */
async function waitForContainer(id: string, timeoutMs = 45_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const c = await gget(`/${id}`, { fields: "status_code,status" });
    if (c.status_code === "FINISHED") return true;
    if (c.status_code === "ERROR" || c.status_code === "EXPIRED") {
      throw new Error(`Meta rechazó el archivo: ${c.status || c.status_code}`);
    }
    await sleep(3000);
  }
  return false;
}

/** Publica un contenedor ya creado (o reintenta uno que seguía procesando). */
export async function publishContainer(creationId: string, waitMs = 45_000): Promise<PublishResult> {
  const ready = await waitForContainer(creationId, waitMs);
  if (!ready) return { status: "processing", creationId };
  const p = await gpost(`/${igUserId()}/media_publish`, { creation_id: creationId });
  const info = await gget(`/${p.id}`, { fields: "permalink" }).catch(() => ({}));
  return { status: "published", mediaId: p.id, permalink: info.permalink };
}

export async function publishImage(o: { imageUrl: string; caption?: string }) {
  const c = await gpost(`/${igUserId()}/media`, {
    image_url: o.imageUrl,
    caption: o.caption,
  });
  return publishContainer(c.id);
}

export async function publishReel(o: {
  videoUrl: string;
  caption?: string;
  coverUrl?: string;
  thumbOffsetMs?: number;
  shareToFeed?: boolean;
}) {
  const c = await gpost(`/${igUserId()}/media`, {
    media_type: "REELS",
    video_url: o.videoUrl,
    caption: o.caption,
    cover_url: o.coverUrl,
    thumb_offset: o.thumbOffsetMs,
    share_to_feed: o.shareToFeed ?? true,
  });
  return publishContainer(c.id);
}

export async function publishStory(o: { imageUrl?: string; videoUrl?: string }) {
  if (!o.imageUrl && !o.videoUrl) throw new Error("La historia necesita imageUrl o videoUrl");
  const c = await gpost(`/${igUserId()}/media`, {
    media_type: "STORIES",
    image_url: o.imageUrl,
    video_url: o.videoUrl,
  });
  return publishContainer(c.id);
}

export async function publishCarousel(o: {
  items: { type: "image" | "video"; url: string }[];
  caption?: string;
}) {
  if (o.items.length < 2 || o.items.length > 10) {
    throw new Error("Un carrusel lleva entre 2 y 10 elementos");
  }
  const children: string[] = [];
  for (const it of o.items) {
    const c = await gpost(`/${igUserId()}/media`, {
      is_carousel_item: true,
      ...(it.type === "image"
        ? { image_url: it.url }
        : { media_type: "VIDEO", video_url: it.url }),
    });
    if (it.type === "video" && !(await waitForContainer(c.id, 30_000))) {
      throw new Error("Un video del carrusel tarda en procesarse; reintenta en unos minutos");
    }
    children.push(c.id);
  }
  const parent = await gpost(`/${igUserId()}/media`, {
    media_type: "CAROUSEL",
    children: children.join(","),
    caption: o.caption,
  });
  return publishContainer(parent.id);
}

export type PostKind = "image" | "reel" | "carousel" | "story";

export async function publishByKind(kind: PostKind, payload: any): Promise<PublishResult> {
  switch (kind) {
    case "image": return publishImage(payload);
    case "reel": return publishReel(payload);
    case "carousel": return publishCarousel(payload);
    case "story": return publishStory(payload);
  }
}

// ---------- Lectura ----------

export const getProfile = () =>
  gget(`/${igUserId()}`, {
    fields: "id,username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url",
  });

export const listMedia = (limit = 12) =>
  gget(`/${igUserId()}/media`, {
    fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count",
    limit,
  });

export const listComments = (mediaId: string, limit = 50) =>
  gget(`/${mediaId}/comments`, {
    fields: "id,text,username,timestamp,like_count,hidden,replies{id,text,username,timestamp}",
    limit,
  });

export const accountInsights = (o: {
  metrics: string;
  period: string;
  metricType?: string;
  since?: number;
  until?: number;
}) =>
  gget(`/${igUserId()}/insights`, {
    metric: o.metrics,
    period: o.period,
    metric_type: o.metricType,
    since: o.since,
    until: o.until,
  });

export const mediaInsights = (mediaId: string, metrics: string) =>
  gget(`/${mediaId}/insights`, { metric: metrics });

// ---------- Comentarios y mensajes ----------

export const replyToComment = (commentId: string, message: string) =>
  gpost(`/${commentId}/replies`, { message });

export const setCommentHidden = (commentId: string, hide: boolean) =>
  gpost(`/${commentId}`, { hide });

/** Mensaje privado a quien comentó (válido una vez por comentario, dentro de 7 días). */
export const privateReply = (commentId: string, text: string) =>
  gpost(`/${pageId()}/messages`, {
    recipient: { comment_id: commentId },
    message: { text },
  });

/** Mensaje directo. Solo funciona si la persona te escribió en las últimas 24 h. */
export const sendMessage = (igsid: string, text: string) =>
  gpost(`/${pageId()}/messages`, {
    recipient: { id: igsid },
    message: { text },
  });

export const listConversations = (limit = 10) =>
  gget(`/${pageId()}/conversations`, {
    platform: "instagram",
    fields: "id,updated_time,participants,messages.limit(5){message,from,created_time}",
    limit,
  });

export async function discoverIds() {
  try {
    return await gget(`/me/accounts`, {
      fields: "id,name,instagram_business_account{id,username}",
    });
  } catch {
    // Si el token ya es de página, /me es la página.
    return gget(`/me`, { fields: "id,name,instagram_business_account{id,username}" });
  }
}
