# ACES MSD Supabase setup

The web dashboard uses Supabase Auth, Postgres and private Storage. The frontend uses only the publishable key; never add a `service_role` key to this repository or to browser code.

## 1. Create the database objects

Open the Supabase project, select **SQL Editor**, create a new query, paste the complete contents of `supabase/migrations/001_versioned_revenue_backend.sql`, and run it once.

## 2. Create dashboard users

Open **Authentication → Users → Add user** and create each dashboard account with an approved company email. Use approved passwords privately in Supabase. Do not save passwords in GitHub.

For the current administrator:

- `bannaga.altieb@aces-co.com`

Then run:

```sql
insert into public.profiles (id, username, role)
select id, 'bannaga', 'admin'::public.app_role
from auth.users
where lower(email) = 'bannaga.altieb@aces-co.com'
on conflict (id) do update
set username = excluded.username,
    role = excluded.role;
```

The login page continues to accept the short username `Bannaga`.

## 3. Deploy

The GitHub Pages workflow supplies the project URL and publishable key at build time. Merge and deploy only after steps 1 and 2 are complete.

## How synchronization works

1. An authenticated user selects an Excel workbook in **Update Data**.
2. The browser validates and parses the workbook without changing the existing dashboard calculations.
3. Supabase creates the next sequential version number.
4. The original workbook is saved in the private `revenue-workbooks` bucket.
5. Parsed rows are saved against that version.
6. The version becomes active only after the expected row count is verified.
7. Open dashboards check for a new active version every 10 seconds and reload automatically.

Failed or partial uploads never replace the active version. Admins can activate an older published version through the `activate_dataset_version` RPC when a rollback interface is added.
