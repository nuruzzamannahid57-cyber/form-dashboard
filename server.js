import express from "express";
import { createClient } from "@libsql/client";

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

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Carrybee Escalation Form</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#1e293b;padding:24px 16px}
.wrap{max-width:720px;margin:0 auto}
.header{text-align:center;padding:36px 24px 30px;background:linear-gradient(135deg,#6366f1,#7c3aed,#a855f7);border-radius:16px;margin-bottom:28px}
.header h1{font-size:26px;font-weight:800;color:#fff;margin-bottom:8px}
.header p{color:rgba(255,255,255,.75);font-size:14px}
.card{background:#fff;border-radius:16px;padding:28px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.04),0 4px 20px rgba(0,0,0,.06);border:1px solid #e2e8f0}
.sec{display:flex;align-items:center;gap:10px;margin-bottom:22px}
.num{width:30px;height:30px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;font-size:13px;font-weight:700;border-radius:50%;display:flex;align-items:center;justify-content:center}
.sec-title{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.8px}
.sec-line{flex:1;height:1px;background:linear-gradient(90deg,#e2e8f0,transparent);margin-left:8px}
.field{margin-bottom:20px}
label{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;margin-bottom:8px}
.req{color:#ef4444;font-size:14px;font-weight:700}
.tag{font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;background:#f1f5f9;color:#64748b;text-transform:uppercase}
.tag.req{background:linear-gradient(135deg,#fef2f2,#fee2e2);color:#ef4444}
input,select,textarea{width:100%;padding:12px 16px;font-size:14px;border:1.5px solid #e2e8f0;border-radius:8px;background:#fafbfc;outline:none;font-family:inherit}
input:focus,select:focus,textarea:focus{border-color:#6366f1;background:#fff;box-shadow:0 0 0 4px rgba(99,102,241,.08)}
select{cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;padding-right:40px}
textarea{min-height:140px;resize:vertical;line-height:1.6}
.row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.err{display:none;align-items:center;gap:5px;font-size:12px;color:#ef4444;margin-top:6px}
input.error,select.error,textarea.error{border-color:#ef4444;background:#fef2f2}
.btn{width:100%;padding:14px 24px;font-size:15px;font-weight:700;color:#fff;background:linear-gradient(135deg,#6366f1,#4f46e5);border:none;border-radius:8px;cursor:pointer}
.btn:disabled{opacity:.6;cursor:not-allowed}
.success{display:none;text-align:center;padding:48px 24px}
.ring{width:72px;height:72px;margin:0 auto 20px;background:linear-gradient(135deg,#10b981,#059669);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:32px;font-weight:700;box-shadow:0 8px 24px rgba(16,185,129,.25);animation:pop .4s cubic-bezier(.34,1.56,.64,1)}
@keyframes pop{from{transform:scale(.5);opacity:0}to{transform:scale(1);opacity:1}}
.ref{display:inline-flex;align-items:center;gap:8px;background:#f1f5f9;border:1.5px dashed #e2e8f0;border-radius:8px;padding:10px 20px;font-family:monospace;font-size:15px;font-weight:700;color:#4f46e5}
.reset{margin-top:24px;padding:10px 24px;font-size:13px;font-weight:600;color:#6366f1;background:transparent;border:1.5px solid #6366f1;border-radius:8px;cursor:pointer}
.reset:hover{background:#6366f1;color:#fff}
.footer{text-align:center;font-size:11px;color:#94a3b8;margin-top:16px}
@media(max-width:560px){body{padding:12px}.card{padding:20px}.row{grid-template-columns:1fr}.header h1{font-size:20px}}
</style>
</head>
<body>
<div class="wrap">
<div class="header"><h1>Carrybee Issues Escalation</h1><p>Log and escalate merchant & consignment concerns</p></div>
<div id="formContent">
<div class="card">
<div class="sec"><div class="num">1</div><div class="sec-title">Identification</div><div class="sec-line"></div></div>
<div class="field"><label>Consignment ID / Merchant Name <span class="req">*</span> <span class="tag req">Required</span></label><input type="text" id="merchantId" placeholder="Enter Consignment ID or Merchant Name"><div class="err" id="err-merchantId">Required</div></div>
<div class="field"><label>KAM Name <span class="tag">Optional</span></label><select id="kamName"><option value="" disabled selected>Select KAM</option><option>Raian Islam Rudra</option><option>Akash Saha</option><option>Ahmed Asif Rashid</option><option>Tanvir Ahmmed</option><option>Rizvi Ahmed</option><option>Sazzad Haider</option><option>Nuruzzaman Nahid</option><option>Md Ibrahim Mojumder</option><option>Md. Mahmudul Hasan</option><option>S. M Shihab</option><option>Md. Anik Ahamed</option><option>MD Sohel Rana</option><option>Hasib Islam</option><option>SK Fardin Osi</option><option>Jaber Al Aunto</option><option>Md. Asif Rayhan</option><option>Shabib Md Shahnawaj</option><option>Abdul Goni Howladar</option><option>Jubayer Rahman</option><option>MD Solayman Shadik Shady</option><option>Shohanur Rahman Shuvo</option><option>MD.kayef Ahmed Shajib</option><option>Rahul Roy</option></select></div>
<div class="row"><div class="field"><label>Channel <span class="tag">Optional</span></label><select id="channel"><option value="" disabled selected>Select</option><option>KAM</option><option>Contact center</option><option>FB</option><option>OPS</option><option>HUB</option></select></div><div class="field"><label>Zone <span class="tag">Optional</span></label><select id="zone"><option value="" disabled selected>Select</option><option>ISD</option><option>OSD</option><option>RSD</option><option>Central short</option></select></div></div>
</div>
<div class="card">
<div class="sec"><div class="num">2</div><div class="sec-title">Issue Classification</div><div class="sec-line"></div></div>
<div class="field"><label>Concern Hub <span class="req">*</span> <span class="tag req">Required</span></label><select id="concernHub"><option value="" disabled selected>Select Hub</option><optgroup label="Dhaka North"><option>Uttara</option><option>Diabari</option><option>Khilkhet</option><option>Mohakhali</option><option>Badda</option></optgroup><optgroup label="Dhaka Central"><option>Pallabi</option><option>60 Feet</option><option>Mohammadpur</option><option>Kolabagan</option><option>Lalbagh</option><option>Kamrangirchar</option></optgroup><optgroup label="Dhaka South"><option>Jatrabari</option><option>Khilgaon</option><option>Dhonia</option><option>Demra</option></optgroup><optgroup label="Gazipur & Savar"><option>Gazipur-Joydebpur</option><option>Gazipur-Kapasiya</option><option>Gazipur-Mawna</option><option>Gazipur-Mouchak</option><option>Gazipur-Boardbazar</option><option>Gazipur-Kaliganj</option><option>Savar</option><option>Savar-Baipail</option><option>Savar-Dhamrai</option></optgroup><optgroup label="Narayanganj"><option>Narayanganj</option><option>Sonargaon</option><option>Narayanganj-Bandar</option><option>Narayanganj-Araihazar</option><option>Bhulta-Gawsia</option><option>Dohar-Nawabganj</option><option>Keraniganj-Ati Bazar</option><option>Siddhirganj</option><option>Keraniganj</option></optgroup><optgroup label="Khulna"><option>Narail-Sadar</option><option>Jhenaidah-Sadar</option><option>Jhenaidah-Maheshpur</option><option>Bagerhat-Sadar</option><option>Kushtia-Sadar</option><option>Kushtia-Daulatpur</option><option>Kushtia-Bheramara</option><option>Jessore-Manirampur</option><option>Bagerhat-Mongla</option><option>Bagerhat-Morrelganj</option><option>Jessore-Sadar</option><option>Jessore-Sharsha</option><option>Jessore-Abhaynagar</option><option>Khulna-Paikgacha</option><option>Khulna-Dumuria</option><option>Khulna-Sadar</option><option>Chuadanga-Sadar</option><option>Satkhira-Sadar</option><option>Satkhira-Kaliganj</option><option>Meherpur-Sadar</option><option>Magura-Sadar</option></optgroup><optgroup label="Barishal"><option>Bhola-Sadar</option><option>Pirojpur-Sadar</option><option>Barishal-Sadar</option><option>Barisal-Muladi</option><option>Barisal-Bakerganj</option><option>Bhola-Charfassion</option><option>Pirojpur-Mathbaria</option><option>Barisal-Gournadi</option><option>Barguna-Sadar</option><option>Jhalokathi-Sadar</option><option>Patuakhali-Sadar</option><option>Patuakhali-Galachipa</option><option>Patuakhali-Kalapara</option></optgroup><optgroup label="Comilla & Noakhali"><option>Comilla-Laksam</option><option>Comilla-Sadar</option><option>Comilla-Muradnagar</option><option>Comilla-Chandina</option><option>Comilla-Chauddagram</option><option>Comilla-Daudkandi</option><option>Noakhali-Begumganj</option><option>Comilla-Nangalkot</option><option>Chandpur-Kachua</option><option>Lakshmipur-Ramganj</option><option>Chandpur-Matlab Dakshin</option><option>Lakshmipur-Kamalnagar</option><option>Comilla-Burichang</option><option>Comilla-Brahmanpara</option><option>Noakhali-Senbagh</option><option>Noakhali-Companiganj</option><option>Noakhali-Sadar</option><option>Noakhali-Chatkhil</option><option>Noakhali-Subarnachar</option><option>Chandpur-Sadar</option><option>Chandpur-Faridganj</option><option>Chandpur-Hajiganj</option><option>Lakshmipur-Sadar</option></optgroup><optgroup label="Chittagong"><option>Bandarban-Sadar</option><option>Cox's Bazar-Chakaria</option><option>Cox's Bazar-Maheshkhali</option><option>Cox's Bazar-Ramu</option><option>Cox's Bazar-Sadar</option><option>Cox's Bazar-Teknaf</option><option>Cox's Bazar-Ukhia</option><option>CTG-Anwara</option><option>CTG-Banshkhali</option><option>CTG-Fatikchari</option><option>CTG-Halishahar</option><option>CTG-Hathazari</option><option>CTG-Mirsarai</option><option>CTG-Nasirabad</option><option>CTG-Patenga</option><option>CTG-Patiya</option><option>CTG-Rangunia</option><option>CTG-Raozan</option><option>CTG-Satkania</option><option>CTG-Sitakunda</option><option>Feni-Chhagalnaiya</option><option>Feni-Daganbhuya</option><option>Feni-Sadar</option><option>Feni-Sonagazi</option><option>Khagrachari-Sadar</option><option>Rangamati-Sadar</option></optgroup><optgroup label="Narsingdi & Kishoreganj"><option>Narsingdi-Sadar</option><option>Narsingdi-Roypura</option><option>Narsingdi-Shibpur</option><option>Kishoreganj-Mithamain</option><option>Kishoreganj-Pakundia</option><option>Kishoreganj-Sadar</option><option>B.Baria-Sadar</option><option>B.Baria-Kasba</option><option>B.Baria-Nabinagar</option><option>B.Baria-Bancharampur</option><option>B.Baria-Nasirnagar</option><option>B.Baria-Akhaura</option><option>Kishoreganj-Bhairab</option></optgroup><optgroup label="Manikganj, Tangail"><option>Manikganj-Sadar</option><option>Shariatpur-Sadar</option><option>Gopalganj-Sadar</option><option>Faridpur-Sadar</option><option>Faridpur-Boalmari</option><option>Gopalganj-Muksudpur</option><option>Shariatpur-Damudya</option><option>Madaripur-Shibchar</option><option>Tangail-Sakhipur</option><option>Manikganj-Singair</option><option>Munshiganj-Sirajdikhan</option><option>Madaripur-Sadar</option><option>Faridpur-Bhanga</option><option>Munshiganj-Sreenagar</option><option>Tangail-Mirzapur</option><option>Munshiganj-Sadar</option><option>Rajbari-Sadar</option><option>Tangail-Sadar</option><option>Tangail-Ghatail</option></optgroup><optgroup label="Sylhet"><option>Sylhet-Sadar</option><option>Sylhet-Fenchuganj</option><option>Sylhet-Golapganj</option><option>Sylhet-Beanibazar</option><option>Sylhet-Bishwanath</option><option>Sylhet-Jaintiapur</option><option>Sylhet-Gowainghat</option><option>Sylhet-Osmaninagar</option><option>Sylhet-Kanaighat</option><option>Sylhet-Dakshin Surma</option><option>Habiganj-Sadar</option><option>Habiganj-Chunarughat</option><option>Habiganj-Madhabpur</option><option>Habiganj-Nabiganj</option><option>Moulvibazar-Barlekha</option><option>Moulvibazar-Kulaura</option><option>Maulvibazar-Sadar</option><option>Moulvibazar-Rajnagar</option><option>Moulvibazar-Sreemangal</option><option>Moulvibazar-Kamalganj</option><option>Sunamganj-Sadar</option><option>Sunamganj-Chhatak</option><option>Sunamganj-Jagannathpur</option><option>Sunamganj-Derai</option><option>Netrokona-Sadar</option><option>Netrakona-Mohonganj</option><option>Mymensingh-Bhaluka</option><option>Mymensingh-Gaffargaon</option><option>Mymensingh-Trishal</option><option>Mymensingh-Phulpur</option><option>Mymensingh-Sadar</option><option>Jamalpur-Sadar</option><option>Jamalpur-Dewanganj</option><option>Sherpur-Sadar</option></optgroup><optgroup label="Rajshahi & Rangpur"><option>Naogaon-Sadar</option><option>Joypurhat-Sadar</option><option>Rajshahi-Sadar</option><option>Bogra-Sherpur</option><option>Sirajganj-Sadar</option><option>Pabna-Bhangura</option><option>Bogra-Sadar</option><option>Natore-Sadar</option><option>Pabna-Ishwardi</option><option>Pabna-Sadar</option><option>Sirajganj-Shahjadpur</option><option>Chapainawabganj-Shibganj</option><option>Rajshahi-Puthia</option><option>Bogra-Dhupchanchia</option><option>Chapainawabganj-Sadar</option><option>Sirajganj-Ullapara</option><option>Naogaon-Patnitala</option><option>Rangpur-Sadar</option><option>Dinajpur-Sadar</option><option>Gaibandha-Sadar</option><option>Nilphamari-Sadar</option><option>Panchagarh-Sadar</option><option>Dinajpur-Nawabganj</option><option>Nilphamari-Joldhaka</option><option>Kurigram-Sadar</option><option>Thakurgaon-Sadar</option><option>Lalmonirhat-Sadar</option><option>Rangpur-Mithapukur</option><option>Dinajpur-Birganj</option><option>Nilphamari-Saidpur</option><option>Gaibandha-Gobindaganj</option></optgroup></select><div class="err" id="err-concernHub">Required</div></div>
<div class="row"><div class="field"><label>Issue Status <span class="tag">Optional</span></label><select id="issueStatus"><option value="" disabled selected>Select</option><option selected>Pending</option></select></div><div class="field"><label>Issue Category <span class="req">*</span> <span class="tag req">Required</span></label><select id="issueCategory"><option value="" disabled selected>Select</option><option>Execution Request</option><option>Forcefully Taken</option><option>Inquiry</option><option>Panel Status</option><option>Complain Why Return</option><option>Coverage/Point Delivery</option><option>Delivery Delay</option><option>Payment Issue</option><option>Pickup</option><option>Return Delay</option><option>Return Exchange</option><option>Reverse Pickup</option><option>Charge Extra/Wrong COD</option><option>Damage</option><option>No Entry/Cancelled</option><option>Unprofessionalism</option><option>Wrong Routing</option><option>Wrong Tag/Parcel Swapped</option><option>Breach of CLOSEBOX</option><option>Urgent Delivery</option></select><div class="err" id="err-issueCategory">Required</div></div></div>
<div class="field"><label>Issue Sub Category <span class="req">*</span> <span class="tag req">Required</span></label><select id="subCategory"><option value="" disabled selected>Select</option><optgroup label="Execution & Updates"><option>Order Cancellation Request</option><option>Price Updation Request</option><option>Customer Address Update</option><option>Customer Contact Update</option><option>Payment Info Update</option><option>Profile Info Update</option><option>Profile Password Update</option><option>Store Approval</option><option>Store Info Update</option><option>Hold Request</option><option>Partial Delivery Request – Special Instruction</option><option>Uninformed Info Change</option></optgroup><optgroup label="Agent & Fraud"><option>Agent Details Missing/Wrong Number</option><option>Fraudulent Activity</option></optgroup><optgroup label="Delivery & Return"><option>Delivery/Return</option><option>Delivery Hold</option><option>Order Info/Status</option></optgroup><optgroup label="Inquiry & Feedback"><option>Coverage Area</option><option>Feedback/Suggestion</option><option>Courier Service</option><option>Silent Call/Chat</option><option>Merchant Panel/App</option></optgroup><optgroup label="Join & Transfer"><option>Interested to Join as Agent</option><option>Interested to Join As Merchant</option><option>Other Vertical Transfer</option></optgroup><optgroup label="Payment & Charges"><option>Payment Process Courier</option><option>CarryBee Outbound Call</option><option>Pickup Entry</option><option>Reverse Pickup</option><option>Return Exchange</option><option>Extra Charge Offered</option><option>Extra Charge Demanded</option><option>Wrong COD Collection</option><option>Wrong Weight Input</option><option>Miscalculation of Weight Charge</option><option>Miscalculation of Delivery/Return Charge</option><option>Miscalculation of COD Charge</option></optgroup><optgroup label="Damage & Loss"><option>Poor Packaging</option><option>Not Processed Under Fragile Category</option><option>Act of God</option><option>Defective Product Sent By Merchant</option><option>Liquid Leakage</option><option>Stapler Pin</option><option>Rat Bites</option><option>Mishandling</option><option>Trackless</option><option>Parcel Lost By OPS</option><option>Hijacking/Robbery</option><option>Empty Package/Empty Packet/Empty Box</option><option>Partial Missing</option></optgroup><optgroup label="Entry & Info"><option>Double Entry</option><option>No Entry</option><option>Info Mismatch</option><option>Product Not Given By Merchant</option></optgroup><optgroup label="Behavior & Routing"><option>Misbehavior By PA / DA / Employee</option><option>Incomplete/Wrong Info Input On Panel</option><option>Wrong Routing By Processing Team</option><option>Wrong POD Attached</option><option>Technical Error</option><option>Wrong Tag By LMH / FMH / Processing Team</option></optgroup></select><div class="err" id="err-subCategory">Required</div></div>
</div>
<div class="card">
<div class="sec"><div class="num">3</div><div class="sec-title">Details</div><div class="sec-line"></div></div>
<div class="field"><label>Issue Details <span class="req">*</span> <span class="tag req">Required</span></label><textarea id="issueDetails" placeholder="Describe the issue..."></textarea><div class="err" id="err-issueDetails">Required</div></div>
</div>
<button class="btn" id="submitBtn" onclick="submitForm()">Submit Escalation</button>
</div>
<div class="success" id="successView">
<div class="card">
<div class="ring">✓</div>
<h2 style="font-size:22px;font-weight:800;margin-bottom:8px">Escalation Submitted</h2>
<p style="color:#64748b;margin-bottom:20px">Your issue has been logged successfully.</p>
<div class="ref" id="refId">CBE-2026-XXXX</div>
<br><button class="reset" onclick="resetForm()">Submit Another</button>
</div>
</div>
<div class="footer">Carrybee Support System</div>
</div>
<script>
function v(){let ok=true;[['merchantId','err-merchantId'],['concernHub','err-concernHub'],['issueCategory','err-issueCategory'],['subCategory','err-subCategory'],['issueDetails','err-issueDetails']].forEach(([id,err])=>{const el=document.getElementById(id),e=document.getElementById(err);if(!el.value.trim()){el.classList.add('error');e.style.display='flex';ok=false}else{el.classList.remove('error');e.style.display='none'}});return ok}
async function submitForm(){if(!v())return;const btn=document.getElementById('submitBtn');btn.disabled=true;btn.textContent='Processing...';try{const payload={merchantId:document.getElementById('merchantId').value.trim(),kamName:document.getElementById('kamName').value,channel:document.getElementById('channel').value,zone:document.getElementById('zone').value,concernHub:document.getElementById('concernHub').value,issueStatus:document.getElementById('issueStatus').value,issueCategory:document.getElementById('issueCategory').value,subCategory:document.getElementById('subCategory').value,issueDetails:document.getElementById('issueDetails').value.trim()};const res=await fetch('/api/escalations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await res.json();if(data.success){document.getElementById('refId').textContent=data.data.refId;document.getElementById('formContent').style.display='none';document.getElementById('successView').style.display='block'}else{throw new Error(data.error||'Failed')}}catch(e){btn.disabled=false;btn.textContent='Submit Escalation';alert('Error: '+e.message)}}
function resetForm(){document.getElementById('formContent').style.display='block';document.getElementById('successView').style.display='none';document.getElementById('submitBtn').disabled=false;document.getElementById('submitBtn').textContent='Submit Escalation';['merchantId','issueDetails'].forEach(id=>{document.getElementById(id).value='';document.getElementById(id).classList.remove('error')});['channel','zone','issueStatus','issueCategory','subCategory','concernHub','kamName'].forEach(id=>document.getElementById(id).selectedIndex=0)}
</script>
</body>
</html>`);
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
