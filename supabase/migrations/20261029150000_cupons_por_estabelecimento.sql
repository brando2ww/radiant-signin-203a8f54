-- O código promocional é único dentro da loja; lojas diferentes podem repetir a campanha.
begin;
alter table public.delivery_coupons drop constraint if exists delivery_coupons_code_key;
create unique index if not exists delivery_coupons_owner_code_key
  on public.delivery_coupons (user_id, code);
notify pgrst, 'reload schema';
commit;
