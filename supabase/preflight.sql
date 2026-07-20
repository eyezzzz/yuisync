select
  current_database() as database_name,
  current_setting('server_version') as postgres_version,
  now() as checked_at,
  (select count(*)::int from pg_catalog.pg_tables where schemaname = 'public') as public_tables;
