import { db, testConnection } from "../db.js";

const schema = `
CREATE TABLE IF NOT EXISTS escalations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_id TEXT NOT NULL UNIQUE,
  merchant_id TEXT NOT NULL,
  kam_name TEXT,
  channel TEXT,
  zone TEXT,
  concern_hub TEXT NOT NULL,
  issue_status TEXT DEFAULT 'Pending',
  issue_category TEXT NOT NULL,
  issue_sub_category TEXT NOT NULL,
  issue_details TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ref_id ON escalations(ref_id);
CREATE INDEX IF NOT EXISTS idx_merchant_id ON escalations(merchant_id);
CREATE INDEX IF NOT EXISTS idx_concern_hub ON escalations(concern_hub);
CREATE INDEX IF NOT EXISTS idx_created_at ON escalations(created_at);
`;

async function initDatabase() {
  const connected = await testConnection();
  if (!connected) process.exit(1);

  try {
    await db.execute(schema);
    console.log("✅ Database schema initialized successfully");
    console.log("   - Table 'escalations' created");
    console.log("   - Indexes created on ref_id, merchant_id, concern_hub, created_at");
  } catch (error) {
    console.error("❌ Failed to initialize schema:", error.message);
    process.exit(1);
  }
}

initDatabase();
