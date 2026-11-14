import { isCron } from "@/lib/auth";
import { rpc } from "@/lib/db";
import { publishByKind, publishContainer, type PostKind } from "@/lib/instagram";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Publica lo que ya venció en la cola. Lo llama Vercel Cron (o pg_cron de Supabase).
export async function GET(req: Request) {
  if (!isCron(req)) return new Response("No autorizado", { status: 401 });

  let due: any[];
  try {
    due = await rpc<any[]>("ig_due_posts");
  } catch (e: any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 500 });
  }

  const results = [];
  for (const post of due ?? []) {
    // Reclama la fila para que dos ejecuciones no publiquen lo mismo.
    const claimed = await rpc<boolean>("ig_claim_post", { p_id: post.id, p_attempts: post.attempts });
    if (!claimed) continue;

    try {
      const r = post.creation_id
        ? await publishContainer(post.creation_id, 15_000)
        : await publishByKind(post.kind as PostKind, post.payload);
      await rpc(
        "ig_update_post",
        r.status === "published"
          ? { p_id: post.id, p_status: "published", p_media_id: r.mediaId, p_error: null }
          : { p_id: post.id, p_status: "processing", p_creation_id: r.creationId, p_error: null },
      );
      results.push({ id: post.id, ...r });
    } catch (e: any) {
      const final = post.attempts + 1 >= 5;
      await rpc("ig_update_post", {
        p_id: post.id,
        p_status: final ? "error" : "pending",
        p_error: String(e?.message ?? e),
      });
      results.push({ id: post.id, error: String(e?.message ?? e) });
    }
  }
  return Response.json({ processed: results.length, results });
}
