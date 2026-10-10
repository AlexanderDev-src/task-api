export type Config = {
  databaseUrl: string;
  port: number;
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const DEFAULT_PORT = 8080;
const MAX_PORT = 65_535;

function parsePort(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_PORT;
  const port = Number(raw);
  if (!/^\+?\d+$/.test(raw) || port > MAX_PORT) {
    throw new ConfigError(`PORT must be a number, got ${JSON.stringify(raw)}`);
  }
  return port;
}

/** The only place that reads the environment. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const databaseUrl = env.DATABASE_URL;
  if (databaseUrl === undefined) {
    throw new ConfigError("DATABASE_URL is not set");
  }
  return { databaseUrl, port: parsePort(env.PORT) };
}
