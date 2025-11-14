// Initialize data store (note: base.js also declares these globally if included)
// Only declare if not already defined (avoid redeclaration errors)
if (typeof books === 'undefined') { var books = []; }
if (typeof categories === 'undefined') { var categories = []; }
if (typeof bookCopies === 'undefined') { var bookCopies = []; }
if (typeof transactions === 'undefined') { var transactions = []; }
if (typeof staff === 'undefined') { var staff = []; }
if (typeof fines === 'undefined') { var fines = []; }
if (typeof users === 'undefined') { var users = []; }
let currentlyReading = [];
let previousBorrowed = [];
let toBeRead = [];
let mockTransactions = [];

// DOM elements (may or may not exist on this page)
let loginPage = null;
let app = null;
let currentUser = null;

// Function to parse CSV data
async function parseCSV(text) {
    const lines = text.split('\n').filter(line => line.trim());
    const headers = lines[0]
        .split(',')
        .map(header => header.trim().toLowerCase())
        .filter(header => header);
    
    const result = [];
    for(let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(value => value.trim());
        if (values.every(v => !v)) continue;
        
        const entry = {};
        headers.forEach((header, index) => {
            if (values[index]) {
                entry[header] = values[index];
            }
        });
        
        if (Object.keys(entry).length > 0) {
            result.push(entry);
        }
    }
    return result;
}

// Function to load CSV file from root
async function loadCSV(filename) {
    try {
        const response = await fetch(`/${filename}`);  // Load from root, not csv_files/
        const text = await response.text();
        return await parseCSV(text);
    } catch (error) {
        console.error(`Error loading ${filename}:`, error);
        return [];
    }
}

// Function to update book counts
function updateBookCounts() {
    const totalBooksElem = document.getElementById('totalBooks');
    const booksOutElem = document.getElementById('booksOut');
    
    if (totalBooksElem && booksOutElem) {
        // Prefer totals from the books table if available; otherwise fall back to counting copies
        const totalBooks = books.reduce((s, b) => s + (parseInt(b.total) || 0), 0) || bookCopies.length || 0;
        const totalAvailable = books.reduce((s, b) => s + (parseInt(b.available) || 0), 0) || bookCopies.filter(c => (c.status || '').toLowerCase() === 'available').length || 0;
        const booksOut = Math.max(0, totalBooks - totalAvailable);

        totalBooksElem.textContent = totalBooks;
        booksOutElem.textContent = booksOut;
    }
}

// Function to handle copy management
function manageCopies(bookId, action) {
    const book = books.find(b => b.id === bookId);
    if (!book) return;

    if (action === 'add') {
        const newCopyId = `C${Date.now()}`;
        bookCopies.push({
            copy_id: newCopyId,
            book_id: bookId,
            status: 'Available',
            location: 'New Shelf',
            condition: 'Good'
        });
        book.total = (book.total || 0) + 1;
        book.available = (book.available || 0) + 1;
    } else if (action === 'remove' && book.total > 0) {
        const availableCopy = bookCopies.find(copy => 
            copy.book_id === bookId && 
            copy.status === 'Available'
        );
        if (availableCopy) {
            const index = bookCopies.indexOf(availableCopy);
            bookCopies.splice(index, 1);
            book.total--;
            book.available--;
        }
    }

    updateBookCounts();
    renderUI(searchBar.value);
}

// Initialize data before proceeding
let dataInitialized = false;
// Utility to fetch from API with fallback to CSV
async function fetchData(endpoint, csvFile) {
    try {
        // Determine API base URL: prefer window.API_BASE, else use origin for deployed sites, else localhost
        let API_BASE = 'http://localhost:3000';
        if (window.API_BASE) {
            API_BASE = String(window.API_BASE).replace(/\/+$/, '');
        } else if (window.location.hostname !== 'localhost') {
            API_BASE = window.location.origin;
        }
        
        const response = await fetch(`${API_BASE}${endpoint}`);
        if (response.ok) {
            return await response.json();
        }
    } catch (err) {
        console.warn(`API fetch failed for ${endpoint}, trying CSV`, err);
    }
    
    // Fallback to CSV
    try {
        return await loadCSV(csvFile);
    } catch (csvErr) {
        console.error(`CSV load failed for ${csvFile}`, csvErr);
        return [];
    }
}

// Load all data
async function initializeData() {
    try {
        // Initialize arrays
        currentlyReading = [];
        previousBorrowed = [];
        toBeRead = [];
        mockTransactions = [];
        
        // Load data from API with CSV fallback
        users = await fetchData('/api/members', 'Users.csv');
        const booksData = await fetchData('/api/books', 'Books.csv');
        categories = await fetchData('/api/categories', 'Category.csv');
        bookCopies = await fetchData('/api/bookcopies', 'BookCopies.csv');
        transactions = await fetchData('/api/transactions', 'Transactions.csv');
        staff = await fetchData('/api/staff', 'Staff.csv');
        fines = await fetchData('/api/fines', 'Fines.csv');

        // Process books data
        // Build a lookup map of copies by their book_id for fast access
        const copiesByBookId = {};
        for (const c of bookCopies) {
            const key = String(c.book_id || c.BookID || c.BookId || '').trim();
            if (!key) continue;
            if (!copiesByBookId[key]) copiesByBookId[key] = [];
            copiesByBookId[key].push(c);
        }

        // helper to extract first numeric part from an id string
        const numericPart = s => { const m = String(s || '').match(/\d+/); return m ? m[0] : null; };

        books = booksData.map(book => {
            const bookKey = String(book.book_id || book.bookid || book.book_id || book.BookID || '').trim();

            // try direct match
            let copies = copiesByBookId[bookKey] || [];

            // fallback: try numeric-part matching (e.g., B1 <-> 101 if numeric parts align)
            if ((!copies || copies.length === 0) && numericPart(bookKey)) {
                const bnum = numericPart(bookKey);
                for (const k of Object.keys(copiesByBookId)) {
                    if (numericPart(k) === bnum) {
                        copies = copiesByBookId[k];
                        break;
                    }
                }
            }

            // final fallback: try matching by title words inside copy.book_title if available
            if ((!copies || copies.length === 0) && book.title) {
                const t = book.title.toLowerCase();
                for (const k of Object.keys(copiesByBookId)) {
                    const arr = copiesByBookId[k];
                    if (!arr) continue;
                    for (const cp of arr) {
                        const cpTitle = (cp.title || cp.book_title || '').toLowerCase();
                        if (cpTitle && cpTitle.includes(t.split(' ')[0])) { // match on first word
                            copies = arr;
                            break;
                        }
                    }
                    if (copies && copies.length) break;
                }
            }

            const derivedTotal = copies.length;
            const derivedAvailable = copies.filter(copy => (copy.status || copy.Status || '').toLowerCase() === 'available').length;

            const totalFromBook = parseInt(book.total_copies || book.total || book.totalcopies || book.totalcopies || "") || NaN;
            const availableFromBook = parseInt(book.available_copies || book.available || book.availablecopies || "") || NaN;

            const total = !isNaN(totalFromBook) ? totalFromBook : derivedTotal;
            const available = !isNaN(availableFromBook) ? availableFromBook : derivedAvailable;

            if ((derivedTotal === 0) && (isNaN(totalFromBook) || totalFromBook === 0)) {
                // log debug to help you trace mismatches in dev console
                console.warn(`No copies found for book id=${bookKey} title="${book.title}" — derivedTotal=0`);
            }

            return {
                id: bookKey || book.title,
                title: book.title,
                author: book.author,
                img: book.cover_image || book.coverimage || "https://covers.openlibrary.org/b/id/8114151-M.jpg",
                total: total,
                available: available,
                rating: parseFloat(book.rating || "4.0") || 4.0,
                demand: parseInt(book.demand || "0") || 0,
                description: book.description || "No description available.",
                // Resolve category robustly: prefer book.category_name, then try matching ids (allowing C1 vs 1), then names
                category: (() => {
                    const bCatName = (book.category_name || '').toString().trim();
                    if (bCatName) return bCatName;
                    const bCatIdRaw = (book.category_id || book.categoryid || '').toString().trim();
                    const bCatIdNum = (bCatIdRaw.match(/\d+/) || [''])[0];
                    const lowerBName = (book.category_name || '').toString().toLowerCase().trim();
                    const found = categories.find(cat => {
                        const catId = (cat.category_id || cat.categoryid || '').toString().trim();
                        if (catId && catId === bCatIdRaw) return true;
                        const catIdNum = (catId.match(/\d+/) || [''])[0];
                        if (bCatIdNum && catIdNum && bCatIdNum === catIdNum) return true;
                        const catName = (cat.category_name || cat.categoryname || '').toString().toLowerCase().trim();
                        if (catName && lowerBName && catName === lowerBName) return true;
                        return false;
                    });
                    return (found && (found.category_name || found.categoryname)) || '';
                })()
            };
        });

        console.log('Data loaded successfully');
        
        // Initialize book counts to zero
        if (document.getElementById('totalBooks')) {
            document.getElementById('totalBooks').textContent = '0';
        }
        if (document.getElementById('booksOut')) {
            document.getElementById('booksOut').textContent = '0';
        }
        
        return true;
    } catch (error) {
        console.error('Error initializing data:', error);
        return false;
    }
}

// Initialize when page loads
window.addEventListener('load', async () => {
    // Safely get DOM elements (they may not exist on all pages)
    loginPage = loginPage || document.getElementById('loginPage');
    app = app || document.getElementById('app');
    
    if (loginPage) loginPage.style.display = 'flex';
    if (app) app.style.display = 'none';
    
    dataInitialized = await initializeData();
    if (!dataInitialized) {
        alert('Error loading library data. Please try again later.');
    }
    
    // Update counts after data is loaded
    setTimeout(updateBookCounts, 1000);
});

function renderUI(searchStr = "") {
    renderProfilePanel();

    let filteredBooks = searchStr
        ? books.filter((b) => b.title.toLowerCase().includes(searchStr.toLowerCase()))
        : books;

    if (currentUser.role === "member") {
        renderMemberDashboard(filteredBooks);
    } else {
        renderStaffDashboard(filteredBooks);
    }
}

function renderProfilePanel() {
    if (currentUser.role === "member") {
        // Member profile panel code...
    } else {
        profilePanel.innerHTML = `
            <div class="profile-summary">
                <img src="${currentUser.avatar || "https://i.pravatar.cc/80"}" />
                <h3>${currentUser.name}</h3>
                <div style="margin-bottom:1em;">Staff</div>
            </div>
            <div><strong>Total Books:</strong> <span id="totalBooks">0</span></div>
            <div><strong>Books Out:</strong> <span id="booksOut">0</span></div>
            <button class="sidebar-link" onclick="showSettings()">Settings</button>
            <button class="sidebar-link" onclick="window.location.reload()">Logout</button>
        `;
        // Ensure counts shown in the profile panel are up-to-date
        setTimeout(updateBookCounts, 0);
    }
}

function renderStaffDashboard(filteredBooks) {
    mainDashboard.innerHTML = `
        <h4>Library Inventory</h4>
        <div class="cards-grid">
            ${filteredBooks.map(b => `
                <div class="book-card">
                    <img src="${b.img || ""}" alt="book" />
                    <h4>${b.title}</h4>
                    <p>by ${b.author}</p>
                    <div class="rating">${starRating(b.rating, true)} <span style="font-size:0.98em;">(${b.rating})</span></div>
                    <div style="font-size:0.92em;">Total: <span class="right">${b.total || 0}</span></div>
                    <div style="font-size:0.92em;">Available: <span class="right">${b.available || 0}</span></div>
                    <div class="right" style="color:#d97706;font-size:0.93em;">Demand: ${b.demand || 0}</div>
                    <div class="book-actions">
                        <button class="action-btn" onclick="manageCopies('${b.id}', 'add')">Add Copy</button>
                        <button class="action-btn" onclick="manageCopies('${b.id}', 'remove')">Remove Copy</button>
                    </div>
                </div>
            `).join("")}
        </div>
    `;
}

// Add to window object for global access
window.manageCopies = manageCopies;
window.updateBookCounts = updateBookCounts;
window.renderUI = renderUI;
window.renderStaffDashboard = renderStaffDashboard;
window.parseCSV = parseCSV;
window.loadCSV = loadCSV;
window.initializeData = initializeData;