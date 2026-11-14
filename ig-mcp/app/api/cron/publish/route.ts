import { isCron } from "@/lib/auth";
import { db } from "@/lib/db";
import { publishByKind, publishContainer, type PostKind } from "@/lib/instagram";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Publica lo que ya venció en la cola. Lo llama Vercel Cron (o pg_cron de Supabase).
export async function GET(req: Request) {
  if (!isCron(req)) return new Response("No autorizado", { status: 401 });

  const now = new Date().toISOString();
  const { data: due, error } = await db()
    .from("scheduled_posts")
    .select("*")
    .in("status", ["pending", "processing"])
    .lte("publish_at", now)
    .lt("attempts", 5)
    .order("publish_at")
    .limit(3);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const post of due ?? []) {
    // Reclama la fila para que dos ejecuciones no publiquen lo mismo.
    const { data: claimed } = await db()
      .from("scheduled_posts")
      .update({ status: "processing", attempts: post.attempts + 1, updated_at: now })
      .eq("id", post.id)
      .eq("attempts", post.attempts)
      .select("id");
    if (!claimed?.length) continue;

    try {
      const r = post.creation_id
        ? await publishContainer(post.creation_id, 15_000)
        : await publishByKind(post.kind as PostKind, post.payload);
      const update =
        r.status === "published"
          ? { status: "published", media_id: r.mediaId, error: null }
          : { status: "processing", creation_id: r.creationId };
      await db().from("scheduled_posts").update({ ...update, updated_at: new Date().toISOString() }).eq("id", post.id);
      results.push({ id: post.id, ...r });
    } catch (e: any) {
      const final = post.attempts + 1 >= 5;
      await db()
        .from("scheduled_posts")
        .update({ status: final ? "error" : "pending", error: String(e?.message ?? e), updated_at: new Date().toISOString() })
        .eq("id", post.id);
      results.push({ id: post.id, error: String(e?.message ?? e) });
    }
  }
  return Response.json({ processed: results.length, results });
}
