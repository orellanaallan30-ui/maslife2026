import { NextResponse, type NextRequest } from "next/server";

// Dirección para el conector de claude.ai: /k/<MCP_SECRET>/mcp
// La clave va en la ruta (no en ?key=), porque el conector puede descartar la
// parte de la URL después del "?" y entonces intenta un inicio de sesión OAuth
// que este servidor no tiene. Aquí se reescribe a /api/mcp con la cabecera
// Authorization, que valida isAuthorized() en lib/auth.ts.
export function middleware(req: NextRequest) {
  const m = req.nextUrl.pathname.match(/^\/k\/([^/]+)\/mcp\/?$/);
  if (!m) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/api/mcp";
  url.search = "";
  const headers = new Headers(req.headers);
  headers.set("authorization", `Bearer ${decodeURIComponent(m[1])}`);
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = { matcher: "/k/:path*" };
