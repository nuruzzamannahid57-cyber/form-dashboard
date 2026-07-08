import express from "express";
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

let db;

function initDb() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");
    return null;
  }
  try {
    return createClient({ url, authToken });
  } catch (err) {
    console.error("Failed to create Turso client:", err.message);
    return null;
  }
}

app.get("/api/health", async (req, res) => {
  try {
    if (!db) return res.status(503).json({ status: "error", message: "Database not initialized" });
    await db.execute("SELECT 1");
    res.json({ status: "ok", db: "connected", timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: "error", message: error.message });
  }
});

app.get("/", (req, res) => {
  try {
    const html = readFileSync(join(__dirname, "index.html"), "utf-8");
    res.send(html);
  } catch (error) {
    res.status(500).send("Error loading form: " + error.message);
  }
});

app.post("/api/escalations", async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: "Database not connected" });
    const { merchantId, kamName, channel, zone, concernHub, issueStatus, issueCategory, subCategory, issueDetails } = req.body;
    if (!merchantId || !concernHub || !issueCategory || !subCategory || !issueDetails) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    const refId = `CBE-${year}-${random}`;
    await db.execute({
      sql: `INSERT INTO escalations (ref_id, merchant_id, kam_name, channel, zone, concern_hub, issue_status, issue_category, issue_sub_category, issue_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [refId, merchantId, kamName || null, channel || null, zone || null, concernHub, issueStatus || "Pending", issueCategory, subCategory, issueDetails]
    });
    res.status(201).json({ success: true, message: "Escalation submitted successfully", data: { refId } });
  } catch (error) {
    console.error("Submit error:", error);
    res.status(500).json({ success: false, error: "Failed to submit escalation", details: error.message });
  }
});

app.get("/api/escalations", async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: "Database not connected" });
    const result = await db.execute("SELECT * FROM escalations ORDER BY created_at DESC");
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch escalations" });
  }
});

app.get("/api/escalations/:refId", async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: "Database not connected" });
    const result = await db.execute({ sql: "SELECT * FROM escalations WHERE ref_id = ?", args: [req.params.refId] });
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Escalation not found" });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch escalation" });
  }
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, error: "Internal server error", details: err.message });
});

async function start() {
  db = initDb();
  if (db) {
    try {
      await db.execute("SELECT 1");
      console.log("Turso database connected");
    } catch (err) {
      console.error("Turso connection test failed:", err.message);
    }
  }
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
}

start();
