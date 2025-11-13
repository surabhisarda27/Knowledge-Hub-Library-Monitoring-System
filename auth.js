// Utility to call backend API. Tries multiple candidate base URLs to support
// deployments where the API is hosted on a different origin (e.g., Render).
async function callApi(path, method = 'GET', body) {
    const opts = { method, headers: {} };
    if (body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }

    // Candidate endpoints to try, in order.
    const candidates = [];
    // 1) Raw path (works when frontend and API are served from same origin)
    candidates.push(path);
    // 2) location.origin + path (explicit same-origin absolute URL)
    try { candidates.push(location.origin.replace(/\/+$/, '') + (path.startsWith('/') ? '' : '/') + path); } catch(e) {}
    // 3) window.API_BASE if provided by deployment (e.g., injected by Render)
    if (window && window.API_BASE) {
        const base = String(window.API_BASE).replace(/\/+$/, '');
        candidates.push(base + (path.startsWith('/') ? path : '/' + path));
    }

    let lastErr = null;
    for (const candidate of candidates) {
        try {
            const res = await fetch(candidate, opts);
            if (!res.ok) {
                lastErr = new Error(`Request failed (${res.status}) for ${candidate}`);
                continue;
            }
            return await res.json();
        } catch (err) {
            lastErr = err;
            // try next candidate
        }
    }

    console.error('callApi error - all candidates failed', lastErr);
    return null;
}

// Minimal CSV parser used as a fallback on the login page when Aiml.js
// (which contains a more complete parser) isn't loaded.
function parseCSV(text) {
    if (!text) return [];
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

// Function to toggle between login and signup forms
function toggleForms() {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    loginForm.classList.toggle('hidden');
    signupForm.classList.toggle('hidden');
}

// Function to validate email format
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Function to handle login
async function login(role) {
    // Demo credentials short-circuit: if the entered identity/password match a demo account
    // allow login without checking CSV or API. This makes the demo credentials usable by anyone.
    const DEMO_CREDENTIALS = [
        { id: 'S_DEMO', email: 'demo.staff@library.com', password: 'staffdemo', role: 'staff', name: 'Demo Staff' },
        { id: 'U_DEMO', email: 'demo.member@library.com', password: 'memberdemo', role: 'member', name: 'Demo Member' }
    ];
    // If role is not provided (single button), try staff first then member
    const identity = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!identity || !password) {
        alert('Please fill in all fields');
        return;
    }

    // If the user typed an email-like string validate it, otherwise allow staff id
    if (identity.includes('@') && !isValidEmail(identity)) {
        alert('Please enter a valid email address');
        return;
    }

    // Helper to attempt login against a list (array of user objects)
    const attemptMatch = (list, roleName) => {
        if (!Array.isArray(list)) return null;
        const lowerIdentity = identity.toLowerCase();
        return list.find(u => {
            const userEmail = (u.email || '').toString().trim().toLowerCase();
            const userPass = (u.password || u.pass || '').toString().trim();
            const userId = (u.user_id || u.staff_id || u.id || '').toString().trim();
            // match by email (if identity looks like email) or by id
            const matchByEmail = identity.includes('@') ? (userEmail === lowerIdentity) : false;
            const matchById = (!identity.includes('@')) ? (userId === identity) : false;
            return (matchByEmail || matchById) && userPass === password;
        });
    };

    // Check demo credentials first and short-circuit
    try {
        for (const d of DEMO_CREDENTIALS) {
            if ((identity && (identity.toLowerCase() === (d.email || '').toLowerCase() || identity === d.id)) && password === d.password) {
                const userData = { id: d.id, name: d.name, email: d.email, role: d.role };
                sessionStorage.setItem('currentUser', JSON.stringify(userData));
                // redirect immediately
                window.location.href = d.role === 'member' ? 'member-dashboard.html' : 'staff-dashboard.html';
                return;
            }
        }
    } catch (err) {
        console.warn('Demo check error', err);
    }

    try {
        // If role explicitly provided, only try that role
        const rolesToTry = role ? [role] : ['staff', 'member'];

        for (const r of rolesToTry) {
            let list = [];
            const apiPath = r === 'member' ? '/api/members' : '/api/staff';
            const apiList = await callApi(apiPath);
            if (Array.isArray(apiList) && apiList.length > 0) {
                list = apiList;
            } else {
                const csvPath = r === 'member' ? 'csv_files/Users.csv' : 'csv_files/Staff.csv';
                try {
                    const response = await fetch(csvPath);
                    const csvText = await response.text();
                    list = await parseCSV(csvText);
                } catch (e) {
                    list = [];
                }
            }

            const user = attemptMatch(list, r);
            if (user) {
                const userData = {
                    id: user.user_id || user.staff_id || user.id,
                    name: user.name || user.staff_name || user.name,
                    email: user.email,
                    role: r
                };
                sessionStorage.setItem('currentUser', JSON.stringify(userData));
                window.location.href = r === 'member' ? 'member-dashboard.html' : 'staff-dashboard.html';
                return;
            }
        }

        alert('Invalid credentials');
    } catch (error) {
        console.error('Login error:', error);
        alert('An error occurred during login. Please try again.');
    }
}

// Function to handle signup
async function signup(event) {
    event.preventDefault();
    
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!name || !email || !password || !confirmPassword) {
        alert('Please fill in all fields');
        return;
    }

    if (!isValidEmail(email)) {
        alert('Please enter a valid email address');
        return;
    }

    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }

    try {
        // call backend to create member
        const newUser = await callApi('/api/members', 'POST', { name, email, password });
        if (!newUser) {
            alert('Unable to create account right now');
            return;
        }
        alert('Account created successfully! Please login.');
        toggleForms();
        document.getElementById('signupForm').reset();
    } catch (error) {
        console.error('Signup error:', error);
        alert('An error occurred during signup. Please try again.');
    }
}

// Add event listeners
document.getElementById('signupForm').addEventListener('submit', signup);