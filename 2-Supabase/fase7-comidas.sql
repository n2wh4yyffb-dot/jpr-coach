-- JPR Coach · fase 7: opción elegida en cada comida
-- Supabase > SQL Editor > New query > pegar todo > Run. Se puede ejecutar más de una vez.

-- Una fila por cliente y día. picks = {"0": {"o": 1, "meal": "Desayuno", "opt": "texto de la opción"}, ...}
create table if not exists public.meal_picks (
  client_id    uuid not null references public.profiles(id) on delete cascade,
  day          date not null,
  picks        jsonb not null default '{}',
  nutrition_id uuid,
  updated_at   timestamptz not null default now(),
  primary key (client_id, day)
);

alter table public.meal_picks enable row level security;

drop policy if exists "meal_picks ver" on public.meal_picks;
drop policy if exists "meal_picks crear" on public.meal_picks;
drop policy if exists "meal_picks cambiar" on public.meal_picks;
drop policy if exists "meal_picks borrar" on public.meal_picks;
-- El cliente ve y marca lo suyo; el coach solo lo ve.
create policy "meal_picks ver"     on public.meal_picks for select using (client_id = auth.uid() or public.jpr_is_coach());
create policy "meal_picks crear"   on public.meal_picks for insert with check (client_id = auth.uid());
create policy "meal_picks cambiar" on public.meal_picks for update using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "meal_picks borrar"  on public.meal_picks for delete using (client_id = auth.uid());

grant select, insert, update, delete on public.meal_picks to authenticated;
