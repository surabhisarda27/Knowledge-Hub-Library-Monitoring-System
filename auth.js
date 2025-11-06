// Utility to call backend API
async function callApi(path, method = 'GET', body) {
    try {
        const opts = { method, headers: {} };
        if (body) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        const res = await fetch(path, opts);
        if (!res.ok) throw new Error('Network response was not ok');
        return await res.json();
    } catch (err) {
        console.error('callApi error', err);
        return null;
    }
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
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        alert('Please fill in all fields');
        return;
    }

    if (!isValidEmail(email)) {
        alert('Please enter a valid email address');
        return;
    }

    try {
        let list = [];
        // Try API first
        const apiPath = role === 'member' ? '/api/members' : '/api/staff';
        const apiList = await callApi(apiPath);
        
        if (Array.isArray(apiList)) {
            list = apiList;
        } else {
            // Fallback to CSV
            const csvPath = role === 'member' ? 'csv_files/Users.csv' : 'csv_files/Staff.csv';
            const response = await fetch(csvPath);
            const csvText = await response.text();
            list = await parseCSV(csvText);
        }

        if (!Array.isArray(list) || list.length === 0) {
            alert('Unable to load user data. Please try again.');
            return;
        }

        const user = list.find(u => {
            const userEmail = (u.email || '').trim().toLowerCase();
            const userPass = (u.password || '').trim();
            return userEmail === email.toLowerCase() && userPass === password;
        });
        if (user) {
            const userData = {
                id: user.user_id || user.staff_id || user.id,
                name: user.name || user.staff_name || user.name,
                email: user.email,
                role: role
            };
            sessionStorage.setItem('currentUser', JSON.stringify(userData));
            window.location.href = role === 'member' ? 'member-dashboard.html' : 'staff-dashboard.html';
        } else {
            alert('Invalid credentials');
        }
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