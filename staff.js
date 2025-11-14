// Import base functionality
// (base.js is now included explicitly in HTML, so no need for document.write)

// Determine API base URL: prefer window.API_BASE (for deployment), else use origin, else localhost fallback
let API_BASE = 'http://localhost:3000';
if (window.API_BASE) {
    API_BASE = String(window.API_BASE).replace(/\/+$/, '');
} else if (window.location.hostname !== 'localhost') {
    API_BASE = window.location.origin;
}

// In-memory staff notifications (newest first)
let staffNotifications = [];

function addStaffNotification(note) {
    // note: { message, type, ts, details }
    staffNotifications.unshift(note);
    if (staffNotifications.length > 100) staffNotifications.pop();
    // re-render profile panel to update badge/count
    try { renderProfilePanel(); } catch (e) { /* ignore if not ready */ }
    // show a quick toast
    try { showStaffToast(note.message); } catch (e) { console.warn('toast failed', e); }
}

function showStaffToast(message) {
    try {
        const toast = document.createElement('div');
        toast.className = 'staff-toast';
        toast.textContent = message;
        toast.style.position = 'fixed';
        toast.style.right = '20px';
        toast.style.top = '20px';
        toast.style.background = '#111827';
        toast.style.color = 'white';
        toast.style.padding = '10px 14px';
        toast.style.borderRadius = '6px';
        toast.style.boxShadow = '0 6px 20px rgba(0,0,0,0.15)';
        toast.style.zIndex = 9999;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.transition = 'opacity 0.3s'; toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 5000);
    } catch (e) { console.warn('showStaffToast error', e); }
}

function showStaffNotificationsModal() {
    modalContent.innerHTML = `
        <h3>Notifications</h3>
        <div class="notifications-list">
            ${staffNotifications.length === 0 ? '<p>No notifications</p>' : staffNotifications.map(n => `
                <div class="notification-row">
                    <div><strong>${n.message}</strong></div>
                    <div class="muted">${new Date(n.ts).toLocaleString()}</div>
                </div>
            `).join('')}
        </div>
        <button onclick="clearStaffNotifications()">Clear</button>
        <button onclick="closeModal()">Close</button>
    `;
    modal.classList.remove('hidden');
}

function clearStaffNotifications() {
    staffNotifications = [];
    closeModal();
    renderProfilePanel();
}

// Listen for storage events to receive broadcasts from other tabs (members)
window.addEventListener('storage', (e) => {
    try {
        if (!e.key || e.key !== 'library::dataUpdate') return;
        if (!e.newValue) return;
        const payload = JSON.parse(e.newValue);
        handleLibraryUpdatePayload(payload);
    } catch (err) {
        console.error('Error handling storage event in staff', err);
    }
});

function handleLibraryUpdatePayload(payload) {
    if (!payload || !payload.type) return;
    const ts = payload.ts || Date.now();
    if (payload.type === 'borrow') {
        const userName = payload.user_name || payload.user_id || 'A user';
        const bookTitle = payload.book_title || payload.book_id || 'a book';
        const msg = `${userName} borrowed "${bookTitle}"`;
        addStaffNotification({ message: msg, type: 'borrow', ts, details: payload });
    } else if (payload.type === 'return' || payload.type === 'markReturned') {
        const userName = payload.user_name || payload.user_id || 'A user';
        const bookTitle = payload.book_title || payload.book_id || 'a book';
        const msg = `${userName} returned "${bookTitle}"`;
        addStaffNotification({ message: msg, type: 'return', ts, details: payload });
    } else if (payload.type === 'addCopy') {
        const msg = `A copy was added for book ${payload.bookId}`;
        addStaffNotification({ message: msg, type: 'system', ts, details: payload });
    } else if (payload.type === 'removeCopy') {
        const msg = `A copy was removed for book ${payload.bookId}`;
        addStaffNotification({ message: msg, type: 'system', ts, details: payload });
    } else if (payload.type === 'editBook') {
        const msg = `Book updated: ${payload.bookId}`;
        addStaffNotification({ message: msg, type: 'system', ts, details: payload });
    }
}

function renderUI(searchStr = "") {
    renderProfilePanel();
    renderDashboard(searchStr);
}

function renderProfilePanel() {
    const user = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!user) return;

    profilePanel.innerHTML = `
        <div class="profile-summary">
            <!-- Profile picture removed -->
            <h3>${user.name}</h3>
            <div class="staff-id">Staff ID: ${user.id}</div>
        </div>
        <div class="staff-actions">
            <button onclick="showAddBook()" class="sidebar-btn">Add New Book</button>
            <button onclick="showManageMembers()" class="sidebar-btn">Manage Members</button>
            <button onclick="showOverdueBooks()" class="sidebar-btn">Overdue Books</button>
            <button onclick="showFines()" class="sidebar-btn">Manage Fines</button>
            <button onclick="showStaffNotificationsModal()" class="sidebar-btn">Notifications ${staffNotifications.length > 0 ? `(${staffNotifications.length})` : ''}</button>
        </div>
    `;
}

function renderDashboard(searchStr = "") {
    let filteredBooks = books;
    
    if (searchStr) {
        const searchLower = searchStr.toLowerCase();
        filteredBooks = books.filter(b => 
            b.title.toLowerCase().includes(searchLower) ||
            b.author.toLowerCase().includes(searchLower) ||
            b.category.toLowerCase().includes(searchLower)
        );
    }

    // Calculate total copies and books out
    const totalCopies = bookCopies.length;
    const booksOut = bookCopies.filter(bc => bc.status && bc.status.toLowerCase() !== 'available').length;

    mainDashboard.innerHTML = `
        <div class="dashboard-stats">
            <div class="stat-card">
                <h3>Total Books</h3>
                <p>${totalCopies}</p>
            </div>
            <div class="stat-card">
                <h3>Books Out</h3>
                <p>${booksOut}</p>
            </div>
            <div class="stat-card">
                <h3>Overdue</h3>
                <p>${getOverdueCount()}</p>
            </div>
        </div>
        <div class="books-table">
            <h3>Book Inventory</h3>
            <table>
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Author</th>
                        <th>Category</th>
                        <th>Total Copies</th>
                        <th>Available</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredBooks.map(book => `
                        <tr>
                            <td>${book.title}</td>
                            <td>${book.author}</td>
                            <td>${book.category}</td>
                            <td>${bookCopies.filter(bc => bc.book_id === book.id).length}</td>
                            <td>${bookCopies.filter(bc => bc.book_id === book.id && bc.status && bc.status.toLowerCase() === 'available').length}</td>
                            <td>
                                <button onclick="editBook('${book.id}')">Edit</button>
                                <button onclick="manageBookCopies('${book.id}')">Manage Copies</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function getOverdueCount() {
    const today = new Date();
    const twoWeeksAgo = new Date(today.getTime() - (14 * 24 * 60 * 60 * 1000));
    
    return transactions.filter(t => 
        (!t.return_date || t.return_date.trim() === '') &&
        new Date(t.borrow_date) < twoWeeksAgo
    ).length;
}

function showAddBook() {
    modalContent.innerHTML = `
        <h3>Add New Book</h3>
        <form id="addBookForm">
            <div class="form-group">
                <label>Title</label>
                <input type="text" id="bookTitle" required>
            </div>
            <div class="form-group">
                <label>Author</label>
                <input type="text" id="bookAuthor" required>
            </div>
            <div class="form-group">
                <label>Category</label>
                <select id="bookCategory" required>
                    ${categories.map(cat => 
                        `<option value="${cat.category_id}">${cat.category_name}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Number of Copies</label>
                <input type="number" id="bookCopies" min="1" value="1" required>
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="bookDescription" rows="3"></textarea>
            </div>
            <button type="submit">Add Book</button>
            <button type="button" onclick="closeModal()">Cancel</button>
        </form>
    `;
    modal.classList.remove('hidden');
    
    document.getElementById('addBookForm').onsubmit = (e) => {
        e.preventDefault();
        // Implementation for adding a new book
        alert('Add book feature will be implemented soon!');
        closeModal();
    };
}

function editBook(bookId) {
    const book = books.find(b => b.id === bookId);
    if (!book) return;

    modalContent.innerHTML = `
        <h3>Edit Book</h3>
        <form id="editBookForm">
            <div class="form-group">
                <label>Title</label>
                <input type="text" id="editTitle" value="${book.title}" required>
            </div>
            <div class="form-group">
                <label>Author</label>
                <input type="text" id="editAuthor" value="${book.author}" required>
            </div>
            <div class="form-group">
                <label>Category</label>
                <select id="editCategory" required>
                    ${categories.map(cat => 
                        `<option value="${cat.category_id}" ${book.category === cat.category_name ? 'selected' : ''}>
                            ${cat.category_name}
                        </option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="editDescription" rows="3">${book.description}</textarea>
            </div>
            <button type="submit">Save Changes</button>
            <button type="button" onclick="closeModal()">Cancel</button>
        </form>
    `;
    modal.classList.remove('hidden');
    
    document.getElementById('editBookForm').onsubmit = async (e) => {
        e.preventDefault();
        
        const updatedBook = {
            title: document.getElementById('editTitle').value,
            author: document.getElementById('editAuthor').value,
            category_id: document.getElementById('editCategory').value,
            description: document.getElementById('editDescription').value
        };

        try {
            const res = await fetch(`${API_BASE}/api/books/${bookId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedBook)
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to update book');
            }

            const success = await refreshData();
            if (!success) {
                throw new Error('Failed to refresh data after update');
            }
            closeModal();
            alert('Book updated successfully');
            try { localStorage.setItem('library::dataUpdate', JSON.stringify({ type: 'editBook', bookId, ts: Date.now() })); } catch (e) { console.warn('Unable to set storage event', e); }
        } catch (err) {
            alert(err.message || 'Error updating book');
        }
    };
}

function showManageMembers() {
    // Fetch members from backend and show in modal
    (async function(){
        modalContent.innerHTML = `<h3>Loading members...</h3>`;
        modal.classList.remove('hidden');
        try {
            const res = await fetch('/api/members');
            const members = await res.json();
            modalContent.innerHTML = `
                <h3>Members</h3>
                <button onclick="showAddMemberForm()">Add Member</button>
                <div class="members-list">
                    ${members.map(m => `
                        <div class="member-row">
                            <strong>${m.name}</strong> (${m.email}) - ${m.user_id}
                        </div>
                    `).join('')}
                </div>
                <button onclick="closeModal()">Close</button>
            `;
        } catch (err) {
            modalContent.innerHTML = `<p>Error loading members</p><button onclick="closeModal()">Close</button>`;
        }
    })();
}

function showAddMemberForm() {
    modalContent.innerHTML = `
        <h3>Add Member</h3>
        <form id="addMemberForm">
            <div class="form-group"><label>Name</label><input id="newMemberName" required /></div>
            <div class="form-group"><label>Email</label><input id="newMemberEmail" required /></div>
            <div class="form-group"><label>Password</label><input id="newMemberPassword" required type="password"/></div>
            <button type="submit">Create</button>
            <button type="button" onclick="showManageMembers()">Cancel</button>
        </form>
    `;
    document.getElementById('addMemberForm').onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('newMemberName').value.trim();
        const email = document.getElementById('newMemberEmail').value.trim();
        const password = document.getElementById('newMemberPassword').value;
        try {
            const res = await fetch('/api/members', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, email, password }) });
            const created = await res.json();
            alert('Member created: ' + created.user_id);
            showManageMembers();
        } catch (err) {
            alert('Unable to create member');
        }
    };
}

function showOverdueBooks() {
    (async function(){
        modalContent.innerHTML = `<h3>Loading overdue books...</h3>`;
        modal.classList.remove('hidden');
        try {
            const res = await fetch('/api/overdue');
            const list = await res.json();
            modalContent.innerHTML = `
                <h3>Overdue Books</h3>
                <div class="overdue-list">
                    ${list.map(item => `
                        <div class="overdue-row">
                            <strong>${item.book_title}</strong> - ${item.user_name} (${item.email})
                            <div>Borrowed: ${new Date(item.borrow_date).toLocaleDateString()} | Due: ${new Date(item.due_date).toLocaleDateString()}</div>
                            <div>
                                <button onclick="markReturned('${item.transaction_id}')">Mark Returned</button>
                                <button onclick="addFinePrompt('${item.transaction_id}', '${item.user_id}')">Add Fine</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button onclick="closeModal()">Close</button>
            `;
        } catch (err) {
            modalContent.innerHTML = `<p>Error loading overdue</p><button onclick="closeModal()">Close</button>`;
        }
    })();
}

async function markReturned(transactionId) {
    const confirmReturn = confirm('Mark this transaction as returned?');
    if (!confirmReturn) return;
    try {
        const res = await fetch('/api/transactions/return', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ transaction_id: transactionId }) });
        let json = null;
        try {
            json = await res.json();
        } catch (parseErr) {
            const txt = await res.text().catch(() => '');
            console.error('Failed to parse JSON response for markReturned:', parseErr, 'text:', txt);
            if (!res.ok) {
                alert('Unable to mark returned: ' + (res.statusText || txt || 'Unknown error'));
                return;
            }
        }

        if (!res.ok) {
            const errMsg = (json && (json.error || json.message)) || res.statusText || 'Unknown error';
            alert('Unable to mark returned: ' + errMsg);
            return;
        }

        alert('Marked returned');
        // Refresh data first so we can lookup details
        try {
            await refreshData();
        } catch (e) { /* ignore */ }
        // Attempt to build richer payload with user and book info
        (async function(){
            try {
                const tx = transactions.find(t => (t.transaction_id || t.transactionid) === transactionId);
                let userName = '';
                let bookTitle = '';
                if (tx) {
                    // fetch members to find user name
                    try {
                        const usersRes = await fetch('/api/members');
                        const users = await usersRes.json();
                        const u = users.find(x => (x.user_id || x.userId) === tx.user_id || x.user_id === tx.userid || x.user_id === tx.userId);
                        if (u) userName = u.name || '';
                    } catch (e) { /* ignore */ }
                    // find book via copy
                    try {
                        const copy = bookCopies.find(c => (c.copy_id || c.copyid) === tx.copy_id || c.copy_id === tx.copyid || c.copy_id === tx.copyId);
                        const book = books.find(b => b.id === (copy && (copy.book_id || copy.bookid)) || b.id === ('book_' + (copy && (copy.book_id || copy.bookid))));
                        if (book) bookTitle = book.title || '';
                    } catch (e) { /* ignore */ }
                }
                const payload = { type: 'markReturned', transaction_id: transactionId, user_name: userName, book_title: bookTitle, ts: Date.now() };
                try { localStorage.setItem('library::dataUpdate', JSON.stringify(payload)); } catch (e) { console.warn('Unable to set storage event', e); }
            } catch (err) {
                console.warn('Unable to build markReturned payload', err);
            }
        })();
        showOverdueBooks();
    } catch (err) {
        console.error('markReturned error', err);
        alert('Unable to mark returned: ' + (err && err.message ? err.message : String(err)));
    }
}

function addFinePrompt(transactionId, userId) {
    const amount = prompt('Enter fine amount (e.g., 5.00)');
    if (!amount) return;
    const reason = prompt('Reason for fine (optional)') || '';
    (async function(){
        try {
            const res = await fetch('/api/transactions/return', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ transaction_id: transactionId, fine_amount: amount, fine_reason: reason }) });
            const json = await res.json();
            alert('Fine added');
            showOverdueBooks();
        } catch (err) {
            alert('Unable to add fine');
        }
    })();
}

function showFines() {
    (async function(){
        modalContent.innerHTML = `<h3>Loading fines...</h3>`;
        modal.classList.remove('hidden');
        try {
            const res = await fetch('/api/fines');
            const items = await res.json();
            modalContent.innerHTML = `
                <h3>Fines</h3>
                <div class="fines-list">
                    ${items.map(f => `
                        <div class="fine-row">
                            <strong>${f.fine_id}</strong> - User: ${f.user_id} - $${f.amount} - Paid: ${f.payment_date || 'No'}
                            <div>Reason: ${f.fine_reason || ''}</div>
                            <div>
                                ${f.payment_date ? '' : `<button onclick="markFinePaid('${f.fine_id}')">Mark Paid</button>`}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button onclick="closeModal()">Close</button>
            `;
        } catch (err) {
            modalContent.innerHTML = `<p>Error loading fines</p><button onclick="closeModal()">Close</button>`;
        }
    })();
}

async function markFinePaid(fineId) {
    const confirmPay = confirm('Mark fine as paid?');
    if (!confirmPay) return;
    try {
        const res = await fetch(`/api/fines/${fineId}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ payment_date: new Date().toISOString().slice(0,10) }) });
        const json = await res.json();
        alert('Fine updated');
        showFines();
    } catch (err) {
        alert('Unable to update fine');
    }
}

function closeModal() {
    modal.classList.add('hidden');
}

function manageBookCopies(bookId) {
    const book = books.find(b => b.id === bookId);
    if (!book) return;
    
    // Get real-time copy information
    const bookId2 = bookId.replace('book_', ''); // Handle any prefix if present
    const availableCopies = bookCopies.filter(bc => (bc.book_id === bookId || bc.book_id === bookId2) && bc.status === 'available');
    const checkedOutCopies = bookCopies.filter(bc => (bc.book_id === bookId || bc.book_id === bookId2) && bc.status !== 'available');
    
    modalContent.innerHTML = `
        <h3>Manage Copies - ${book.title}</h3>
        <div class="copies-management">
            <div class="copies-summary">
                <p>Total Copies: ${book.total}</p>
                <p>Available: ${availableCopies.length}</p>
                <p>Checked Out: ${checkedOutCopies.length}</p>
            </div>
            <div class="copies-actions">
                <button onclick="addBookCopy('${bookId}')" class="action-btn">Add New Copy</button>
            </div>
            <div class="copies-list">
                <h4>Available Copies</h4>
                ${availableCopies.map(copy => `
                    <div class="copy-item">
                        <span>Copy ID: ${copy.copy_id}</span>
                        <span>Location: ${copy.location}</span>
                        <button onclick="removeBookCopy('${bookId}', '${copy.copy_id}')" class="danger-btn">Remove</button>
                    </div>
                `).join('')}
                
                <h4>Checked Out Copies</h4>
                ${checkedOutCopies.map(copy => `
                    <div class="copy-item">
                        <span>Copy ID: ${copy.copy_id}</span>
                        <span>Status: ${copy.status}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        <button onclick="closeModal()">Close</button>
    `;
    modal.classList.remove('hidden');
}

async function addBookCopy(bookId) {
    try {
        const res = await fetch(`${API_BASE}/api/books/copies`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ book_id: bookId, action: 'add' })
        });
        
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Failed to add copy');
        }

        const data = await res.json();
        if (data.success) {
            // Update local data immediately
            const book = books.find(b => b.id === bookId);
            if (book) {
                book.total = data.total;
                book.available = data.available;
            }
            
            // Update UI immediately
            renderUI();
            alert('New copy added successfully');
            manageBookCopies(bookId);
            
            // Refresh all data in background
            refreshData();
            try { localStorage.setItem('library::dataUpdate', JSON.stringify({ type: 'addCopy', bookId, ts: Date.now() })); } catch (e) { console.warn('Unable to set storage event', e); }
        } else {
            throw new Error('Failed to add copy');
        }
    } catch (err) {
        console.error('Error adding copy:', err);
        alert(err.message || 'Error adding copy');
    }
}

async function removeBookCopy(bookId, copyId) {
    if (!confirm('Are you sure you want to remove this copy?')) return;
    
    try {
        const res = await fetch(`${API_BASE}/api/books/copies`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ book_id: bookId, action: 'remove', copy_id: copyId })
        });
        
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Failed to remove copy');
        }

        const data = await res.json();
        if (data.success) {
            // Update local data immediately
            const book = books.find(b => b.id === bookId);
            if (book) {
                book.total = data.total;
                book.available = data.available;
            }
            
            // Update UI immediately
            renderUI();
            alert('Copy removed successfully');
            manageBookCopies(bookId);
            
            // Refresh all data in background
            refreshData();
            try { localStorage.setItem('library::dataUpdate', JSON.stringify({ type: 'removeCopy', bookId, ts: Date.now() })); } catch (e) { console.warn('Unable to set storage event', e); }
        } else {
            throw new Error('Failed to remove copy');
        }
    } catch (err) {
        console.error('Error removing copy:', err);
        alert(err.message || 'Error removing copy');
    }
}

async function refreshData() {
    try {
        const success = await loadData();
        if (!success) {
            throw new Error('Failed to refresh data');
        }
        renderUI();
    } catch (err) {
        console.error('Error refreshing data:', err);
        alert(`Error refreshing data: ${err.message}`);
    }
}

// Add search functionality
document.getElementById('searchBar').addEventListener('input', (e) => {
    renderUI(e.target.value.trim());
});