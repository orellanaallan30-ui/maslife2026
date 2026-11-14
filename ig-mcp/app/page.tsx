export const dynamic = "force-dynamic";

// Muestra solo SI cada variable está cargada (nunca su valor), para revisar la
// configuración sin entrar a Vercel.
const VARIABLES = [
  "MCP_SECRET",
  "CRON_SECRET",
  "WEBHOOK_VERIFY_TOKEN",
  "IG_ACCESS_TOKEN",
  "IG_USER_ID",
  "FB_PAGE_ID",
  "META_APP_SECRET",
  "SUPABASE_URL",
];

export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>Más Life · Instagram MCP</h1>
      <p>Servidor privado. El endpoint MCP está en /api/mcp y requiere clave.</p>
      <h2>Configuración</h2>
      <ul>
        {VARIABLES.map((v) => (
          <li key={v} data-var={v} data-ok={process.env[v]?.trim() ? "1" : "0"}>
            {v}: {process.env[v]?.trim() ? "cargada" : "FALTA"}
          </li>
        ))}
      </ul>
    </main>
  );
}
