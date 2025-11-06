// Initialize data store
let users = [];
let books = [];
let categories = [];
let bookCopies = [];
let transactions = [];
let staff = [];
let fines = [];
let currentlyReading = [];
let previousBorrowed = [];
let toBeRead = [];
let mockTransactions = [];

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

// Function to load CSV file
async function loadCSV(filename) {
    try {
        const response = await fetch(`csv_files/${filename}`);
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

// Load all data
async function initializeData() {
    try {
        // Initialize arrays
        currentlyReading = [];
        previousBorrowed = [];
        toBeRead = [];
        mockTransactions = [];
        
        // Load CSV data
        users = await loadCSV('Users.csv');
        const booksData = await loadCSV('Books.csv');
        categories = await loadCSV('Category.csv');
        bookCopies = await loadCSV('BookCopies.csv');
        transactions = await loadCSV('Transactions.csv');
        staff = await loadCSV('Staff.csv');
        fines = await loadCSV('Fines.csv');

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
                category: book.category_name || categories.find(cat => cat.category_id === book.category_id)?.category_name
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
    loginPage.style.display = 'flex';
    app.style.display = 'none';
    
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