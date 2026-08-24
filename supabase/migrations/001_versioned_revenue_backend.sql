-- ACES MSD Revenue Dashboard: versioned Supabase backend
create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'user');
create type public.dataset_status as enum ('processing', 'published', 'failed');
create sequence public.dataset_version_number_seq;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username = lower(username)),
  role public.app_role not null default 'user',
  created_at timestamptz not null default now()
);

create table public.dataset_versions (
  id uuid primary key default gen_random_uuid(),
  version_number bigint not null unique default nextval('public.dataset_version_number_seq'),
  filename text not null,
  storage_path text not null unique,
  row_count integer not null check (row_count > 0),
  checksum_sha256 text not null check (length(checksum_sha256) = 64),
  status public.dataset_status not null default 'processing',
  is_active boolean not null default false,
  uploaded_by uuid not null references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  published_at timestamptz,
  error_message text
);

create unique index dataset_versions_one_active on public.dataset_versions (is_active) where is_active;

create table public.revenue_records (
  id bigint generated always as identity primary key,
  version_id uuid not null references public.dataset_versions(id) on delete cascade,
  row_number integer not null,
  project text not null,
  revenue_month date,
  work_order numeric(20,4) not null default 0,
  revenue numeric(20,4) not null default 0,
  deductible numeric(20,4) not null default 0,
  invoiced numeric(20,4) not null default 0,
  invoice_date date,
  invoice_no text,
  due_date date,
  collected numeric(20,4) not null default 0,
  collected_date date,
  days numeric(12,2),
  penalties numeric(20,4) not null default 0,
  net_revenue numeric(20,4) not null default 0,
  unique (version_id, row_number)
);

create index revenue_records_version_idx on public.revenue_records(version_id);
create index revenue_records_project_idx on public.revenue_records(version_id, project);
create index revenue_records_revenue_month_idx on public.revenue_records(version_id, revenue_month);
create index revenue_records_invoice_date_idx on public.revenue_records(version_id, invoice_date);
create index revenue_records_collected_date_idx on public.revenue_records(version_id, collected_date);

create table public.dashboard_state (
  id smallint primary key default 1 check (id = 1),
  active_version_id uuid references public.dataset_versions(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
insert into public.dashboard_state(id) values (1) on conflict do nothing;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, username, role)
  values (new.id, lower(split_part(new.email, '@', 1)), 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.create_dataset_version(p_filename text, p_row_count integer, p_checksum text)
returns table(version_id uuid, version_number bigint, storage_path text)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
  v_number bigint := nextval('public.dataset_version_number_seq');
  v_path text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_row_count < 1 then raise exception 'The workbook contains no revenue records'; end if;
  v_path := 'v' || lpad(v_number::text, 6, '0') || '/' || regexp_replace(p_filename, '[^A-Za-z0-9._-]+', '_', 'g');
  insert into public.dataset_versions(id, version_number, filename, storage_path, row_count, checksum_sha256, uploaded_by)
  values (v_id, v_number, p_filename, v_path, p_row_count, p_checksum, auth.uid());
  return query select v_id, v_number, v_path;
end;
$$;

create or replace function public.publish_dataset_version(p_version_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_expected integer; v_actual integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform 1 from public.dashboard_state where id = 1 for update;
  select row_count into v_expected from public.dataset_versions where id = p_version_id and uploaded_by = auth.uid() and status = 'processing' for update;
  if v_expected is null then raise exception 'Dataset version cannot be published'; end if;
  select count(*) into v_actual from public.revenue_records where version_id = p_version_id;
  if v_actual <> v_expected then raise exception 'Expected % rows but received %', v_expected, v_actual; end if;
  update public.dataset_versions set is_active = false where is_active;
  update public.dataset_versions set status = 'published', is_active = true, published_at = now() where id = p_version_id;
  update public.dashboard_state set active_version_id = p_version_id, updated_at = now(), updated_by = auth.uid() where id = 1;
end;
$$;

create or replace function public.fail_dataset_version(p_version_id uuid, p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.dataset_versions set status = 'failed', error_message = left(p_error, 1000)
  where id = p_version_id and uploaded_by = auth.uid() and status = 'processing';
end;
$$;

create or replace function public.activate_dataset_version(p_version_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator role required'; end if;
  if not exists(select 1 from public.dataset_versions where id = p_version_id and status = 'published') then
    raise exception 'Only a published version can be activated';
  end if;
  update public.dataset_versions set is_active = false where is_active;
  update public.dataset_versions set is_active = true where id = p_version_id;
  update public.dashboard_state set active_version_id = p_version_id, updated_at = now(), updated_by = auth.uid() where id = 1;
end;
$$;

alter table public.profiles enable row level security;
alter table public.dataset_versions enable row level security;
alter table public.revenue_records enable row level security;
alter table public.dashboard_state enable row level security;

create policy profiles_read_self on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy versions_read on public.dataset_versions for select to authenticated using (true);
create policy versions_insert on public.dataset_versions for insert to authenticated with check (uploaded_by = auth.uid());
create policy records_read on public.revenue_records for select to authenticated using (true);
create policy records_insert on public.revenue_records for insert to authenticated
  with check (exists(select 1 from public.dataset_versions v where v.id = version_id and v.uploaded_by = auth.uid() and v.status = 'processing'));
create policy state_read on public.dashboard_state for select to authenticated using (true);

grant usage on schema public to authenticated;
grant select on public.profiles, public.dataset_versions, public.revenue_records, public.dashboard_state to authenticated;
grant insert on public.dataset_versions, public.revenue_records to authenticated;
grant usage, select on sequence public.dataset_version_number_seq to authenticated;
grant execute on function public.create_dataset_version(text, integer, text) to authenticated;
grant execute on function public.publish_dataset_version(uuid) to authenticated;
grant execute on function public.fail_dataset_version(uuid, text) to authenticated;
grant execute on function public.activate_dataset_version(uuid) to authenticated;

insert into storage.buckets(id, name, public) values ('revenue-workbooks', 'revenue-workbooks', false)
on conflict (id) do update set public = false;

create policy workbook_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'revenue-workbooks');
create policy workbook_read_admin on storage.objects for select to authenticated
  using (bucket_id = 'revenue-workbooks' and public.is_admin());
