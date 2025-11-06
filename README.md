# Library CSV Backend (Demo)

This is a small demo backend that serves CSV files as JSON and provides endpoints to update transactions and fines. It's intended for local development only and is not secure for production.

## Setup

1. Make sure you have Node.js (14+) installed.
2. From the project folder (`c:\Users\admin\Desktop\2-1\AIML\Project`) run:

```powershell
npm install
npm start
```

The server will listen on http://localhost:3000 by default.

## Endpoints

- GET /api/members - returns `Users.csv` rows
- POST /api/members - create a new member (body: name, email, password)
- GET /api/staff - returns `Staff.csv` rows
- GET /api/books - returns `Books.csv`
- GET /api/bookcopies - returns `BookCopies.csv`
- GET /api/transactions - returns `Transactions.csv`
- GET /api/fines - returns `Fines.csv`
- PUT /api/fines/:fineId - update a fine (body: amount, payment_date)
- POST /api/transactions/return - mark a transaction as returned (body: transaction_id, return_date, fine_amount, fine_reason)
- GET /api/overdue - returns transactions where due_date &lt; today and not yet returned

## Notes

- The server reads and overwrites CSV files in the `csv_files/` folder. Keep backups if you care about the data.
- CSV parsing/writing is simple and assumes CSVs are comma-separated and the first line contains headers.

## How to test from the frontend

Update frontend fetch calls to the new API (http://localhost:3000/api/...), or run the frontend files from a static server that allows requests to `localhost:3000` (CORS is enabled).

Example: fetch overdue list

```javascript
fetch('http://localhost:3000/api/overdue')
  .then(r => r.json())
  .then(data => console.log(data));
```

If you want, I can now wire the frontend `staff.js`, `member.js`, and `auth.js` to call these endpoints. Which parts would you like wired first?