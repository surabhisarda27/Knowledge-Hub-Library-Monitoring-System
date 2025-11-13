const fs = require('fs');
const path = require('path');
const { query } = require('./mysql');
const CSV_DIR = path.join(__dirname, 'csv_files');

function parseCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = cols[i] || '');
    return obj;
  });
}

async function importTable(filename, mapRowToParams) {
  const p = path.join(CSV_DIR, filename);
  if (!fs.existsSync(p)) {
    console.warn('CSV not found:', filename);
    return;
  }
  const content = fs.readFileSync(p, 'utf8');
  const rows = parseCSV(content);
  console.log(`Importing ${rows.length} rows from ${filename}`);
  for (const r of rows) {
    try {
      const { sql, params } = mapRowToParams(r);
      await query(sql, params);
    } catch (err) {
      console.error('Insert error for', filename, err.message || err);
    }
  }
}

(async () => {
  try {
    // Users
    await importTable('Users.csv', (r) => ({
      sql: `INSERT IGNORE INTO users (user_id,name,email,password,role,membership_date) VALUES (?,?,?,?,?,?)`,
      params: [r.user_id, r.name, r.email, r.password, r.role || 'member', r.membership_date || null]
    }));

    // Category
    await importTable('Category.csv', (r) => ({
      sql: `INSERT IGNORE INTO category (category_id,category_name) VALUES (?,?)`,
      params: [r.category_id || r.categoryid, r.category_name || r.categoryname || r.category_name]
    }));

    // Books
    await importTable('Books.csv', (r) => ({
      sql: `INSERT IGNORE INTO books (book_id,title,author,category_id,description) VALUES (?,?,?,?,?)`,
      params: [r.book_id, r.title, r.author || r.authors || '', r.category_id || r.categoryid || '', r.description || r.desc || '']
    }));

    // BookCopies
    await importTable('BookCopies.csv', (r) => ({
      sql: `INSERT IGNORE INTO bookcopies (copy_id,book_id,status,location) VALUES (?,?,?,?)`,
      params: [r.copy_id, r.book_id, r.status || 'available', r.location || 'main']
    }));

    // Transactions
    await importTable('Transactions.csv', (r) => ({
      sql: `INSERT IGNORE INTO transactions (transaction_id,user_id,copy_id,borrow_date,due_date,return_date) VALUES (?,?,?,?,?,?)`,
      params: [r.transaction_id, r.user_id, r.copy_id, r.borrow_date || null, r.due_date || null, r.return_date || null]
    }));

    // Fines
    await importTable('Fines.csv', (r) => ({
      sql: `INSERT IGNORE INTO fines (fine_id,user_id,transaction_id,amount,due_date,payment_date,fine_reason) VALUES (?,?,?,?,?,?,?)`,
      params: [r.fine_id, r.user_id, r.transaction_id, r.amount || 0, r.due_date || null, r.payment_date || null, r.fine_reason || '']
    }));

    // Staff
    await importTable('Staff.csv', (r) => ({
      sql: `INSERT IGNORE INTO staff (staff_id,staff_name,email,password,role,department) VALUES (?,?,?,?,?,?)`,
      params: [r.staff_id, r.staff_name, r.email, r.password, r.role || '', r.department || '']
    }));

    console.log('Migration completed.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed', err);
    process.exit(1);
  }
})();
