-- CFEM por item para notas emitidas com incidencia mineral.
-- A migracao e idempotente: valores de CFEM ja informados manualmente sao preservados.

update public.invoices as invoice
set items = coalesce(
  (
    select jsonb_agg(
      case
        when item ? 'cfemBase'
          and item ? 'cfemRate'
          and item ? 'cfemValue'
        then item
        else item || jsonb_build_object(
          'cfemBase', greatest(
            coalesce(nullif(item ->> 'totalValue', '')::numeric, 0)
              - coalesce(nullif(item ->> 'icmsValue', '')::numeric, 0)
              - coalesce(nullif(item ->> 'pisValue', '')::numeric, 0)
              - coalesce(nullif(item ->> 'cofinsValue', '')::numeric, 0),
            0
          ),
          'cfemRate', 2,
          'cfemValue', round(
            greatest(
              coalesce(nullif(item ->> 'totalValue', '')::numeric, 0)
                - coalesce(nullif(item ->> 'icmsValue', '')::numeric, 0)
                - coalesce(nullif(item ->> 'pisValue', '')::numeric, 0)
                - coalesce(nullif(item ->> 'cofinsValue', '')::numeric, 0),
              0
            ) * 0.02,
            2
          )
        )
      end
      order by ordinal
    )
    from jsonb_array_elements(invoice.items) with ordinality as item_rows(item, ordinal)
  ),
  '[]'::jsonb
)
where invoice.invoice_type = 'issued'
  and split_part(trim(invoice.main_cfop), ' ', 1) in ('5101', '6101', '6122', '5122');

with cfem_totals as (
  select
    invoice.id,
    coalesce(sum(coalesce(nullif(item ->> 'cfemBase', '')::numeric, 0)), 0) as cfem_base,
    coalesce(sum(coalesce(nullif(item ->> 'cfemValue', '')::numeric, 0)), 0) as cfem_value
  from public.invoices as invoice
  cross join lateral jsonb_array_elements(invoice.items) as item_rows(item)
  where invoice.invoice_type = 'issued'
    and split_part(trim(invoice.main_cfop), ' ', 1) in ('5101', '6101', '6122', '5122')
  group by invoice.id
)
update public.invoices as invoice
set cfem_base = totals.cfem_base,
    cfem_rate = case when totals.cfem_base > 0 then round(totals.cfem_value / totals.cfem_base * 100, 4) else 0 end,
    cfem_value = totals.cfem_value
from cfem_totals as totals
where invoice.id = totals.id;

update public.invoices as invoice
set items = coalesce(
      (
        select jsonb_agg(
          (item - 'cfemBase' - 'cfemRate' - 'cfemValue') ||
            jsonb_build_object('cfemBase', 0, 'cfemRate', 0, 'cfemValue', 0)
          order by ordinal
        )
        from jsonb_array_elements(invoice.items) with ordinality as item_rows(item, ordinal)
      ),
      '[]'::jsonb
    ),
    cfem_base = 0,
    cfem_rate = 0,
    cfem_value = 0
where invoice.invoice_type = 'issued'
  and split_part(trim(invoice.main_cfop), ' ', 1) not in ('5101', '6101', '6122', '5122');
