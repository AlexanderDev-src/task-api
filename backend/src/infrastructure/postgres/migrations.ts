import type { SQL } from "bun";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

/** "0001_create_task.sql" -> version 1, description "create task". */
function describeMigration(fileName: string) {
  const [prefix, ...rest] = fileName.replace(/\.sql$/, "").split("_");
  return { version: BigInt(prefix), description: rest.join(" ") };
}

/** Applies the `.sql` files in `directory` that this database has not seen.

    The bookkeeping table is the one `sqlx::migrate!` created for the Rust
    version, with the same columns and the same SHA-384 checksum. A database
    the Rust server set up is therefore seen as already migrated, and one set
    up here still starts under the Rust server. */
export async function runMigrations(sql: SQL, directory: string): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS _sqlx_migrations (
      version BIGINT PRIMARY KEY,
      description TEXT NOT NULL,
      installed_on TIMESTAMPTZ NOT NULL DEFAULT now(),
      success BOOLEAN NOT NULL,
      checksum BYTEA NOT NULL,
      execution_time BIGINT NOT NULL
    )`;

  const rows: { version: string }[] =
    await sql`SELECT version FROM _sqlx_migrations`;
  const applied = new Set(rows.map((row) => BigInt(row.version)));

  const fileNames = (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const fileName of fileNames) {
    const { version, description } = describeMigration(fileName);
    if (applied.has(version)) continue;

    const source = await Bun.file(join(directory, fileName)).text();
    const checksum = new Bun.CryptoHasher("sha384").update(source).digest();

    await sql.begin(async (transaction) => {
      const startedAt = Bun.nanoseconds();
      await transaction.unsafe(source);
      const elapsed = BigInt(Bun.nanoseconds() - startedAt);
      await transaction`
        INSERT INTO _sqlx_migrations
          (version, description, success, checksum, execution_time)
        VALUES (${version}, ${description}, TRUE, ${checksum}, ${elapsed})`;
    });
  }
}
