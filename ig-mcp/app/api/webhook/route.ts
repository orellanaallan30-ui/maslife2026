import { validMetaSignature } from "@/lib/auth";
import { rpc } from "@/lib/db";
import { privateReply, replyToComment } from "@/lib/instagram";

export const dynamic = "force-dynamic";

// 1) Verificación que hace Meta al configurar el webhook.
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const ok =
    p.get("hub.mode") === "subscribe" &&
    !!process.env.WEBHOOK_VERIFY_TOKEN?.trim() &&
    p.get("hub.verify_token") === process.env.WEBHOOK_VERIFY_TOKEN?.trim();
  return ok ? new Response(p.get("hub.challenge") ?? "") : new Response("Forbidden", { status: 403 });
}

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function matches(text: string, keyword: string): boolean {
  const k = normalize(keyword).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${k}([^a-z0-9]|$)`).test(normalize(text));
}

// 2) Comentarios nuevos: aplica las reglas de palabra clave.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!validMetaSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("Firma inválida", { status: 401 });
  }
  const body = JSON.parse(raw);
  if (body.object !== "instagram") return new Response("ok");

  const rules = await rpc<any[]>("ig_list_rules", { p_only_active: true });
  if (!rules?.length) return new Response("ok");

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      const c = change.value ?? {};
      if (!c.id || !c.text) continue;
      if (c.from?.id && c.from.id === process.env.IG_USER_ID) continue; // nuestros propios comentarios

      const rule = rules.find((r) => matches(c.text, r.keyword));
      if (!rule) continue;

      // Deduplicar: Meta puede reenviar el mismo evento.
      const nuevo = await rpc<boolean>("ig_mark_processed", { p_comment_id: c.id, p_rule_id: rule.id });
      if (!nuevo) continue;

      try {
        if (rule.dm_message) await privateReply(c.id, rule.dm_message);
        if (rule.public_reply) await replyToComment(c.id, rule.public_reply);
      } catch (e: any) {
        await rpc("ig_processed_error", { p_comment_id: c.id, p_error: String(e?.message ?? e) });
      }
    }
  }
  return new Response("ok");
}
