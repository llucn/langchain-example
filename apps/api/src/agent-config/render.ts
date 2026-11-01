import { parse } from 'yaml';

export type EnvValues = Record<string, string | number | boolean>;

const TOKEN = /\$\$\{|\$\{([^}]*)\}/g;
const REF = /^\s*env\.([A-Za-z_][A-Za-z0-9_]*)\s*(?::(.*))?$/s;

/** Parses YAML text; duplicate keys are an error. */
export function parseYaml(text: string): unknown {
  return parse(text, { uniqueKeys: true });
}

/** Typed value of a placeholder default (`${env.N:4096}` -> 4096 when it is the whole value). */
function typedDefault(text: string): unknown {
  try {
    const v = parse(text);
    return v !== null && typeof v === 'object' ? text : (v ?? text);
  } catch {
    return text;
  }
}

/**
 * Resolves `${env.NAME}` / `${env.NAME:default}` in one string. A string that is exactly one
 * placeholder takes the typed value; otherwise values are interpolated as text. `$${` is a literal
 * `${`. Problems are pushed to `problems` (with `where` as prefix) and leave the text unchanged.
 */
export function resolveString(
  value: string,
  env: EnvValues,
  where: string,
  problems: string[],
  path = '',
): unknown {
  if (!value.includes('${')) return value;
  const at = path ? ` (at ${path})` : '';

  const lookup = (inner: string): { found: boolean; value?: unknown; text?: string } | null => {
    const m = REF.exec(inner);
    if (!m) {
      problems.push(
        `${where}: invalid placeholder \${${inner}}${at} (expected \${env.NAME} or \${env.NAME:default})`,
      );
      return null;
    }
    const [, name, dflt] = m;
    if (Object.hasOwn(env, name)) return { found: true, value: env[name], text: String(env[name]) };
    if (dflt !== undefined) return { found: false, value: typedDefault(dflt), text: dflt };
    problems.push(`${where}: undefined variable env.${name}${at}`);
    return null;
  };

  const whole = /^\$\{([^}]*)\}$/.exec(value);
  if (whole) {
    const r = lookup(whole[1]);
    return r ? r.value : value;
  }
  return value.replace(TOKEN, (match, inner?: string) => {
    if (match === '$${') return '${';
    const r = lookup(inner as string);
    return r ? (r.text as string) : match;
  });
}

/** Resolves placeholders in every string value of a parsed tree (keys are left alone). */
export function resolveTree(
  node: unknown,
  env: EnvValues,
  where: string,
  problems: string[],
  path = '',
): unknown {
  if (typeof node === 'string') return resolveString(node, env, where, problems, path);
  if (Array.isArray(node)) {
    return node.map((v, i) => resolveTree(v, env, where, problems, `${path}[${i}]`));
  }
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [
        k,
        resolveTree(v, env, where, problems, path ? `${path}.${k}` : k),
      ]),
    );
  }
  return node;
}
