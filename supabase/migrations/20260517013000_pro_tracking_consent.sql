begin;

alter table public.pro_tracking_requests
  add column if not exists consent_contact boolean not null default false;

comment on column public.pro_tracking_requests.consent_contact
  is 'Explicit contact consent captured from the request form.';

drop policy if exists "Public insert pro tracking requests" on public.pro_tracking_requests;

create policy "Public insert pro tracking requests"
on public.pro_tracking_requests
for insert
to anon, authenticated
with check (
  char_length(player_tag) between 3 and 16
  and (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  and (discord is null or char_length(discord) <= 80)
  and language in ('fr', 'en')
  and status = 'new'
  and consent_contact = true
);

grant insert (player_tag, email, discord, language, message, consent_contact)
  on table public.pro_tracking_requests to anon, authenticated;

commit;

