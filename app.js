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

    // 2. Initialize Auth Module
    if (window.App.Auth) {
        const authInitialized = await window.App.Auth.init();
        if (authInitialized) {
            checkUserSession();
        } else {
            showAuthError();
        }
    } else {
        console.error("Auth module not found!");
    }

    setupEventListeners();
});

// Show configuration error on screen
function showConfigError() {
    const body = document.body;
    body.innerHTML = `
        <div style="background-color: #0b0f19; color: #fff; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: sans-serif; text-align: center; padding: 20px;">
            <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
            <h2 style="color: #ff5252; margin-bottom: 10px;">Supabase কনফিগার করা হয়নি, config.js চেক করুন</h2>
            <p style="color: #9ca3af; font-size: 14px;">দয়া করে config.js ফাইলে আপনার সঠিক Supabase URL এবং Key বসিয়ে আবার আপলোড করুন।</p>
        </div>
    `;
}

// Show auth initialization error
function showAuthError() {
    console.error("Failed to initialize authentication.");
}

// Check if user is logged in and route accordingly
async function checkUserSession() {
    const splashScreen = document.getElementById('splash-screen');
    const authScreen = document.getElementById('auth-screen');
    const appScreen = document.getElementById('app-screen');

    // Hide splash screen after a short delay
    setTimeout(() => {
        if (splashScreen) splashScreen.style.display = 'none';

        if (window.App.Auth.currentUser && window.App.Auth.currentProfile) {
            const profile = window.App.Auth.currentProfile;
            
            if (profile.status === 'approved') {
                if (authScreen) authScreen.classList.add('hidden');
                if (appScreen) appScreen.classList.remove('hidden');
                // Load dashboard data
                if (window.App.Data && typeof window.App.Data.initDashboard === 'function') {
                    window.App.Data.initDashboard();
                }
            } else {
                // Pending approval
                showPendingScreen();
            }
        } else {
            // Show Auth/Login screen
            if (authScreen) authScreen.classList.remove('hidden');
            if (appScreen) appScreen.classList.add('hidden');
        }
    }, 1000);
}

// Setup global event listeners for UI forms
function setupEventListeners() {
    const authForm = document.getElementById('auth-form');
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const identifierInput = document.getElementById('auth-identifier');
            const passwordInput = document.getElementById('auth-password');
            const fullNameInput = document.getElementById('auth-fullname');
            const isSignUp = document.getElementById('auth-mode-title')?.innerText.includes('Sign Up') || false;

            const identifier = identifierInput ? identifierInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value.trim() : '';
            const fullName = fullNameInput ? fullNameInput.value.trim() : '';

            if (!identifier || !password) {
                alert('দয়া করে ইউজারনেম এবং পাসওয়ার্ড দিন।');
                return;
            }

            const result = await window.App.Auth.handleAuthSubmit(identifier, password, isSignUp, fullName);
            
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

    // Logout button handler
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await window.App.Auth.signOut();
            window.location.reload();
        });
    }
}

// Show pending approval notice
function showPendingScreen() {
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) {
        authScreen.innerHTML = `
            <div style="background-color: #0b0f19; color: #fff; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: sans-serif; text-align: center; padding: 20px;">
                <div style="font-size: 48px; margin-bottom: 20px;">⏳</div>
                <h2 style="color: #fbbf24; margin-bottom: 10px;">অ্যাকাউন্ট অনুমোদনের অপেক্ষায় আছে</h2>
                <p style="color: #9ca3af; font-size: 14px; max-width: 400px; margin-bottom: 20px;">আপনার অ্যাকাউন্টটি সফলভাবে তৈরি হয়েছে। অ্যাডমিন কর্তৃক অনুমোদিত হওয়ার পর আপনি অ্যাপে প্রবেশ করতে পারবেন।</p>
                <button onclick="window.App.Auth.signOut().then(() => window.location.reload())" style="background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold;">লগআউট করুন</button>
            </div>
        `;
    }
}