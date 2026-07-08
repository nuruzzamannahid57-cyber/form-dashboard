# Carrybee Issues Escalation Form

A beautiful, production-ready escalation form connected to Turso (libSQL) database.

## Features

- Beautiful gradient UI with numbered sections
- Full form validation with real-time error clearing
- 200+ Concern Hubs organized by division
- 20 Issue Categories with 47 grouped Sub Categories
- 23 KAM Names
- 5 Channels (KAM, Contact Center, FB, OPS, HUB)
- 4 Zones (ISD, OSD, RSD, Central Short)
- Turso database integration for persistent storage
- Auto-generated reference IDs (CBE-YYYY-XXXX)
- Animated success state with "Submit Another" reset

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Initialize database schema:
   ```bash
   npm run db:init
   ```

4. Start the server:
   ```bash
   npm start
   ```

5. Open `http://localhost:3000` in your browser.

## Database Schema

The `escalations` table stores all submitted issues with:
- Auto-incrementing ID
- Reference ID (CBE-YYYY-XXXX format)
- Consignment ID / Merchant Name
- KAM Name
- Channel, Zone, Concern Hub
- Issue Status, Category, Sub Category
- Issue Details
- Timestamps (created_at, updated_at)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Serve the escalation form |
| POST | `/api/escalations` | Submit a new escalation |
| GET | `/api/escalations` | List all escalations |
| GET | `/api/escalations/:refId` | Get escalation by reference ID |

## Turso Connection

This project uses `@libsql/client` to connect to Turso Cloud:
- Database: `libsql://daily-report-nuruzzamannahid.aws-ap-south-1.turso.io`
- Package: `@libsql/client` (production-ready, ORM compatible)
