import { db } from "../db.js";

async function seedData() {
  try {
    // Insert a sample escalation for testing
    const sample = {
      ref_id: "CBE-2026-0001",
      merchant_id: "TEST-MERCHANT-001",
      kam_name: "Raian Islam Rudra",
      channel: "KAM",
      zone: "ISD",
      concern_hub: "Uttara",
      issue_status: "Pending",
      issue_category: "Delivery Delay",
      issue_sub_category: "Delivery/Return",
      issue_details: "Sample test escalation for database verification."
    };

    await db.execute({
      sql: `INSERT INTO escalations 
        (ref_id, merchant_id, kam_name, channel, zone, concern_hub, issue_status, issue_category, issue_sub_category, issue_details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        sample.ref_id, sample.merchant_id, sample.kam_name,
        sample.channel, sample.zone, sample.concern_hub,
        sample.issue_status, sample.issue_category, sample.issue_sub_category,
        sample.issue_details
      ]
    });

    console.log("✅ Sample data inserted successfully");
    console.log("   Reference ID:", sample.ref_id);
  } catch (error) {
    if (error.message.includes("UNIQUE constraint failed")) {
      console.log("ℹ️  Sample data already exists (ref_id: CBE-2026-0001)");
    } else {
      console.error("❌ Failed to seed data:", error.message);
    }
  }
}

seedData();
