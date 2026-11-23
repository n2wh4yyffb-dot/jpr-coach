-- JPR Coach · fase 6: datos de la app Salud del iPhone (con permiso de cada cliente)
-- Supabase > SQL Editor > New query > pegar todo > Run. Se puede ejecutar más de una vez.

-- ¿Quien hace la consulta es el coach?
create or replace function public.jpr_is_coach() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'coach');
$$;

-- Conexión y consentimiento de cada cliente. Solo el propio cliente puede crearla (es su permiso).
create table if not exists public.health_links (
  client_id       uuid primary key references public.profiles(id) on delete cascade,
  token           text not null unique check (length(token) >= 24),
  metrics         text[] not null default '{}',
  consent_version text not null,
  consented_at    timestamptz not null default now(),
  last_sync_at    timestamptz,
  last_payload    jsonb
);

-- Un registro por cliente y día. Solo escribe la función health-ingest (con la clave de servidor).
create table if not exists public.health_daily (
  client_id   uuid not null references public.profiles(id) on delete cascade,
  day         date not null,
  steps       integer,
  active_kcal numeric,
  resting_hr  numeric,
  hrv_ms      numeric,
  sleep_h     numeric,
  weight_kg   numeric,
  updated_at  timestamptz not null default now(),
  primary key (client_id, day)
);

alter table public.health_links enable row level security;
alter table public.health_daily enable row level security;

drop policy if exists "health_links ver" on public.health_links;
drop policy if exists "health_links crear" on public.health_links;
drop policy if exists "health_links cambiar" on public.health_links;
drop policy if exists "health_links borrar" on public.health_links;
create policy "health_links ver"     on public.health_links for select using (client_id = auth.uid() or public.jpr_is_coach());
create policy "health_links crear"   on public.health_links for insert with check (client_id = auth.uid());
create policy "health_links cambiar" on public.health_links for update using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "health_links borrar"  on public.health_links for delete using (client_id = auth.uid());

drop policy if exists "health_daily ver" on public.health_daily;
drop policy if exists "health_daily borrar" on public.health_daily;
create policy "health_daily ver"    on public.health_daily for select using (client_id = auth.uid() or public.jpr_is_coach());
create policy "health_daily borrar" on public.health_daily for delete using (client_id = auth.uid());

-- El cliente no puede tocar las columnas que rellena la función (último envío)
revoke update on public.health_links from authenticated;
grant update (metrics) on public.health_links to authenticated;

-- Tiempo real: el panel del coach se actualiza solo cuando llegan datos
do $$ begin
  begin alter publication supabase_realtime add table public.health_daily; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.health_links; exception when duplicate_object then null; end;
end $$;
