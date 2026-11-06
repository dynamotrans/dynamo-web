// =====================================================================================
// Esquemas de entrada de las acciones del servidor (lib/entradas/esquemas.ts), sacados de
// los tipos de TypeScript de cada acción. Una acción del servidor se puede llamar a mano
// con cualquier dato: el esquema comprueba la forma y el tamaño ANTES de tocar nada.
// Reglas comunes: identificadores (id, *_id, envio, reserva…) = uuid; textos con tope;
// números finitos. Uso: node tools/entradas/generar.mjs [--comprobar]
// Con --comprobar, falla si el fichero del repo no está al día (lo usa el CI).
// =====================================================================================
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const SALIDA = path.join(RAIZ, 'lib/entradas/esquemas.ts');
const cfg = ts.getParsedCommandLineOfConfigFile(path.join(RAIZ, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
const prog = ts.createProgram(cfg.fileNames, cfg.options);
const chk = prog.getTypeChecker();

// Nombres que son identificadores de la base de datos (uuid).
const ES_ID = /^(id|ids|envio|envioId|reserva|oferta|enlace|usuario|transportista|clienteId|sitioId|operador_id|cliente_id|transportista_id|sitio_id|almacen_id|sitio_entrega_id|tipo_id|incidencia_id|envio_id|parada_id)$/;
const TOPE = (n) => (/^(png|imagen|firma|trazos?|base64|svg)$/i.test(n) ? 3_000_000
  : /^(url|url_\w+|\w+_url|enlace_\w+)$/i.test(n) ? 4000
  : /^(anotaciones|descripcion|detalle|comentario|motivo|nota|notas|texto|mensaje|reservas|condiciones)/i.test(n) ? 5000 : 1000);

function esquema(t, nombre, prof = 0) {
  if (prof > 6) return 'z.unknown()';
  const f = t.flags;
  if (f & ts.TypeFlags.Any || f & ts.TypeFlags.Unknown) return 'z.unknown()';
  if (f & ts.TypeFlags.Never) return 'z.never()';
  if (f & ts.TypeFlags.Null) return 'z.null()';
  if (f & ts.TypeFlags.Undefined || f & ts.TypeFlags.Void) return 'z.undefined()';
  if (f & ts.TypeFlags.StringLiteral) return `z.literal(${JSON.stringify(t.value)})`;
  if (f & ts.TypeFlags.NumberLiteral) return `z.literal(${t.value})`;
  if (f & ts.TypeFlags.BooleanLiteral) return `z.literal(${chk.typeToString(t)})`;
  // Un id vacío ('') es «sin elegir»: lo deja pasar para que la acción dé su propio aviso.
  if (f & ts.TypeFlags.String) return ES_ID.test(nombre) ? "z.string().uuid().or(z.literal(''))" : `z.string().max(${TOPE(nombre)})`;
  // NaN se deja pasar: varias acciones ya avisan con un mensaje claro («no es un número»).
  if (f & ts.TypeFlags.Number) return 'z.number().or(z.nan())';
  if (f & ts.TypeFlags.TemplateLiteral) return 'z.string().max(100)';
  if (f & ts.TypeFlags.Boolean) return 'z.boolean()';
  if (t.isUnion()) {
    const tipos = t.types;
    // true | false = boolean
    if (tipos.every((x) => x.flags & ts.TypeFlags.BooleanLiteral)) return 'z.boolean()';
    const lits = tipos.filter((x) => x.flags & ts.TypeFlags.StringLiteral);
    const resto = tipos.filter((x) => !(x.flags & ts.TypeFlags.StringLiteral));
    const partes = [];
    if (lits.length) partes.push(lits.length === 1 ? `z.literal(${JSON.stringify(lits[0].value)})` : `z.enum([${lits.map((x) => JSON.stringify(x.value)).join(', ')}])`);
    let nulo = false, opcional = false, bool = 0;
    for (const x of resto) {
      if (x.flags & ts.TypeFlags.Null) nulo = true;
      else if (x.flags & ts.TypeFlags.Undefined) opcional = true;
      else if (x.flags & ts.TypeFlags.BooleanLiteral) bool++;
      else partes.push(esquema(x, nombre, prof + 1));
    }
    if (bool === 2) partes.push('z.boolean()'); else if (bool === 1) partes.push('z.boolean()');
    let s = partes.length === 1 ? partes[0] : `z.union([${partes.join(', ')}])`;
    if (nulo) s += '.nullable()';
    if (opcional) s += '.optional()';
    return s;
  }
  const txt = chk.typeToString(t);
  if (txt === 'FormData') return 'z.instanceof(FormData)';
  if (txt === 'Date') return 'z.date()';
  if (chk.isArrayType(t)) {
    const el = chk.getTypeArguments(t)[0];
    return `z.array(${esquema(el, nombre.replace(/s$/, ''), prof + 1)}).max(10000)`;
  }
  if (chk.isTupleType(t)) return `z.tuple([${chk.getTypeArguments(t).map((x) => esquema(x, nombre, prof + 1)).join(', ')}])`;
  if (f & ts.TypeFlags.Object || t.isIntersection()) {
    const idx = chk.getIndexInfosOfType(t);
    if (idx.length) return `z.record(z.string().max(200), ${esquema(idx[0].type, nombre, prof + 1)})`;
    const props = chk.getPropertiesOfType(t);
    if (!props.length) return 'z.object({})';
    const campos = props.map((p) => {
      const decl = p.valueDeclaration ?? p.declarations?.[0];
      const pt = chk.getTypeOfSymbolAtLocation(p, decl);
      let s = esquema(pt, p.name, prof + 1);
      if (p.flags & ts.SymbolFlags.Optional && !s.endsWith('.optional()')) s += '.optional()';
      return `${/^[A-Za-z_$][\w$]*$/.test(p.name) ? p.name : JSON.stringify(p.name)}: ${s}`;
    });
    // Campos de más se ignoran (cada acción coge solo los suyos); los que están, con su forma.
    return `z.object({ ${campos.join(', ')} })`;
  }
  return 'z.unknown()';
}

const fuera = [];
const archivos = prog.getSourceFiles().filter((sf) => !sf.isDeclarationFile && sf.fileName.startsWith(RAIZ + '/') && !sf.fileName.includes('/node_modules/')
  && /^\s*['"]use server['"]/.test(sf.text));
const entradas = [];
const inserciones = new Map();
for (const sf of archivos) {
  const rel = path.relative(RAIZ, sf.fileName).replace(/\.ts$/, '');
  ts.forEachChild(sf, (n) => {
    if (!ts.isFunctionDeclaration(n) || !n.name || !n.body) return;
    if (!n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return;
    const clave = `${rel}#${n.name.text}`;
    const params = n.parameters.map((p) => {
      const t = chk.getTypeAtLocation(p);
      let s = esquema(t, p.name.getText(sf));
      if ((p.questionToken || p.initializer) && !s.endsWith('.optional()')) s += '.optional()';
      return s;
    });
    entradas.push(`  ${JSON.stringify(clave)}: z.tuple([${params.join(', ')}]),`);
    // La primera línea de cada acción comprueba su entrada.
    const primera = n.body.statements[0];
    const ya = primera && primera.getText(sf).startsWith('comprobarEntrada(');
    if (!ya) {
      const nombres = n.parameters.map((p) => p.name.getText(sf)).join(', ');
      const ins = inserciones.get(sf.fileName) ?? [];
      ins.push({ pos: n.body.getStart(sf) + 1, txt: `\n  comprobarEntrada(${JSON.stringify(clave)}, [${nombres}]);` });
      inserciones.set(sf.fileName, ins);
    }
  });
}
const out = `// GENERADO por tools/entradas/generar.mjs desde los tipos de las acciones — NO EDITAR A MANO.
// Forma y tamaño de lo que puede recibir cada acción del servidor (ver lib/entradas/comprobar.ts).
import { z } from 'zod';

export const ESQUEMAS = {
${entradas.sort().join('\n')}
} as const;
`;
const comprobar = process.argv.includes('--comprobar');
if (comprobar) {
  const actual = fs.existsSync(SALIDA) ? fs.readFileSync(SALIDA, 'utf8') : '';
  if (actual !== out || inserciones.size) {
    console.error('lib/entradas/esquemas.ts no está al día (o falta comprobarEntrada en alguna acción): node tools/entradas/generar.mjs');
    for (const [f, ins] of inserciones) console.error('  sin comprobar:', path.relative(RAIZ, f), ins.length);
    process.exit(1);
  }
  console.log(`esquemas de entrada al día (${entradas.length} acciones)`);
} else {
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, out);
  for (const [f, ins] of inserciones) {
    let s = fs.readFileSync(f, 'utf8');
    for (const { pos, txt } of ins.sort((a, b) => b.pos - a.pos)) s = s.slice(0, pos) + txt + s.slice(pos);
    if (!/from '@\/lib\/entradas\/comprobar'/.test(s)) {
      const L = s.split('\n'); let last = -1;
      for (let i = 0; i < L.length; i++) if (L[i].startsWith('import ')) { let j = i; if (L[i].includes('{') && !L[i].includes('}')) while (j < L.length && !L[j].includes('} from')) j++; last = j; i = j; }
      L.splice(last + 1, 0, "import { comprobarEntrada } from '@/lib/entradas/comprobar';");
      s = L.join('\n');
    }
    fs.writeFileSync(f, s);
  }
  console.log(`${entradas.length} acciones; comprobación añadida en ${[...inserciones.values()].reduce((a, b) => a + b.length, 0)}`);
}
