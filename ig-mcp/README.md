# Más Life · Instagram MCP

Servidor MCP propio para que Claude maneje el Instagram de **@clinicamaslife** usando la
Graph API oficial de Meta. Next.js en Vercel + Supabase.

## Qué puede hacer Claude con él

| Área | Herramientas |
|---|---|
| Configuración | `descubrir_ids` |
| Lectura | `perfil`, `listar_publicaciones`, `estadisticas_cuenta`, `estadisticas_publicacion` |
| Publicar | `publicar_imagen`, `publicar_reel`, `publicar_carrusel`, `publicar_historia`, `terminar_publicacion` |
| Programar | `programar_publicacion`, `listar_programadas`, `cancelar_programada` |
| Comentarios | `listar_comentarios`, `responder_comentario`, `ocultar_comentario` |
| Mensajes | `respuesta_privada`, `listar_conversaciones`, `enviar_mensaje` |
| Palabra clave | `crear_regla_palabra_clave`, `listar_reglas`, `activar_regla` |

Todo lo que publica o escribe a otra persona exige `confirmado: true`: Claude tiene que
mostrarte el texto y el archivo antes. Las reglas de palabra clave, una vez creadas,
responden solas desde el webhook.

## Puesta en marcha

### 1. Token permanente
El token del Explorador dura horas. Conviértelo en un token de página que no caduca,
en tu terminal (nunca en el chat):

```powershell
npm install
$env:META_APP_ID="..."; $env:META_APP_SECRET="..."; $env:SHORT_TOKEN="..."; npm run token
```

Queda guardado en `.env.local` junto con `IG_USER_ID` y `FB_PAGE_ID`.

### 2. Supabase
Ya aplicado en el proyecto de la clínica (`supabase/migrations/0025_instagram_mcp.sql` en la raíz del repo).

### 3. Vercel
1. Sube el proyecto a GitHub e impórtalo en Vercel.
2. Carga todas las variables de `.env.example` (copia los valores de `.env.local`).
3. Genera `MCP_SECRET` y `CRON_SECRET` largos y aleatorios.
4. Despliega.

Las publicaciones programadas las dispara Supabase (`pg_cron`, cada 10 minutos), no
Vercel: el plan Hobby solo permite cron diario. La migración `0025_instagram_mcp.sql`
ya deja el job creado; solo falta guardar el `CRON_SECRET` en Vault una vez, desde
el SQL Editor:

```sql
select vault.create_secret('PEGA_AQUI_TU_CRON_SECRET', 'ig_mcp_cron_secret');
```

### 4. Conectarlo a Claude
- **Claude (web, escritorio, móvil):** Configuración → Conectores → Agregar conector personalizado →
  `https://TU-PROYECTO.vercel.app/api/mcp?key=TU_MCP_SECRET`
- **Claude Code:**
  ```
  claude mcp add --transport http maslife-ig https://TU-PROYECTO.vercel.app/api/mcp --header "Authorization: Bearer TU_MCP_SECRET"
  ```

Trata esa URL como una contraseña: quien la tenga puede publicar en tu cuenta.

### 5. Webhook de palabra clave (opcional)
En la app de Meta → Webhooks → Instagram:
- URL: `https://TU-PROYECTO.vercel.app/api/webhook`
- Token de verificación: el valor de `WEBHOOK_VERIFY_TOKEN`
- Suscríbete al campo `comments`.

Necesita el permiso `pages_manage_metadata` y que `META_APP_SECRET` esté en Vercel.

## Requisitos de los archivos
- Las imágenes y videos deben estar en una **URL pública https** (por ejemplo, un bucket
  público de Supabase Storage).
- Imagen: JPEG, hasta 8 MB. Reel: MP4/H.264, 9:16, hasta 15 min.
- Límite de Meta: unas 50 publicaciones por API cada 24 h.

## Reglas que respeta
- Solo API oficial: nada de scraping ni de seguir/dar me gusta automático.
- Mensajes directos solo dentro de la ventana de 24 h, o como respuesta privada a un comentario.
- Mientras la app esté en modo desarrollo, solo funciona con cuentas que tengan rol en ella.
