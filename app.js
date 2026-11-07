/**
 * ==========================================
 * RCIVE DAILY - MAIN APPLICATION CONTROLLER
 * ==========================================
 */

window.App = window.App || {};

document.addEventListener('DOMContentLoaded', async () => {
    console.log("RciveDaily initializing...");

    // 1. Check Configuration
    if (!window.App.Config || !window.App.Config.isConfigured()) {
        showConfigError();
        return;
    }

    // 2. Initialize Auth Module with fallback
    let authInitialized = false;
    if (window.App.Auth) {
        try {
            authInitialized = await window.App.Auth.init();
        } catch (err) {
            console.error("Auth init exception:", err);
        }
    } else {
        console.error("Auth module not found!");
    }

    // Always proceed to check session or show auth screen
    checkUserSession();
    setupEventListeners();
});

// Show configuration error on screen
function showConfigError() {
    const splashScreen = document.getElementById('splashScreen');
    if (splashScreen) splashScreen.style.display = 'none';
    const configErr = document.getElementById('configErrorScreen');
    if (configErr) configErr.classList.remove('hidden');
}

// Check if user is logged in and route accordingly
async function checkUserSession() {
    const splashScreen = document.getElementById('splashScreen');
    const authScreen = document.getElementById('authScreen');
    const appScreen = document.getElementById('mainApp');

    // Hide splash screen after a short delay
    setTimeout(() => {
        if (splashScreen) splashScreen.style.display = 'none';

        if (window.App.Auth && window.App.Auth.currentUser && window.App.Auth.currentProfile) {
            const profile = window.App.Auth.currentProfile;
            
            if (profile.status === 'approved') {
                if (authScreen) authScreen.classList.add('hidden');
                if (appScreen) appScreen.classList.remove('hidden');
                if (window.App.Data && typeof window.App.Data.initDashboard === 'function') {
                    window.App.Data.initDashboard();
                }
            } else {
                showPendingScreen();
            }
        } else {
            // Show Auth/Login screen
            if (authScreen) authScreen.classList.remove('hidden');
            if (appScreen) appScreen.classList.add('hidden');
        }
    }, 800);
}



    // Password visibility toggle
    const togglePwdBtn = document.getElementById('authTogglePasswordBtn');
    if (togglePwdBtn) {
        togglePwdBtn.addEventListener('click', () => {
            const pwdInput = document.getElementById('authPassword');
            if (pwdInput.type === 'password') {
                pwdInput.type = 'text';
                togglePwdBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
            } else {
                pwdInput.type = 'password';
                togglePwdBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
            }
        });
    }

    // Logout button handler
    const logoutBtn = document.getElementById('menuLogoutBtn') || document.getElementById('pendingLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await window.App.Auth.signOut();
            window.location.reload();
        });
    }
}// Setup global event listeners for UI forms
function setupEventListeners() {
    const authForm = document.getElementById('authForm');
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const identifierInput = document.getElementById('authUsername');
            const passwordInput = document.getElementById('authPassword');
            const isSignUp = document.getElementById('authTitleText')?.innerText.includes('সাইন আপ') || false;

            const identifier = identifierInput ? identifierInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value.trim() : '';

            if (!identifier || !password) {
                alert('দয়া করে ইউজারনেম এবং পাসওয়ার্ড দিন।');
                return;
            }

            console.log("Submitting auth for:", identifier);
            const result = await window.App.Auth.handleAuthSubmit(identifier, password, isSignUp);
            
            if (result.success) {
                if (isSignUp) {
                    alert(result.message);
                    window.location.reload();
                } else {
                    checkUserSession();
                }
            } else {
                alert('লগইন ব্যর্থ হয়েছে: ' + result.message);
            }
        });
    }

    // Toggle between Login and Signup mode
    const toggleBtn = document.getElementById('authToggleBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const title = document.getElementById('authTitleText');
            const submitBtn = document.getElementById('authSubmitBtn');
            const confirmGroup = document.getElementById('authConfirmGroup');
            
            if (title.innerText.includes('লগইন')) {
                title.innerText = 'সাইন আপ';
                submitBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> অ্যাকাউন্ট তৈরি করুন';
                toggleBtn.innerText = 'লগইন করতে এখানে ক্লিক করুন';
                if (confirmGroup) confirmGroup.classList.remove('hidden');
            } else {
                title.innerText = 'লগইন';
                submitBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> প্রবেশ করুন';
                toggleBtn.innerText = 'অ্যাকাউন্ট নেই? নতুন তৈরি করুন';
                if (confirmGroup) confirmGroup.classList.add('hidden');
            }
        });
    }

    // Password visibility toggle
    const togglePwdBtn = document.getElementById('authTogglePasswordBtn');
    if (togglePwdBtn) {
        togglePwdBtn.addEventListener('click', () => {
            const pwdInput = document.getElementById('authPassword');
            if (pwdInput.type === 'password') {
                pwdInput.type = 'text';
                togglePwdBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
            } else {
                pwdInput.type = 'password';
                togglePwdBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
            }
        });
    }

    // Logout button handler
    const logoutBtn = document.getElementById('menuLogoutBtn') || document.getElementById('pendingLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await window.App.Auth.signOut();
            window.location.reload();
        });
    }
}

// Show pending approval notice
function showPendingScreen() {
    const pendingScreen = document.getElementById('pendingScreen');
    if (pendingScreen) pendingScreen.classList.remove('hidden');
}