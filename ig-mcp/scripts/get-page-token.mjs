// Convierte el token corto del Explorador de la API Graph en un token de
// PÁGINA que no caduca, y obtiene el IG_USER_ID. Lo escribe en .env.local
// sin mostrarlo en pantalla.
//
// Uso (en tu terminal, no en el chat):
//   META_APP_ID=xxx META_APP_SECRET=xxx SHORT_TOKEN=xxx npm run token
//
// En Windows PowerShell:
//   $env:META_APP_ID="xxx"; $env:META_APP_SECRET="xxx"; $env:SHORT_TOKEN="xxx"; npm run token

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const V = process.env.GRAPH_API_VERSION || "v23.0";
const { META_APP_ID, META_APP_SECRET, SHORT_TOKEN } = process.env;
const PAGE_ID = process.env.FB_PAGE_ID || "106841074135065";

if (!META_APP_ID || !META_APP_SECRET || !SHORT_TOKEN) {
  console.error("Faltan META_APP_ID, META_APP_SECRET o SHORT_TOKEN");
  process.exit(1);
}

async function get(path, params) {
  const url = new URL(`https://graph.facebook.com/${V}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d;
}

// 1) Token de usuario de larga duración (60 días)
const long = await get("/oauth/access_token", {
  grant_type: "fb_exchange_token",
  client_id: META_APP_ID,
  client_secret: META_APP_SECRET,
  fb_exchange_token: SHORT_TOKEN,
});

// 2) Token de página (no caduca cuando sale de un token de usuario largo)
const pages = await get("/me/accounts", {
  access_token: long.access_token,
  fields: "id,name,access_token,instagram_business_account{id,username}",
});
const page = pages.data.find((p) => p.id === PAGE_ID) ?? pages.data[0];
if (!page) throw new Error("El token no ve ninguna página");
if (!page.instagram_business_account) {
  throw new Error(`La página "${page.name}" no tiene una cuenta de Instagram profesional vinculada`);
}

// 3) Guardar en .env.local
const file = ".env.local";
let env = existsSync(file) ? readFileSync(file, "utf8") : "";
const set = (k, v) => {
  const line = `${k}=${v}`;
  env = new RegExp(`^${k}=.*$`, "m").test(env)
    ? env.replace(new RegExp(`^${k}=.*$`, "m"), line)
    : env + (env.endsWith("\n") || !env ? "" : "\n") + line + "\n";
};
set("IG_ACCESS_TOKEN", page.access_token);
set("IG_USER_ID", page.instagram_business_account.id);
set("FB_PAGE_ID", page.id);
writeFileSync(file, env);

console.log(`Listo. Página: ${page.name} · Instagram: @${page.instagram_business_account.username}`);
console.log(`IG_USER_ID=${page.instagram_business_account.id}`);
console.log("El token quedó guardado en .env.local (no se muestra). Cópialo a Vercel desde ahí.");
