-- MCP de Instagram: acceso a sus tablas sin service_role.
-- El servidor (proyecto Vercel maslife-instagram-mcp) usa la clave publicable de
-- Supabase y llama estas funciones con su CRON_SECRET. Cada función compara esa
-- clave con la guardada en Vault (ig_mcp_cron_secret). Así la clave del servidor
-- solo alcanza las 3 tablas de Instagram, nunca datos de pacientes.

create or replace function public.ig_mcp_auth(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  esperado text;
begin
  select decrypted_secret into esperado
    from vault.decrypted_secrets
   where name = 'ig_mcp_cron_secret'
   limit 1;
  if esperado is null or length(esperado) < 16 or p_key is null or p_key <> esperado then
    raise exception 'no autorizado' using errcode = '42501';
  end if;
end;
$$;

-- ---------- Publicaciones programadas ----------

create or replace function public.ig_schedule_post(p_key text, p_kind text, p_payload jsonb, p_publish_at timestamptz)
returns table (id uuid, kind text, publish_at timestamptz, status text)
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ig_mcp_auth(p_key);
  return query
    insert into public.scheduled_posts (kind, payload, publish_at)
    values (p_kind, p_payload, p_publish_at)
    returning scheduled_posts.id, scheduled_posts.kind, scheduled_posts.publish_at, scheduled_posts.status;
end;
$$;

create or replace function public.ig_list_scheduled(p_key text, p_status text default null)
returns table (id uuid, kind text, payload jsonb, publish_at timestamptz, status text, media_id text, error text)
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ig_mcp_auth(p_key);
  return query
    select s.id, s.kind, s.payload, s.publish_at, s.status, s.media_id, s.error
      from public.scheduled_posts s
     where p_status is null or s.status = p_status
     order by s.publish_at
     limit 50;
end;
$$;

create or replace function public.ig_cancel_scheduled(p_key text, p_id uuid)
returns table (id uuid, status text)
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ig_mcp_auth(p_key);
  return query
    update public.scheduled_posts s
       set status = 'cancelled', updated_at = now()
     where s.id = p_id and s.status = 'pending'
    returning s.id, s.status;
  if not found then
    raise exception 'No existe o ya no está pendiente';
  end if;
end;
$$;

-- ---------- Cron ----------

create or replace function public.ig_due_posts(p_key text)
returns setof public.scheduled_posts
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ig_mcp_auth(p_key);
  return query
    select * from public.scheduled_posts s
     where s.status in ('pending', 'processing')
       and s.publish_at <= now()
       and s.attempts < 5
     order by s.publish_at
     limit 3;
end;
$$;

-- Reclama la fila para que dos ejecuciones no publiquen lo mismo.
create or replace function public.ig_claim_post(p_key text, p_id uuid, p_attempts int)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ig_mcp_auth(p_key);
  update public.scheduled_posts
     set status = 'processing', attempts = p_attempts + 1, updated_at = now()
   where id = p_id and attempts = p_attempts;
  return found;
end;
$$;

create or replace function public.ig_update_post(
  p_key text, p_id uuid, p_status text,
  p_media_id text default null, p_creation_id text default null, p_error text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ig_mcp_auth(p_key);
  update public.scheduled_posts
     set status = p_status,
         media_id = coalesce(p_media_id, media_id),
         creation_id = coalesce(p_creation_id, creation_id),
         error = p_error,
         updated_at = now()
   where id = p_id;
end;
$$;

-- ---------- Reglas por palabra clave ----------

create or replace function public.ig_upsert_rule(p_key text, p_keyword text, p_dm text, p_reply text)
returns setof public.keyword_rules
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ig_mcp_auth(p_key);
  return query
    insert into public.keyword_rules (keyword, dm_message, public_reply, active)
    values (lower(trim(p_keyword)), p_dm, p_reply, true)
    on conflict (keyword) do update
      set dm_message = excluded.dm_message, public_reply = excluded.public_reply, active = true
    returning *;
end;
$$;

create or replace function public.ig_list_rules(p_key text, p_only_active boolean default false)
returns setof public.keyword_rules
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ig_mcp_auth(p_key);
  return query
    select * from public.keyword_rules r
     where not p_only_active or r.active
     order by r.created_at;
end;
$$;

create or replace function public.ig_set_rule_active(p_key text, p_keyword text, p_active boolean)
returns setof public.keyword_rules
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ig_mcp_auth(p_key);
  return query
    update public.keyword_rules r set active = p_active
     where r.keyword = lower(trim(p_keyword))
    returning *;
end;
$$;

-- ---------- Webhook ----------

-- true si el comentario no se había procesado (Meta puede reenviar eventos).
create or replace function public.ig_mark_processed(p_key text, p_comment_id text, p_rule_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ig_mcp_auth(p_key);
  insert into public.processed_comments (comment_id, rule_id)
  values (p_comment_id, p_rule_id)
  on conflict (comment_id) do nothing;
  return found;
end;
$$;

create or replace function public.ig_processed_error(p_key text, p_comment_id text, p_error text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ig_mcp_auth(p_key);
  update public.processed_comments set error = p_error where comment_id = p_comment_id;
end;
$$;

-- Permisos: solo se pueden ejecutar por la API (rol anon) con la clave correcta.
do $$
declare f text;
begin
  foreach f in array array[
    'ig_mcp_auth(text)',
    'ig_schedule_post(text,text,jsonb,timestamptz)',
    'ig_list_scheduled(text,text)',
    'ig_cancel_scheduled(text,uuid)',
    'ig_due_posts(text)',
    'ig_claim_post(text,uuid,int)',
    'ig_update_post(text,uuid,text,text,text,text)',
    'ig_upsert_rule(text,text,text,text)',
    'ig_list_rules(text,boolean)',
    'ig_set_rule_active(text,text,boolean)',
    'ig_mark_processed(text,text,uuid)',
    'ig_processed_error(text,text,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    if f <> 'ig_mcp_auth(text)' then
      execute format('grant execute on function public.%s to anon', f);
    end if;
  end loop;
end;
$$;

-- Cinturón y tirantes: además de RLS sin políticas, la API pública no tiene permisos sobre las tablas.
revoke all on public.scheduled_posts, public.keyword_rules, public.processed_comments from anon, authenticated;
