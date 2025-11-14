// Check if user is logged in
function checkAuth() {
    const userData = sessionStorage.getItem('currentUser');
    if (!userData) {
        window.location.href = 'Aiml.html';
        return null;
    }
    return JSON.parse(userData);
}

// Function to fetch data from backend API endpoints instead of reading CSV directly
async function fetchAPI(path) {
    try {
        const res = await fetch(path);
        if (!res.ok) throw new Error('Network response was not ok');
        return await res.json();
    } catch (err) {
        console.error('fetchAPI error', err);
        return [];
    }
}

// Initialize data stores
let books = [];
let categories = [];
let bookCopies = [];
let transactions = [];
let fines = [];

// DOM references (dashboards should include these ids)
const profilePanel = document.getElementById('profilePanel');
const mainDashboard = document.getElementById('mainDashboard');
const searchBar = document.getElementById('searchBar');
const modal = document.getElementById('modal');
const modalContent = document.getElementById('modalContent');

// Load all required data
async function loadData() {
    try {
        // Determine API base URL: prefer window.API_BASE (for deployment), else use origin, else localhost fallback
        let API_BASE = 'http://localhost:3000';
        if (window.API_BASE) {
            API_BASE = String(window.API_BASE).replace(/\/+$/, '');
        } else if (window.location.hostname !== 'localhost') {
            API_BASE = window.location.origin;
        }
        const [booksData, categoriesData, copiesData, transactionsData, finesData] = await Promise.all([
            fetchAPI(`${API_BASE}/api/books`),
            fetchAPI(`${API_BASE}/api/categories`),
            fetchAPI(`${API_BASE}/api/bookcopies`),
            fetchAPI(`${API_BASE}/api/transactions`),
            fetchAPI(`${API_BASE}/api/fines`)
        ]);

        // normalize keys to lowercase (some CSVs use different header names)
        categories = categoriesData.map(c => ({
            category_id: c.category_id || c.categoryid || c['category_id'],
            category_name: c.category_name || c.categoryname || c['category_name']
        }));

        bookCopies = copiesData.map(c => ({
            copy_id: c.copy_id || c.copyid || c['copy_id'],
            book_id: c.book_id || c.bookid || c['book_id'],
            status: c.status
        }));

        transactions = transactionsData.map(t => ({
            transaction_id: t.transaction_id || t.transactionid || t['transaction_id'],
            user_id: t.user_id || t.userid || t['user_id'],
            copy_id: t.copy_id || t.copyid || t['copy_id'],
            borrow_date: t.borrow_date || t.borrowdate || t['borrow_date'],
            return_date: t.return_date || t.returndate || t['return_date'],
            due_date: t.due_date || t.duedate || t['due_date']
        }));

        fines = finesData.map(f => ({
            fine_id: f.fine_id || f.fineid || f['fine_id'],
            user_id: f.user_id || f.userid || f['user_id'],
            transaction_id: f.transaction_id || f.transactionid || f['transaction_id'],
            amount: f.amount,
            due_date: f.due_date || f.duedate || f['due_date'],
            payment_date: f.payment_date || f.paymentdate || f['payment_date'],
            fine_reason: f.fine_reason || f.fineReason || f['fine_reason']
        }));

        // Process books data
        books = booksData.map(book => ({
            id: book.book_id || book.bookid || book['book_id'] || book.book_id,
            title: book.title,
            author: book.author || book.authors,
            img: book.cover_image || book.coverimage || book.cover_image || "https://covers.openlibrary.org/b/id/8114151-M.jpg",
            total: bookCopies.filter(copy => copy.book_id === (book.book_id || book.bookid)).length,
            available: bookCopies.filter(copy => copy.book_id === (book.book_id || book.bookid) && (copy.status || '').toLowerCase() === 'available').length,
            // Resolve category robustly:
            // 1) prefer explicit book.category_name if present
            // 2) try exact category_id match
            // 3) try numeric part match (e.g., book.category_id='C1' vs category.category_id='1')
            // 4) try case-insensitive name match
            category: (() => {
                const bCatName = (book.category_name || '').toString().trim();
                if (bCatName) return bCatName;
                const bCatIdRaw = (book.category_id || book.categoryid || '').toString().trim();
                const bCatIdNum = (bCatIdRaw.match(/\d+/) || [''])[0];
                const lowerBName = (book.category_name || '').toString().toLowerCase().trim();
                const found = categories.find(cat => {
                    const catId = (cat.category_id || '').toString().trim();
                    if (catId && catId === bCatIdRaw) return true;
                    const catIdNum = (catId.match(/\d+/) || [''])[0];
                    if (bCatIdNum && catIdNum && bCatIdNum === catIdNum) return true;
                    const catName = (cat.category_name || cat.categoryname || '').toString().toLowerCase().trim();
                    if (catName && lowerBName && catName === lowerBName) return true;
                    return false;
                });
                return (found && (found.category_name || found.categoryname)) || '';
            })(),
            description: book.description || ''
        }));

        return true;
    } catch (error) {
        console.error('Error loading data:', error);
        return false;
    }
}

// Logout function
function logout() {
    sessionStorage.removeItem('currentUser');
    window.location.href = 'Aiml.html';
}

// Function to format date
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
}

// Initialize page
async function initializePage() {
    const user = checkAuth();
    if (!user) return;

    await loadData();
    renderUI();
}

// Call initialize when page loads
window.addEventListener('load', initializePage);

// Listen for cross-tab updates and refresh data/UI when other tabs make changes
window.addEventListener('storage', (e) => {
    try {
        if (!e.key) return;
        if (e.key === 'library::dataUpdate') {
            // reload all data and re-render UI if functions are available
            (async () => {
                const ok = await loadData();
                if (ok && typeof renderUI === 'function') {
                    try { renderUI(); } catch (err) { console.warn('renderUI not available', err); }
                }
            })();
        }
    } catch (err) {
        console.error('Error handling storage event', err);
    }
});
