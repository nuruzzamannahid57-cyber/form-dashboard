import express from "express";
import { createClient } from "@libsql/client";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Serve static files (index.html, logo.png, etc.) directly from disk,
// so editing index.html actually changes what's served — no more
// out-of-sync copy baked into this file.
app.use(express.static(__dirname));

let db;

// Bangladesh Standard Time is UTC+6, no daylight saving.
// SQLite's CURRENT_TIMESTAMP is always UTC, so we compute and
// store the BST wall-clock time explicitly instead of relying on it.
function getBSTTimestamp() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).formatToParts(new Date()).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function getBSTYear() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka', year: 'numeric'
  }).format(new Date());
}

async function initDb() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error("Missing env vars");
    return false;
  }

  try {
    db = createClient({ url, authToken });
    await db.execute("SELECT 1");
    console.log("✅ DB connected");
    return true;
  } catch (err) {
    console.error("❌ DB connect failed:", err.message);
    return false;
  }
}

async function createTable() {
  if (!db) return false;
  try {
    await db.execute(`
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ Table ready");
    return true;
  } catch (err) {
    console.error("❌ Table error:", err.message);
    return false;
  }
}

app.get("/api/health", async (req, res) => {
  try {
    if (!db) return res.json({ status: "error", message: "No DB" });
    await db.execute("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (e) {
    res.json({ status: "error", message: e.message });
  }
});

app.get("/api/test-db", async (req, res) => {
  try {
    if (!db) return res.json({ ok: false, error: "No DB connection" });

    // Try to create table
    await createTable();

    // Try a test insert
    const testRef = "TEST-" + Date.now();
    await db.execute({
      sql: `INSERT INTO escalations (ref_id, merchant_id, concern_hub, issue_category, issue_sub_category, issue_details) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [testRef, "test-merchant", "Uttara", "Delivery Delay", "Delivery/Return", "Test insert"]
    });

    // Delete test row
    await db.execute({ sql: `DELETE FROM escalations WHERE ref_id = ?`, args: [testRef] });

    res.json({ ok: true, message: "DB write test passed" });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post("/api/escalations", async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: "DB not connected" });

    // Ensure table exists
    await createTable();

    const { merchantId, kamName, channel, zone, concernHub, issueStatus, issueCategory, subCategory, issueDetails } = req.body;

    if (!merchantId || !concernHub || !issueCategory || !subCategory || !issueDetails) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const year = getBSTYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    const refId = `CBE-${year}-${random}`;
    const createdAtBST = getBSTTimestamp();

    await db.execute({
      sql: `INSERT INTO escalations (ref_id, merchant_id, kam_name, channel, zone, concern_hub, issue_status, issue_category, issue_sub_category, issue_details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [refId, merchantId, kamName || null, channel || null, zone || null, concernHub, issueStatus || "Pending", issueCategory, subCategory, issueDetails, createdAtBST]
    });

    res.status(201).json({ success: true, data: { refId } });
  } catch (error) {
    console.error("Submit error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/escalations", async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: "No DB" });
    const result = await db.execute("SELECT * FROM escalations ORDER BY created_at DESC");
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});


// Initialize
async function start() {
  const ok = await initDb();
  if (ok) await createTable();
  app.listen(PORT, () => {
    console.log(`Server on port ${PORT}`);
    console.log(`Health: http://localhost:${PORT}/api/health`);
    console.log(`DB Test: http://localhost:${PORT}/api/test-db`);
  });
}

start();
