// Initialize data store (avoid redeclaration if base.js loaded)
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
        const totalBooks = bookCopies.length || 0;
        const booksOut = transactions.filter(t => !t.return_date).length || 0;
        
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
            CopyID: newCopyId,
            BookID: bookId,
            Status: 'Available'
        });
        book.total = (book.total || 0) + 1;
        book.available = (book.available || 0) + 1;
    } else if (action === 'remove' && book.total > 0) {
        const availableCopy = bookCopies.find(copy => 
            copy.BookID === bookId && 
            copy.Status === 'Available'
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
        books = booksData.map(book => ({
            id: book.BookID,
            title: book.Title,
            author: book.Author,
            img: book.CoverImage || "https://covers.openlibrary.org/b/id/8114151-M.jpg",
            total: parseInt(bookCopies.filter(copy => copy.BookID === book.BookID).length) || 0,
            available: parseInt(bookCopies.filter(copy => copy.BookID === book.BookID && copy.Status === 'Available').length) || 0,
            rating: parseFloat(book.Rating || "4.0"),
            demand: parseInt(book.Demand || "0"),
            description: book.Description || "No description available.",
            // Resolve category robustly: prefer explicit book category name, then match ids or names
            category: (() => {
                const bCatName = (book.CategoryName || book.category_name || '').toString().trim();
                if (bCatName) return bCatName;
                const bCatIdRaw = (book.CategoryID || book.CategoryID || book.CategoryId || book.CategoryId || book.CategoryID || '').toString().trim();
                // also check lowercase keys
                const bCatIdAlt = (book.CategoryID || book.category_id || book.categoryid || '').toString().trim();
                const bCatIdNum = (bCatIdRaw.match(/\d+/) || (bCatIdAlt.match ? bCatIdAlt.match(/\d+/) : ['']))[0] || '';
                const lowerBName = (bCatName).toLowerCase().trim();
                const found = categories.find(cat => {
                    const catId = (cat.CategoryID || cat.category_id || cat.categoryid || '').toString().trim();
                    if (catId && (catId === bCatIdRaw || catId === bCatIdAlt)) return true;
                    const catIdNum = (catId.match(/\d+/) || [''])[0];
                    if (bCatIdNum && catIdNum && bCatIdNum === catIdNum) return true;
                    const catName = (cat.CategoryName || cat.category_name || cat.categoryname || '').toString().toLowerCase().trim();
                    if (catName && lowerBName && catName === lowerBName) return true;
                    return false;
                });
                return (found && (found.CategoryName || found.category_name || found.categoryname)) || '';
            })()
        }));

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
