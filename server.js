import express from "express";
import { db, testConnection } from "./db.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

// Serve the main form
app.get("/", (req, res) => {
  try {
    const html = readFileSync(join(__dirname, "public", "index.html"), "utf-8");
    res.send(html);
  } catch (error) {
    res.status(500).send("Error loading form. Please ensure public/index.html exists.");
  }
});

// API: Submit new escalation
app.post("/api/escalations", async (req, res) => {
  try {
    const {
      merchantId, kamName, channel, zone, concernHub,
      issueStatus, issueCategory, subCategory, issueDetails
    } = req.body;

    // Validation
    if (!merchantId || !concernHub || !issueCategory || !subCategory || !issueDetails) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: merchantId, concernHub, issueCategory, subCategory, issueDetails"
      });
    }

    // Generate reference ID
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    const refId = `CBE-${year}-${random}`;

    // Insert into database
    await db.execute({
      sql: `INSERT INTO escalations 
        (ref_id, merchant_id, kam_name, channel, zone, concern_hub, issue_status, issue_category, issue_sub_category, issue_details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        refId, merchantId, kamName || null,
        channel || null, zone || null, concernHub,
        issueStatus || "Pending", issueCategory, subCategory, issueDetails
      ]
    });

    res.status(201).json({
      success: true,
      message: "Escalation submitted successfully",
      data: { refId }
    });
  } catch (error) {
    console.error("Submit error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to submit escalation",
      details: error.message
    });
  }
});

// API: List all escalations
app.get("/api/escalations", async (req, res) => {
  try {
    const result = await db.execute("SELECT * FROM escalations ORDER BY created_at DESC");
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error("List error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch escalations"
    });
  }
});

// API: Get escalation by reference ID
app.get("/api/escalations/:refId", async (req, res) => {
  try {
    const result = await db.execute({
      sql: "SELECT * FROM escalations WHERE ref_id = ?",
      args: [req.params.refId]
    });

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Escalation not found"
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error("Fetch error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch escalation"
    });
  }
});

// Start server
async function start() {
  const connected = await testConnection();
  if (!connected) {
    console.warn("⚠️  Starting server without database connection...");
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Carrybee Escalation Form running at http://localhost:${PORT}`);
    console.log(`   API endpoints:`);
    console.log(`   - POST /api/escalations    Submit escalation`);
    console.log(`   - GET  /api/escalations    List all escalations`);
    console.log(`   - GET  /api/escalations/:refId  Get by reference ID\n`);
  });
}

start();
