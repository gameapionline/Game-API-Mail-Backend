create schema if not exists private;
create table if not exists private.mailbox_credentials (
  mailbox_id uuid primary key references public.mailboxes(id) on delete cascade,
  hostinger_mailbox_id text,
  email text not null,
  password_ciphertext text not null,
  password_iv text not null,
  password_auth_tag text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on schema private from anon, authenticated;
revoke all on table private.mailbox_credentials from anon, authenticated;
grant usage on schema private to service_role;
grant select,insert,update,delete on table private.mailbox_credentials to service_role;
create index if not exists mailbox_credentials_hostinger_id_idx on private.mailbox_credentials(hostinger_mailbox_id);
