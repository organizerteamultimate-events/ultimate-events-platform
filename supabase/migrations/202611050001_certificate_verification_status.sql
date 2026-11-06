begin;

drop function if exists public.verify_certificate(text);

create function public.verify_certificate(p_certificate_number text)
returns table (
  certificate_number text,
  certificate_status text,
  participant_name text,
  event_name text,
  issued_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.certificate_number,
    case when c.revoked_at is null then 'valid' else 'revoked' end,
    case when c.revoked_at is null then c.recipient_name else null end,
    c.event_name,
    c.issued_at
  from public.certificates c
  where upper(c.certificate_number) = upper(btrim(p_certificate_number))
    or c.verification_code::text = lower(btrim(p_certificate_number))
  limit 1;
$$;

revoke all on function public.verify_certificate(text) from public, anon, authenticated;
grant execute on function public.verify_certificate(text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
