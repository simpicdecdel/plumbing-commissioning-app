begin;

do $migration$
declare
  function_signature regprocedure;
  function_definition text;
begin
  foreach function_signature in array array[
    'public.save_commissioning_record(uuid,uuid,jsonb,bigint)'::regprocedure,
    'public.soft_delete_commissioning_record(uuid,uuid,bigint)'::regprocedure,
    'public.restore_commissioning_record(uuid,uuid,bigint)'::regprocedure
  ] loop
    function_definition := pg_get_functiondef(function_signature);

    if position('PT409' in function_definition) > 0 then
      continue;
    end if;

    if position('40001' in function_definition) = 0 then
      raise exception 'Expected revision-conflict SQLSTATE was not found in %', function_signature;
    end if;

    execute replace(function_definition, '''40001''', '''PT409''');
  end loop;
end
$migration$;

commit;
