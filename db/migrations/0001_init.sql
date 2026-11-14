-- Zero: initial schema.
-- Money is stored as integer minor units (kopecks, cents) next to a 3-letter currency code.
-- Ids of expenses are generated on the device, so an expense entered offline can never be saved twice.

-- People. A "real" person has an identity (below); without one it is a placeholder created by a friend ("Sasha without an account").
-- When a placeholder logs in through an invite link, the identity is attached to it; if that person already had an account,
-- the placeholder is merged: merged_into points at the account and every reference is moved over by the application.
create table people (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 60),
  avatar_seed text,
  created_by  uuid references people(id),
  merged_into uuid references people(id),
  created_at  timestamptz not null default now(),
  check (merged_into is null or merged_into <> id)
);

-- Ways to log in. Only Telegram for now; the table allows adding others without touching people.
create table identities (
  id               uuid primary key default gen_random_uuid(),
  person_id        uuid not null references people(id) on delete cascade,
  provider         text not null check (provider in ('telegram')),
  provider_user_id text not null,
  username         text,
  created_at       timestamptz not null default now(),
  unique (provider, provider_user_id)
);
create index identities_person_idx on identities (person_id);

-- Browser sessions. Only a hash of the cookie token is stored, so a leaked database cannot be used to log in.
create table sessions (
  token_hash   text primary key,
  person_id    uuid not null references people(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now(),
  user_agent   text
);
create index sessions_person_idx on sessions (person_id);

-- Each person's own friends list, with the order they dragged it into.
create table friend_links (
  owner_id   uuid not null references people(id) on delete cascade,
  friend_id  uuid not null references people(id) on delete cascade,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (owner_id, friend_id),
  check (owner_id <> friend_id)
);

-- Invite links and QR codes. With ghost_id set, accepting the link claims that placeholder person.
create table invites (
  code       text primary key,
  inviter_id uuid not null references people(id) on delete cascade,
  ghost_id   uuid references people(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_by    uuid references people(id),
  used_at    timestamptz
);

-- Optional label on an expense ("Georgia"). Groups may be built on top of this later.
create table tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 40),
  created_by uuid not null references people(id),
  created_at timestamptz not null default now()
);
create unique index tags_creator_name_idx on tags (created_by, lower(name));

create table expenses (
  id             uuid primary key,
  kind           text not null default 'expense' check (kind in ('expense', 'repayment')),
  title          text not null default '',
  amount_minor   bigint not null check (amount_minor > 0),
  currency       char(3) not null check (currency ~ '^[A-Z]{3}$'),
  spent_on       date not null,
  tag_id         uuid references tags(id),
  created_by     uuid not null references people(id),
  source         text not null default 'manual' check (source in ('manual', 'voice', 'receipt')),
  voice_text     text,
  needs_approval boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index expenses_created_by_idx on expenses (created_by);
create index expenses_spent_on_idx on expenses (spent_on desc);

-- Who paid and who owes. Any split (equal, exact amounts, receipt items) is reduced to amounts per person.
create table expense_payers (
  expense_id   uuid not null references expenses(id) on delete cascade,
  person_id    uuid not null references people(id),
  amount_minor bigint not null check (amount_minor >= 0),
  primary key (expense_id, person_id)
);
create index expense_payers_person_idx on expense_payers (person_id);

create table expense_shares (
  expense_id   uuid not null references expenses(id) on delete cascade,
  person_id    uuid not null references people(id),
  amount_minor bigint not null check (amount_minor >= 0),
  primary key (expense_id, person_id)
);
create index expense_shares_person_idx on expense_shares (person_id);

-- Payers and shares must each add up to the expense amount. Checked when the transaction commits,
-- so rows can be inserted one by one. This keeps balances correct whatever the application does.
create function enforce_expense_sums() returns trigger language plpgsql as $$
declare
  eid uuid; amt bigint; paid bigint; owed bigint;
begin
  if tg_table_name = 'expenses' then eid := new.id;
  elsif tg_op = 'DELETE' then eid := old.expense_id;
  else eid := new.expense_id;
  end if;
  select amount_minor into amt from expenses where id = eid;
  if amt is null then return null; end if; -- the expense itself was removed in this transaction
  select coalesce(sum(amount_minor), 0) into paid from expense_payers where expense_id = eid;
  select coalesce(sum(amount_minor), 0) into owed from expense_shares where expense_id = eid;
  if paid <> amt or owed <> amt then
    raise exception 'expense % does not add up: amount %, payers %, shares %', eid, amt, paid, owed using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger expenses_sums after insert or update on expenses
  deferrable initially deferred for each row execute function enforce_expense_sums();
create constraint trigger expense_payers_sums after insert or update or delete on expense_payers
  deferrable initially deferred for each row execute function enforce_expense_sums();
create constraint trigger expense_shares_sums after insert or update or delete on expense_shares
  deferrable initially deferred for each row execute function enforce_expense_sums();

create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger expenses_touch before update on expenses for each row execute function touch_updated_at();

-- History of every change: who, when, what it was and what it became.
create table expense_events (
  id         bigint generated always as identity primary key,
  expense_id uuid not null references expenses(id) on delete cascade,
  actor_id   uuid not null references people(id),
  action     text not null check (action in ('created', 'updated', 'deleted', 'restored')),
  before     jsonb,
  after      jsonb,
  at         timestamptz not null default now()
);
create index expense_events_expense_idx on expense_events (expense_id, at);

-- Daily rates, each currency against the US dollar. A netting stores the rate it was done at, so later updates never change it.
create table exchange_rates (
  day        date not null,
  currency   char(3) not null check (currency ~ '^[A-Z]{3}$'),
  per_usd    numeric(24, 10) not null check (per_usd > 0),
  fetched_at timestamptz not null default now(),
  primary key (day, currency)
);

-- Converting a debt between two people from one currency into another at a fixed rate.
create table nettings (
  id            uuid primary key default gen_random_uuid(),
  debtor_id     uuid not null references people(id),
  creditor_id   uuid not null references people(id),
  from_currency char(3) not null check (from_currency ~ '^[A-Z]{3}$'),
  from_minor    bigint not null check (from_minor > 0),
  to_currency   char(3) not null check (to_currency ~ '^[A-Z]{3}$'),
  to_minor      bigint not null check (to_minor > 0),
  rate          numeric(24, 10) not null check (rate > 0),
  made_on       date not null,
  created_by    uuid not null references people(id),
  created_at    timestamptz not null default now(),
  check (debtor_id <> creditor_id),
  check (from_currency <> to_currency)
);
create index nettings_debtor_idx on nettings (debtor_id);
create index nettings_creditor_idx on nettings (creditor_id);
