const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// optional MySQL integration
const useMysql = (process.env.USE_MYSQL || 'false').toLowerCase() === 'true';
let db = null;
if (useMysql) {
  try {
    db = require('./mysql');
    console.log('MySQL integration enabled');
  } catch (err) {
    console.error('Unable to load mysql helper, falling back to CSV:', err.message || err);
    db = null;
  }
}

// Serve frontend static files from project root
app.use(express.static(path.join(__dirname)));

// Root route: serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Aiml.html'));
});

const CSV_DIR = path.join(__dirname, 'csv_files');

function parseCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows = lines.slice(1);
  return rows.map(row => {
    const cols = row.split(',').map(c => c.trim());
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] !== undefined ? cols[i] : '';
    });
    return obj;
  });
}

function toCSV(items) {
  if (!items || items.length === 0) return '';
  const headers = Object.keys(items[0]);
  const lines = [headers.join(',')];
  for (const it of items) {
    const row = headers.map(h => (it[h] !== undefined ? String(it[h]).replace(/\n/g, ' ') : '') ).join(',');
    lines.push(row);
  }
  return lines.join('\n');
}

function readCSVFile(filename) {
  const p = path.join(CSV_DIR, filename);
  try {
    const content = fs.readFileSync(p, 'utf8');
    return parseCSV(content);
  } catch (err) {
    console.error('readCSVFile error', err);
    return [];
  }
}

function writeCSVFile(filename, items) {
  const p = path.join(CSV_DIR, filename);
  try {
    const content = toCSV(items);
    fs.writeFileSync(p, content, 'utf8');
    return true;
  } catch (err) {
    console.error('writeCSVFile error', err);
    return false;
  }
}

// Basic endpoints
app.get('/api/members', async (req, res) => {
  if (useMysql && db) {
    try {
      const rows = await db.query('SELECT * FROM users');
      return res.json(rows);
    } catch (err) {
      console.error('DB /api/members error', err);
      // fallthrough to CSV mode
    }
  }
  const users = readCSVFile('Users.csv');
  res.json(users);
});

app.get('/api/copies', async (req, res) => {
  if (useMysql && db) {
    try {
  const rows = await db.query('SELECT * FROM bookcopies');
      return res.json(rows);
    } catch (err) {
      console.error('DB /api/copies error', err);
    }
  }
  const copies = readCSVFile('BookCopies.csv');
  res.json(copies);
});

app.get('/api/books', async (req, res) => {
  if (useMysql && db) {
    try {
      const rows = await db.query('SELECT * FROM books');
      return res.json(rows);
    } catch (err) {
      console.error('DB /api/books error', err);
    }
  }
  const books = readCSVFile('Books.csv');
  res.json(books);
});

app.get('/api/categories', async (req, res) => {
  if (useMysql && db) {
    try {
  const rows = await db.query('SELECT * FROM category');
      return res.json(rows);
    } catch (err) {
      console.error('DB /api/categories error', err);
    }
  }
  const categories = readCSVFile('Category.csv');
  res.json(categories);
});

app.put('/api/books/:id', async (req, res) => {
  const bookId = req.params.id;
  const { title, author, category_id, description } = req.body;
  
  if (!title || !author || !category_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (useMysql && db) {
    try {
      // update
      await db.query('UPDATE books SET title = ?, author = ?, category_id = ?, description = ? WHERE book_id = ?', [title, author, category_id, description || '', bookId]);
      const rows = await db.query('SELECT * FROM books WHERE book_id = ?', [bookId]);
      return res.json(rows[0] || {});
    } catch (err) {
      console.error('DB PUT /api/books/:id error', err);
      return res.status(500).json({ error: 'DB error' });
    }
  }

  const books = readCSVFile('Books.csv');
  const categories = readCSVFile('Category.csv');
  
  const bookIndex = books.findIndex(b => b.book_id === bookId);
  if (bookIndex === -1) return res.status(404).json({ error: 'Book not found' });
  
  const category = categories.find(c => c.category_id === category_id);
  if (!category) return res.status(404).json({ error: 'Category not found' });

  books[bookIndex] = {
    ...books[bookIndex],
    title,
    author,
    category_name: category.category_name,
    description: description || ''
  };

  const ok = writeCSVFile('Books.csv', books);
  if (!ok) return res.status(500).json({ error: 'Unable to save changes' });
  
  res.json(books[bookIndex]);
});

app.post('/api/members', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  // generate id
  const newId = 'U' + (Date.now() % 100000);
  const newUser = {
    user_id: newId,
    name: name,
    email: email,
    password: password,
    role: 'member',
    membership_date: new Date().toISOString().slice(0,10)
  };

  if (useMysql && db) {
    try {
      await db.query('INSERT INTO users (user_id, name, email, password, role, membership_date) VALUES (?, ?, ?, ?, ?, ?)', [newUser.user_id, newUser.name, newUser.email, newUser.password, newUser.role, newUser.membership_date]);
      return res.json(newUser);
    } catch (err) {
      console.error('DB POST /api/members error', err);
      return res.status(500).json({ error: 'DB error' });
    }
  }

  const users = readCSVFile('Users.csv');
  users.push(newUser);
  const ok = writeCSVFile('Users.csv', users);
  if (!ok) return res.status(500).json({ error: 'Unable to save' });
  res.json(newUser);
});

// Manage book copies
app.post('/api/books/copies', async (req, res) => {
  const { book_id, action, copy_id } = req.body;
  if (!book_id || !action) return res.status(400).json({ error: 'Missing fields' });

  if (useMysql && db) {
    try {
      const books = await db.query('SELECT * FROM books WHERE book_id = ?', [book_id]);
      if (!books || books.length === 0) return res.status(404).json({ error: 'Book not found' });

      if (action === 'add') {
        const newCopyId = `C${Date.now() % 100000}`;
          await db.query('INSERT INTO bookcopies (copy_id, book_id, status, location) VALUES (?, ?, ?, ?)', [newCopyId, book_id, 'available', 'main']);
      } else if (action === 'remove') {
        if (!copy_id) return res.status(400).json({ error: 'Missing copy_id' });
  const del = await db.query('DELETE FROM bookcopies WHERE copy_id = ? AND status = ?', [copy_id, 'available']);
        // del.affectedRows may be available depending on mysql2 return; check by running a select if needed
      }

  const totalRows = await db.query('SELECT COUNT(*) as total FROM bookcopies WHERE book_id = ?', [book_id]);
  const availRows = await db.query('SELECT COUNT(*) as available FROM bookcopies WHERE book_id = ? AND LOWER(status) = ?', [book_id, 'available']);
      const total = (totalRows && totalRows[0] && totalRows[0].total) || (totalRows.total || 0);
      const available = (availRows && availRows[0] && availRows[0].available) || (availRows.available || 0);
      return res.json({ success: true, total, available });
    } catch (err) {
      console.error('DB /api/books/copies error', err);
      return res.status(500).json({ error: 'DB error' });
    }
  }

  // CSV fallback
  const copies = readCSVFile('BookCopies.csv');
  const books = readCSVFile('Books.csv');
  const book = books.find(b => b.book_id === book_id);
  
  if (!book) return res.status(404).json({ error: 'Book not found' });
  
  if (action === 'add') {
    const newCopyId = `C${Date.now() % 100000}`;
    const newCopy = {
      copy_id: newCopyId,
      book_id: book_id,
      status: 'available',
      location: 'main'
    };
    copies.push(newCopy);
  } else if (action === 'remove') {
    if (!copy_id) return res.status(400).json({ error: 'Missing copy_id' });
    const copyIndex = copies.findIndex(c => c.copy_id === copy_id && c.status === 'available');
    if (copyIndex === -1) return res.status(404).json({ error: 'Copy not found or not available' });
    copies.splice(copyIndex, 1);
  }

  const ok = writeCSVFile('BookCopies.csv', copies);
  if (!ok) return res.status(500).json({ error: 'Unable to save' });
  
  // Calculate updated counts
  const totalCopies = copies.filter(c => c.book_id === book_id).length;
  const availableCopies = copies.filter(c => c.book_id === book_id && c.status === 'available').length;
  
  res.json({ 
    success: true, 
    total: totalCopies,
    available: availableCopies
  });
});

app.get('/api/staff', async (req, res) => {
  if (useMysql && db) {
    try {
      // staff table in DB doesn't always store passwords; passwords live in users table.
      // Try to detect a safe JOIN condition before issuing the query to avoid SQL errors
      let joinCondition = null;
      try {
        const hasEmail = await db.query("SHOW COLUMNS FROM staff LIKE 'email'");
        if (hasEmail && hasEmail.length > 0) {
          joinCondition = "LOWER(u.email) = LOWER(s.email)";
        } else {
          // try user_id or staff_id columns
          const hasUserId = await db.query("SHOW COLUMNS FROM staff LIKE 'user_id'");
          if (hasUserId && hasUserId.length > 0) {
            joinCondition = "u.user_id = s.user_id";
          } else {
            const hasStaffId = await db.query("SHOW COLUMNS FROM staff LIKE 'staff_id'");
            if (hasStaffId && hasStaffId.length > 0) {
              // some schemas store a mapping to users via staff_id == user_id
              joinCondition = "u.user_id = s.staff_id";
            }
          }
        }
      } catch (probeErr) {
        // If probing fails, don't attempt the join and fall back to CSV below
        console.warn('Could not probe staff columns, falling back to CSV for /api/staff', probeErr.message || probeErr);
      }

      if (joinCondition) {
        // Instead of relying on a SQL JOIN (which can fail if columns differ),
        // fetch staff and users separately and merge in JS. This avoids ON-clause
        // referencing missing columns in some schemas.
        const staffRows = await db.query('SELECT * FROM staff');
        const userRows = await db.query('SELECT user_id, email, password, name FROM users');

        // build lookup maps for merging
        const usersByEmail = {};
        const usersById = {};
        for (const u of userRows) {
          if (u.email) usersByEmail[String(u.email).toLowerCase()] = u;
          if (u.user_id) usersById[String(u.user_id)] = u;
        }

        const merged = staffRows.map(s => {
          const sEmail = (s.email || s.Email || '').toString().toLowerCase();
          let u = null;
          if (sEmail && usersByEmail[sEmail]) u = usersByEmail[sEmail];
          else if (s.user_id && usersById[s.user_id]) u = usersById[s.user_id];
          else if (s.staff_id && usersById[s.staff_id]) u = usersById[s.staff_id];

          return {
            ...s,
            user_id: u ? u.user_id : undefined,
            password: u ? u.password : undefined,
            name_from_users: u ? u.name : undefined
          };
        });

        return res.json(merged);
      } else {
        // No join condition -- still fetch staff rows and attempt JS merge using users
        try {
          const staffRows = await db.query('SELECT * FROM staff');
          const userRows = await db.query('SELECT user_id, email, password, name FROM users');
          const usersByEmail = {};
          const usersById = {};
          for (const u of userRows) {
            if (u.email) usersByEmail[String(u.email).toLowerCase()] = u;
            if (u.user_id) usersById[String(u.user_id)] = u;
          }
          const merged = staffRows.map(s => {
            const sEmail = (s.email || s.Email || '').toString().toLowerCase();
            let u = null;
            if (sEmail && usersByEmail[sEmail]) u = usersByEmail[sEmail];
            else if (s.user_id && usersById[s.user_id]) u = usersById[s.user_id];
            else if (s.staff_id && usersById[s.staff_id]) u = usersById[s.staff_id];
            return {
              ...s,
              user_id: u ? u.user_id : undefined,
              password: u ? u.password : undefined,
              name_from_users: u ? u.name : undefined
            };
          });
          return res.json(merged);
        } catch (e) {
          console.warn('Fallback DB merge failed, will return CSV staff', e && e.message);
        }
      }
    } catch (err) {
      console.error('DB /api/staff error', err);
    }
  }
  const staff = readCSVFile('Staff.csv');
  res.json(staff);
});

app.get('/api/bookcopies', async (req, res) => {
  if (useMysql && db) {
    try {
  const rows = await db.query('SELECT * FROM bookcopies');
      return res.json(rows);
    } catch (err) {
      console.error('DB /api/bookcopies error', err);
    }
  }
  const copies = readCSVFile('BookCopies.csv');
  res.json(copies);
});

app.get('/api/transactions', async (req, res) => {
  if (useMysql && db) {
    try {
  const rows = await db.query('SELECT * FROM transactions');
      return res.json(rows);
    } catch (err) {
      console.error('DB /api/transactions error', err);
    }
  }
  const tx = readCSVFile('Transactions.csv');
  res.json(tx);
});

app.get('/api/fines', async (req, res) => {
  if (useMysql && db) {
    try {
  const rows = await db.query('SELECT * FROM fines');
      return res.json(rows);
    } catch (err) {
      console.error('DB /api/fines error', err);
    }
  }
  const fines = readCSVFile('Fines.csv');
  res.json(fines);
});

// Update fine (payment_date, amount)
app.put('/api/fines/:fineId', async (req, res) => {
  const fineId = req.params.fineId;
  if (useMysql && db) {
    try {
      // Build simple update from body
      const fields = Object.keys(req.body);
      if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
      const sets = fields.map(f => `${f} = ?`).join(', ');
      const params = fields.map(f => req.body[f]);
      params.push(fineId);
      await db.query(`UPDATE fines SET ${sets} WHERE fine_id = ?`, params);
      const rows = await db.query('SELECT * FROM fines WHERE fine_id = ?', [fineId]);
      return res.json(rows[0] || {});
    } catch (err) {
      console.error('DB PUT /api/fines/:fineId error', err);
      return res.status(500).json({ error: 'DB error' });
    }
  }

  const fines = readCSVFile('Fines.csv');
  const idx = fines.findIndex(f => (f.fine_id || f.fineid || f.id) === fineId);
  if (idx === -1) return res.status(404).json({ error: 'Fine not found' });
  const updated = { ...fines[idx], ...req.body };
  fines[idx] = updated;
  const ok = writeCSVFile('Fines.csv', fines);
  if (!ok) return res.status(500).json({ error: 'Unable to save' });
  res.json(updated);
});

// Return a book (mark transaction return_date) and optionally add fine
app.post('/api/transactions/return', async (req, res) => {
  const { transaction_id, return_date, fine_amount, fine_reason } = req.body;
  if (!transaction_id) return res.status(400).json({ error: 'Missing transaction_id' });

  if (useMysql && db) {
    try {
      const txRows = await db.query('SELECT * FROM transactions WHERE transaction_id = ?', [transaction_id]);
      if (!txRows || txRows.length === 0) return res.status(404).json({ error: 'Transaction not found' });
      const tx = txRows[0];
      const retDate = return_date || new Date().toISOString().slice(0,10);
      await db.query('UPDATE transactions SET return_date = ? WHERE transaction_id = ?', [retDate, transaction_id]);

      let fineRecord = null;
      if (fine_amount && Number(fine_amount) > 0) {
        const newFineId = 'F' + (Date.now() % 100000);
          await db.query('INSERT INTO fines (fine_id, user_id, transaction_id, amount, due_date, payment_date, fine_reason) VALUES (?, ?, ?, ?, ?, ?, ?)', [newFineId, tx.user_id, transaction_id, String(fine_amount), new Date().toISOString().slice(0,10), '', fine_reason || 'Fine added on return']);
        const inserted = await db.query('SELECT * FROM fines WHERE fine_id = ?', [newFineId]);
        fineRecord = inserted[0] || null;
      }

      // mark copy available
      if (tx.copy_id) {
  await db.query("UPDATE bookcopies SET status = 'available' WHERE copy_id = ?", [tx.copy_id]);
      }

      const updatedTxRows = await db.query('SELECT * FROM transactions WHERE transaction_id = ?', [transaction_id]);
      return res.json({ transaction: updatedTxRows[0] || {}, fine: fineRecord });
    } catch (err) {
      console.error('DB /api/transactions/return error', err);
      return res.status(500).json({ error: 'DB error' });
    }
  }

  // CSV fallback
  const txs = readCSVFile('Transactions.csv');
  const txIdx = txs.findIndex(t => (t.transaction_id || t.transactionid) === transaction_id);
  if (txIdx === -1) return res.status(404).json({ error: 'Transaction not found' });
  txs[txIdx].return_date = return_date || new Date().toISOString().slice(0,10);
  const okTx = writeCSVFile('Transactions.csv', txs);
  if (!okTx) return res.status(500).json({ error: 'Unable to save transaction' });

  let fineRecord = null;
  if (fine_amount && Number(fine_amount) > 0) {
    const fines = readCSVFile('Fines.csv');
    const newFineId = 'F' + (Date.now() % 100000);
    fineRecord = {
      fine_id: newFineId,
      user_id: txs[txIdx].user_id,
      transaction_id: transaction_id,
      amount: String(fine_amount),
      due_date: new Date().toISOString().slice(0,10),
      payment_date: '',
      fine_reason: fine_reason || 'Fine added on return'
    };
    fines.push(fineRecord);
    writeCSVFile('Fines.csv', fines);
  }

  // Also mark the corresponding copy as available again
  try {
    const copies = readCSVFile('BookCopies.csv');
    const copyIdx = copies.findIndex(c => (c.copy_id || c.copyid) === txs[txIdx].copy_id);
    if (copyIdx !== -1) {
      copies[copyIdx].status = 'available';
      writeCSVFile('BookCopies.csv', copies);
    }
  } catch (err) {
    console.error('Error updating copy status on return', err);
  }

  res.json({ transaction: txs[txIdx], fine: fineRecord });
});

// Borrow a book: find available copy, create transaction, mark copy as Borrowed
app.post('/api/transactions/borrow', async (req, res) => {
  const { book_id, user_id } = req.body;
  if (!book_id || !user_id) return res.status(400).json({ error: 'Missing fields' });

  if (useMysql && db) {
    try {
  const copyRows = await db.query('SELECT * FROM bookcopies WHERE book_id = ? AND LOWER(status) = ? LIMIT 1', [book_id, 'available']);
      if (!copyRows || copyRows.length === 0) return res.status(400).json({ error: 'No available copies' });
      const availableCopy = copyRows[0];
  await db.query("UPDATE bookcopies SET status = 'Borrowed' WHERE copy_id = ?", [availableCopy.copy_id]);
      const newTxId = 'T' + (Date.now() % 100000);
      const borrowDate = new Date().toISOString().slice(0,10);
      const dueDate = new Date(Date.now() + 14*24*60*60*1000).toISOString().slice(0,10);
      await db.query('INSERT INTO transactions (transaction_id, user_id, copy_id, borrow_date, return_date, due_date) VALUES (?, ?, ?, ?, ?, ?)', [newTxId, user_id, availableCopy.copy_id, borrowDate, '', dueDate]);
      const newTxRows = await db.query('SELECT * FROM transactions WHERE transaction_id = ?', [newTxId]);
      return res.json({ transaction: newTxRows[0] || {}, copy: availableCopy });
    } catch (err) {
      console.error('DB /api/transactions/borrow error', err);
      return res.status(500).json({ error: 'DB error' });
    }
  }

  // CSV fallback
  const copies = readCSVFile('BookCopies.csv');
  const availableCopy = copies.find(c => (c.book_id === book_id) && ((c.status || '').toLowerCase() === 'available'));
  if (!availableCopy) return res.status(400).json({ error: 'No available copies' });

  // mark copy as Borrowed
  availableCopy.status = 'Borrowed';
  writeCSVFile('BookCopies.csv', copies);

  // create transaction
  const txs = readCSVFile('Transactions.csv');
  const newTxId = 'T' + (Date.now() % 100000);
  const borrowDate = new Date().toISOString().slice(0,10);
  const dueDate = new Date(Date.now() + 14*24*60*60*1000).toISOString().slice(0,10);
  const newTx = {
    transaction_id: newTxId,
    user_id: user_id,
    copy_id: availableCopy.copy_id,
    borrow_date: borrowDate,
    return_date: '',
    due_date: dueDate
  };
  txs.push(newTx);
  writeCSVFile('Transactions.csv', txs);

  res.json({ transaction: newTx, copy: availableCopy });
});

// Overdue endpoint: transactions without return_date and due_date < today
app.get('/api/overdue', async (req, res) => {
  if (useMysql && db) {
    try {
      // Join transactions, users, book_copies, books
      const rows = await db.query(`SELECT t.transaction_id, t.user_id, u.name as user_name, u.email, t.copy_id, bc.book_id, b.title as book_title, t.borrow_date, t.due_date
        FROM transactions t
        LEFT JOIN users u ON u.user_id = t.user_id
        LEFT JOIN bookcopies bc ON bc.copy_id = t.copy_id
        LEFT JOIN books b ON b.book_id = bc.book_id
        WHERE (t.return_date IS NULL OR t.return_date = '') AND t.due_date < CURRENT_DATE()`);
      return res.json(rows);
    } catch (err) {
      console.error('DB /api/overdue error', err);
    }
  }

  const txs = readCSVFile('Transactions.csv');
  const users = readCSVFile('Users.csv');
  const books = readCSVFile('Books.csv');
  const copies = readCSVFile('BookCopies.csv');

  const today = new Date();
  const overdue = txs.filter(t => {
    const due = t.due_date ? new Date(t.due_date) : null;
    const notReturned = !t.return_date || t.return_date.trim() === '';
    return due && notReturned && due < today;
  }).map(t => {
    const user = users.find(u => u.user_id === t.user_id) || {};
    const copy = copies.find(c => c.copy_id === t.copy_id) || {};
    const book = books.find(b => b.book_id === copy.book_id) || {};
    return {
      transaction_id: t.transaction_id,
      user_id: t.user_id,
      user_name: user.name || '',
      email: user.email || '',
      copy_id: t.copy_id,
      book_id: copy.book_id || '',
      book_title: book.title || '',
      borrow_date: t.borrow_date,
      due_date: t.due_date
    };
  });

  res.json(overdue);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} (USE_MYSQL=${useMysql})`);
});
