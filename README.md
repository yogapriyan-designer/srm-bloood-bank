# SRM Hospital Blood Bank System
Node.js + Express + SQLite (better-sqlite3). Frontend: plain HTML/CSS/JS (no build step).

## Run in VS Code
1. Install Node.js 18+ (https://nodejs.org)
2. Open this folder in VS Code → Terminal → `npm install` → `npm start`
3. Open http://localhost:3000

## Database
`data/bloodbank.db` is created on first run from `schema.sql`, and the 80 real donors from
`data/Blood_Bank_Student_Donor_Ready_Database.xlsx` (Hostelers / Day Scholars) are loaded automatically.
Every donor, collection, lab test, request, issue, emergency request, notification and audit entry is stored in SQL.
To reset: `npm run reseed`, then `npm start`. Open the .db file in VS Code with the "SQLite Viewer" extension.
