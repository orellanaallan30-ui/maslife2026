-- App de estudio para estudiantes (no es dato clínico).
--
-- Vive aparte de las tablas de pacientes a propósito: aquí no hay datos de
-- salud de terceros, solo el material de estudio de quien usa la app. Mezclarlo
-- con la ficha clínica complicaría el cumplimiento de la Ley 21.719 sin ninguna
-- ventaja.
--
-- El acceso es por enlace secreto: el token va en el fragmento de la URL y el
-- servidor lo valida contra study_users. No hay contraseña ni cuenta.

CREATE TABLE IF NOT EXISTS public.study_users (
  token           TEXT PRIMARY KEY,
  nombre          TEXT NOT NULL,
  -- Tope diario de llamadas a la IA. El contador se reinicia solo cuando cambia
  -- el día, comparando ai_day: así no hace falta una tarea programada.
  ai_calls_today  INTEGER NOT NULL DEFAULT 0,
  ai_day          DATE NOT NULL DEFAULT CURRENT_DATE,
  ai_daily_limit  INTEGER NOT NULL DEFAULT 40,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.study_progress (
  token       TEXT NOT NULL REFERENCES public.study_users(token) ON DELETE CASCADE,
  app         TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (token, app)
);

-- RLS activo y SIN políticas: nadie llega desde el navegador con la clave
-- anónima. Todo pasa por /api/ai-agent con service_role, que es quien valida el
-- token. Es el mismo criterio que webhook_events.
ALTER TABLE public.study_users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_progress ENABLE ROW LEVEL SECURITY;
