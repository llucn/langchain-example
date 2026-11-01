/** The config is not usable; `problems` lists every violation found. */
export class AgentConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid agent config:\n- ${problems.join('\n- ')}`);
    this.name = 'AgentConfigError';
  }
}

export type ConfigSourceErrorKind =
  /** Network error, timeout, 5xx, rate limit: may work later; a snapshot may stand in. */
  | 'unavailable'
  /** 401/403: wrong or insufficient token; a snapshot may stand in. */
  | 'denied'
  /** Repository, ref or file does not exist (or is not visible): a configuration mistake. */
  | 'not_found';

export class ConfigSourceError extends Error {
  constructor(
    readonly kind: ConfigSourceErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ConfigSourceError';
  }
}
