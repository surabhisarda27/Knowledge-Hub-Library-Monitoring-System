// Import base functionality
// (base.js is now included explicitly in HTML, so no need for document.write)

let currentUser = null;
let userTransactions = [];
let userFines = [];

async function renderUI(searchStr = "") {
    // Refresh latest data from backend so profile shows current borrowings
    await loadData();
    renderProfilePanel();
    renderBooks(searchStr);
}

function renderProfilePanel() {
    const user = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!user) return;

    // Get current borrowings
    const currentBorrowings = transactions.filter(t => 
        t.user_id === user.id && 
        (!t.return_date || t.return_date.trim() === '')
    );

    // Get books currently borrowed
    const currentlyBorrowedBooks = currentBorrowings.map(t => {
        const bookCopy = bookCopies.find(bc => bc.copy_id === t.copy_id);
        const book = books.find(b => b.id === bookCopy?.book_id);
        return {
            transaction_id: t.transaction_id,
            ...book,
            borrowDate: t.borrow_date,
            dueDate: t.due_date,
            copy_id: t.copy_id
        };
    }).filter(book => book.id); // Filter out any undefined books

    // Get pending fines
    const pendingFines = fines.filter(f => 
        f.user_id === user.id && 
        (!f.payment_date || f.payment_date.trim() === '')
    );

    profilePanel.innerHTML = `
        <div class="profile-summary">
            <!-- Profile picture removed -->
            <h3>${user.name}</h3>
            <div class="member-id">Member ID: ${user.id}</div>
        </div>
        <div class="current-borrows">
            <h4>Currently Borrowed:</h4>
            <ul>
                ${currentlyBorrowedBooks.map(b => `
                    <li>
                        ${b.title} (since ${formatDate(b.borrowDate)}) - Due: ${formatDate(b.dueDate)}
                        <button onclick="returnBook('${b.transaction_id}')" class="return-btn">Return</button>
                    </li>
                `).join("") || "<li class='none-item'>No books currently borrowed</li>"}
            </ul>
        </div>
        <div class="pending-fines">
            <h4>Pending Fines:</h4>
            <ul>
                ${pendingFines.map(f => `
                    <li>$${f.amount} (Due: ${formatDate(f.due_date)})</li>
                `).join("") || "<li class='none-item'>No pending fines</li>"}
            </ul>
        </div>
        <div class="to-be-read">
            <h4>To Be Read:</h4>
            <ul id="tbrList">
                <!-- Will be filled by renderToBeRead() -->
            </ul>
            <button onclick="showToBeReadModal()" class="sidebar-btn">Manage To Be Read</button>
        </div>
        <button onclick="showBorrowingHistory()" class="sidebar-btn">View Borrowing History</button>
        <button onclick="showNotifications()" class="sidebar-btn">Notifications</button>
    `;
}

function renderBooks(searchStr = "") {
    let filteredBooks = books;
    
    if (searchStr) {
        const searchLower = searchStr.toLowerCase();
        filteredBooks = books.filter(b => 
            b.title.toLowerCase().includes(searchLower) ||
            b.author.toLowerCase().includes(searchLower) ||
            b.category.toLowerCase().includes(searchLower)
        );
    }

    mainDashboard.innerHTML = `
        <div class="books-grid">
            ${filteredBooks.map(book => `
                <div class="book-card">
                    <img src="${book.img}" alt="${book.title}" class="book-cover">
                    <div class="book-info">
                        <h3>${book.title}</h3>
                        <p class="author">by ${book.author}</p>
                        <p class="category">${book.category}</p>
                        <p class="availability">
                            ${book.available} of ${book.total} available
                        </p>
                        <button onclick="borrowBook('${book.id}')" 
                                ${book.available === 0 ? 'disabled' : ''}>
                            ${book.available === 0 ? 'Not Available' : 'Borrow'}
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

async function borrowBook(bookId) {
    const user = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!user) return alert('Not logged in');
    const confirmBorrow = confirm('Borrow this book?');
    if (!confirmBorrow) return;
    try {
        const res = await fetch('/api/transactions/borrow', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ book_id: bookId, user_id: user.id }) });
        if (!res.ok) {
            const err = await res.json();
            return alert('Unable to borrow: ' + (err.error || res.statusText));
        }
        const json = await res.json();
        alert('Borrowed successfully. Due: ' + json.transaction.due_date);
        // reload data and UI
        await loadData();
        renderUI();
        // notify other tabs about the borrow (include user/book info so staff can see it)
        try {
            const copy = json.copy || {};
            const copyBookId = copy.book_id || copy.bookid || copy['book_id'];
            const bookObj = books.find(b => b.id === copyBookId || b.id === ('book_' + copyBookId) || b.id === copyBookId);
            localStorage.setItem('library::dataUpdate', JSON.stringify({ 
                type: 'borrow', 
                transaction_id: json.transaction.transaction_id || json.transaction.transactionid || '',
                user_id: user.id,
                user_name: user.name,
                book_id: copyBookId,
                book_title: bookObj ? bookObj.title : '',
                ts: Date.now()
            }));
        } catch (e) { console.warn('Unable to set storage event', e); }
    } catch (err) {
        console.error(err);
        alert('Error borrowing book');
    }
}

async function returnBook(transactionId) {
    if (!confirm('Mark this book as returned?')) return;
    try {
        const res = await fetch('/api/transactions/return', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ transaction_id: transactionId }) });
        let json = null;
        try {
            json = await res.json();
        } catch (parseErr) {
            const txt = await res.text().catch(() => '');
            console.error('Failed to parse JSON response for return:', parseErr, 'text:', txt);
            if (!res.ok) return alert('Unable to return: ' + (res.statusText || txt || 'Unknown error'));
        }

        if (!res.ok) {
            const errMsg = (json && (json.error || json.message)) || res.statusText || 'Unknown error';
            alert('Unable to return: ' + errMsg);
            return;
        }

        // Success path
        alert('Book returned successfully');
        // reload data and UI
        await loadData();
        renderUI();
        // notify other tabs (staff dashboard) about the update (include user/book info)
        try {
            const tx = json && (json.transaction || json.transaction) || {};
            const copyId = tx.copy_id || tx.copyid || transactionId;
            const copyObj = bookCopies.find(bc => bc.copy_id === copyId || bc.copyid === copyId || bc['copy_id'] === copyId) || {};
            const bookId = copyObj.book_id || copyObj.bookid || copyObj['book_id'] || (tx.book_id || tx.bookid) || '';
            const bookObj = books.find(b => b.id === bookId || b.id === ('book_' + bookId) || b.id === bookId);
            localStorage.setItem('library::dataUpdate', JSON.stringify({ type: 'return', transaction_id: tx.transaction_id || tx.transactionid || transactionId, user_id: user.id, user_name: user.name, book_id: bookId, book_title: bookObj ? bookObj.title : '', ts: Date.now() }));
        } catch (e) { console.warn('Unable to set storage event', e); }
    } catch (err) {
        console.error(err);
        alert('Error returning book: ' + (err && err.message ? err.message : String(err)));
    }
}

async function showBorrowingHistory() {
    const user = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!user) return;

    const userTransactions = transactions.filter(t => t.user_id === user.id);
    
    const historyHTML = userTransactions.map(t => {
        const bookCopy = bookCopies.find(bc => bc.copy_id === t.copy_id);
        const book = books.find(b => b.id === bookCopy?.book_id);
        return `
            <div class="history-item">
                <h4>${book?.title || 'Unknown Book'}</h4>
                <p>Borrowed: ${formatDate(t.borrow_date)}</p>
                ${t.return_date ? `<p>Returned: ${formatDate(t.return_date)}</p>` : '<p>Not yet returned</p>'}
            </div>
        `;
    }).join('');

    modalContent.innerHTML = `
        <h3>Borrowing History</h3>
        <div class="history-list">
            ${historyHTML || '<p>No borrowing history found.</p>'}
        </div>
        <button onclick="closeModal()">Close</button>
    `;
    modal.classList.remove('hidden');
}

function closeModal() {
    modal.classList.add('hidden');
}

// Add search functionality
document.getElementById('searchBar').addEventListener('input', (e) => {
    renderBooks(e.target.value.trim());
});
