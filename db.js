import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config();

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in .env");
  process.exit(1);
}

export const db = createClient({
  url,
  authToken,
});

// Test connection on startup
export async function testConnection() {
  try {
    const result = await db.execute("SELECT 1");
    console.log("✅ Turso database connected successfully");
    return true;
  } catch (error) {
    console.error("❌ Failed to connect to Turso:", error.message);
    return false;
  }
}
