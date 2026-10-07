create unique index if not exists folders_mailbox_system_name_uidx on public.folders(mailbox_id, system_name);
create unique index if not exists push_subscriptions_endpoint_uidx on public.push_subscriptions(endpoint);

create table if not exists public.mailbox_credentials (
  mailbox_id uuid primary key references public.mailboxes(id) on delete cascade,
  hostinger_mailbox_id text,
  email text not null,
  password_ciphertext text not null,
  password_iv text not null,
  password_auth_tag text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mailbox_credentials enable row level security;
revoke all on public.mailbox_credentials from anon, authenticated;
grant select, insert, update, delete on public.mailbox_credentials to service_role;
