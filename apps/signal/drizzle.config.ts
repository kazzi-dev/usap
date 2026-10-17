import { defineConfig } from "drizzle-kit";

// Used by `npm run db:generate`: compares src/db/schema.ts with the existing
// migrations and writes a new SQL migration file for any changes.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
