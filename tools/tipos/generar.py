#!/usr/bin/env python3
# =====================================================================================
# Tipos de TypeScript de la base de datos (lib/supabase/tipos.ts), en el mismo formato que
# «supabase gen types typescript»: tablas (Row/Insert/Update/Relationships), vistas,
# funciones (Args/Returns) y tipos enumerados del esquema public.
# Se genera desde la base de datos de las pruebas (todas las migraciones aplicadas), así
# que no hace falta conectarse a Supabase. Uso:
#     generar.py "<orden de shell con psql -X -A -t que lee la consulta por la entrada>" > lib/supabase/tipos.ts
# probar.sh lo lanza con GENERAR_TIPOS=<fichero>; el CI comprueba que el del repo está al día.
# =====================================================================================
import json, subprocess, sys

PSQL = sys.argv[1]
Q = r"""
with t as (
  select c.oid, c.relname, c.relkind from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p')
), cols as (
  select a.attrelid, json_agg(json_build_object(
           'n', a.attname, 't', format_type(a.atttypid, a.atttypmod), 'base', bt.typname, 'cat', bt.typtype,
           'arr', t0.typcategory = 'A', 'null', not a.attnotnull,
           'def', a.atthasdef or a.attidentity <> '', 'gen', a.attgenerated <> '') order by a.attnum) j
    from pg_attribute a
    join pg_type t0 on t0.oid = a.atttypid
    join pg_type bt on bt.oid = case when t0.typcategory = 'A' then t0.typelem else t0.oid end
   where a.attrelid in (select oid from t) and a.attnum > 0 and not a.attisdropped
   group by a.attrelid
), fks as (
  select con.conrelid, json_agg(json_build_object(
           'name', con.conname, 'cols', (select json_agg(att.attname order by k.o) from unnest(con.conkey) with ordinality k(n, o) join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.n),
           'ref', rc.relname,
           'refcols', (select json_agg(att.attname order by k.o) from unnest(con.confkey) with ordinality k(n, o) join pg_attribute att on att.attrelid = con.confrelid and att.attnum = k.n),
           'one', exists (select 1 from pg_index i where i.indrelid = con.conrelid and i.indisunique and i.indnkeyatts = cardinality(con.conkey)
                            and (i.indkey::int2[])[0:cardinality(con.conkey) - 1] @> con.conkey and con.conkey @> (i.indkey::int2[])[0:cardinality(con.conkey) - 1]))
           order by con.conname) j
    from pg_constraint con join pg_class rc on rc.oid = con.confrelid
   where con.contype = 'f' and rc.relnamespace = 'public'::regnamespace
   group by con.conrelid
), funcs as (
  select json_agg(json_build_object(
           'n', p.proname, 'set', p.proretset, 'ret', format_type(p.prorettype, null), 'rtype', rt.typname, 'rcat', rt.typtype, 'rrel', rt.typrelid,
           'rarr', rt.typcategory = 'A', 'relem', et.typname, 'ecat', et.typtype,
           'args', (select json_agg(json_build_object('n', x.n, 'mode', x.m, 'base', bt.typname, 'cat', bt.typtype, 'arr', ty.typcategory = 'A', 'def', x.o > p.pronargs - p.pronargdefaults) order by x.o)
                      from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[]), coalesce(p.proargmodes, array_fill('i'::"char", array[cardinality(p.proargtypes::oid[])])),
                                  coalesce(p.proargnames, array_fill(''::text, array[cardinality(coalesce(p.proallargtypes, p.proargtypes::oid[]))]))) with ordinality x(ty_oid, m, n, o)
                      join pg_type ty on ty.oid = x.ty_oid
                      join pg_type bt on bt.oid = case when ty.typcategory = 'A' then ty.typelem else ty.oid end))
           order by p.proname, p.oid) j
    from pg_proc p
    join pg_type rt on rt.oid = p.prorettype
    left join pg_type et on et.oid = rt.typelem and rt.typcategory = 'A'
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and rt.typname <> 'trigger'
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('service_role', p.oid, 'execute'))
), enums as (
  select json_object_agg(t.typname, (select json_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid) order by t.typname) j
    from pg_type t where t.typnamespace = 'public'::regnamespace and t.typtype = 'e'
)
select json_build_object(
  'rels', (select json_agg(json_build_object('oid', t.oid, 'n', t.relname, 'k', t.relkind, 'cols', cols.j, 'fks', coalesce(fks.j, '[]'::json)) order by t.relname)
             from t left join cols on cols.attrelid = t.oid left join fks on fks.conrelid = t.oid),
  'funcs', (select j from funcs), 'enums', (select j from enums))
"""
r = subprocess.run(['bash', '-c', PSQL], input=Q, capture_output=True, text=True)
if r.returncode: sys.exit(r.stderr)
D = json.loads(r.stdout)
ENUMS = D['enums'] or {}
RELS = {x['n']: x for x in D['rels']}
BY_OID = {x['oid']: x for x in D['rels']}

NUM = {'int2', 'int4', 'int8', 'float4', 'float8', 'numeric', 'oid'}
STR = {'text', 'varchar', 'bpchar', 'char', 'uuid', 'date', 'time', 'timetz', 'timestamp', 'timestamptz', 'inet', 'cidr', 'citext', 'bytea', 'interval', 'name', 'tsvector', 'regclass', 'regproc'}
def ts(base, cat, arr):
    if cat == 'e' and base in ENUMS: t = f'Database["public"]["Enums"]["{base}"]'
    elif cat == 'c' and base in RELS: t = f'Database["public"]["{"Tables" if RELS[base]["k"] in ("r", "p") else "Views"}"]["{base}"]["Row"]'
    elif base in NUM: t = 'number'
    elif base in STR: t = 'string'
    elif base == 'bool': t = 'boolean'
    elif base in ('json', 'jsonb'): t = 'Json'
    elif base == 'void': t = 'undefined'
    else: t = 'unknown'
    return f'{t}[]' if arr else t
def key(n): return n if n.isidentifier() else json.dumps(n)

o = ['// GENERADO por tools/tipos/generar.py desde las migraciones — NO EDITAR A MANO.',
     '// Mismo formato que «supabase gen types typescript». Se regenera con las pruebas de la',
     '// base de datos (tools/probar-migraciones/probar.sh) y el CI avisa si no está al día.',
     'export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]', '',
     'export type Database = {', '  public: {']

def rel_block(x, kind):
    cols = x['cols'] or []
    o.append(f'      {key(x["n"])}: {{')
    o.append('        Row: {')
    for c in cols:
        t = ts(c['base'], c['cat'], c['arr']); o.append(f'          {key(c["n"])}: {t}' + (' | null' if c['null'] else ''))
    o.append('        }')
    if kind == 'r':
        for part in ('Insert', 'Update'):
            o.append(f'        {part}: {{')
            for c in cols:
                t = ts(c['base'], c['cat'], c['arr'])
                if c['gen']: o.append(f'          {key(c["n"])}?: never'); continue
                opt = part == 'Update' or c['null'] or c['def']
                o.append(f'          {key(c["n"])}{"?" if opt else ""}: {t}' + (' | null' if c['null'] else ''))
            o.append('        }')
    o.append('        Relationships: [')
    for f in x['fks']:
        o.append('          {')
        o.append(f'            foreignKeyName: {json.dumps(f["name"])}')
        o.append(f'            columns: {json.dumps(f["cols"])}')
        o.append(f'            isOneToOne: {"true" if f["one"] else "false"}')
        o.append(f'            referencedRelation: {json.dumps(f["ref"])}')
        o.append(f'            referencedColumns: {json.dumps(f["refcols"])}')
        o.append('          },')
    o.append('        ]')
    o.append('      }')

o.append('    Tables: {')
for x in D['rels']:
    if x['k'] in ('r', 'p'): rel_block(x, 'r')
o.append('    }')
o.append('    Views: {')
for x in D['rels']:
    if x['k'] in ('v', 'm'): rel_block(x, 'v')
o.append('    }')

def ret_type(f):
    if f['rtype'] == 'record':     # RETURNS TABLE(...) / OUT
        outs = [a for a in (f['args'] or []) if a['mode'] in ('o', 'b', 't')]
        body = '{ ' + '; '.join(f'{key(a["n"])}: {ts(a["base"], a["cat"], a["arr"])}' for a in outs) + ' }'
    elif f['rcat'] == 'c' and f['rrel'] and f['rrel'] in BY_OID:
        body = f'Database["public"]["Tables"]["{BY_OID[f["rrel"]]["n"]}"]["Row"]' if BY_OID[f['rrel']]['k'] in ('r', 'p') else f'Database["public"]["Views"]["{BY_OID[f["rrel"]]["n"]}"]["Row"]'
    elif f['rarr']:
        body = ts(f['relem'], f['ecat'], True)
    else:
        body = ts(f['rtype'], f['rcat'], False)
    return f'{body}[]' if f['set'] else body

o.append('    Functions: {')
by = {}
for f in D['funcs'] or []: by.setdefault(f['n'], []).append(f)
for n in sorted(by):
    vers = []
    for f in by[n]:
        ins = [a for a in (f['args'] or []) if a['mode'] in ('i', 'b', 'v')]
        # Un argumento puede ir a null (en Postgres, null es un valor más; con valor por defecto,
        # además se puede omitir).
        args = 'Record<PropertyKey, never>' if not ins else '{ ' + '; '.join(f'{key(a["n"])}{"?" if a["def"] else ""}: {ts(a["base"], a["cat"], a["arr"])} | null' for a in ins) + ' }'
        vers.append(f'{{ Args: {args}; Returns: {ret_type(f)} }}')
    o.append(f'      {key(n)}: ' + ' | '.join(vers))
o.append('    }')
o.append('    Enums: {')
for n, vals in sorted(ENUMS.items()):
    o.append(f'      {key(n)}: ' + ' | '.join(json.dumps(v) for v in vals))
o.append('    }')
o.append('    CompositeTypes: {')
o.append('      [_ in never]: never')
o.append('    }')
o.append('  }')
o.append('}')
o.append('')
o.append('type T = Database["public"]')
o.append('export type Tabla<N extends keyof T["Tables"]> = T["Tables"][N]["Row"]')
o.append('export type Vista<N extends keyof T["Views"]> = T["Views"][N]["Row"]')
o.append('export type Enum<N extends keyof T["Enums"]> = T["Enums"][N]')
o.append('export type Funcion<N extends keyof T["Functions"]> = T["Functions"][N]["Returns"]')
o.append('export type TablaInsert<N extends keyof T["Tables"]> = T["Tables"][N]["Insert"]')
o.append('export type TablaUpdate<N extends keyof T["Tables"]> = T["Tables"][N]["Update"]')
print('\n'.join(o))
