/**
 * ==========================================
 * RCIVE DAILY - MAIN APPLICATION CONTROLLER
 * ==========================================
 */

window.App = window.App || {};
const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
    console.log("RciveDaily initializing...");

    // Critical 8: Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW Reg Failed:', err));
    }

    if (!window.App.Config || !window.App.Config.isConfigured()) {
        showConfigError();
        return;
    }

    if (window.App.Auth) {
        await window.App.Auth.init();
    } else {
        console.error("Auth module not found!");
    }

    checkUserSession();
    setupEventListeners();
});

function showConfigError() {
    $('splashScreen').style.display = 'none';
    $('configErrorScreen').classList.remove('hidden');
}

// Check if user is logged in and route accordingly
async function checkUserSession() {
    setTimeout(async () => {
        $('splashScreen').style.display = 'none';

        if (window.App.Auth && window.App.Auth.currentUser && window.App.Auth.currentProfile) {
            const profile = window.App.Auth.currentProfile;
            
            if (profile.status === 'approved') {
                $('authScreen')?.classList.add('hidden');
                $('mainApp')?.classList.remove('hidden');
                
                // Critical 4: Show navigation elements
                $('fabContainer')?.classList.replace('hidden', 'flex');
                $('bottomNav')?.classList.replace('hidden', 'flex');

                // Critical 1 & 2: Init Dashboard logic
                $('headerUsername').textContent = `@${profile.username}`;
                
                if (App.UI && typeof App.UI.renderMonthSelector === 'function') {
                    App.UI.renderMonthSelector();
                }
                if (App.Data) {
                    await App.Data.loadInitialData();
                    await App.Data.loadMonthData($('monthSelector').value);
                }
            } else {
                $('pendingScreen')?.classList.remove('hidden');
            }
        } else {
            $('authScreen')?.classList.remove('hidden');
            $('mainApp')?.classList.add('hidden');
        }
    }, 800);
}

// Setup global event listeners (Critical 3, 5, 6 Fixes)
function setupEventListeners() {
    
    // --- AUTHENTICATION EVENTS ---
    const processAuth = async () => {
        const identifier = $('authUsername')?.value.trim() || '';
        const password = $('authPassword')?.value || '';
        const isSignUp = $('authTitleText')?.innerText.includes('সাইন আপ') || false;

        if (!identifier || !password) {
            alert('দয়া করে ইউজারনেম এবং পাসওয়ার্ড দিন।');
            return;
        }

        // Password Confirm Check (High Fix)
        if (isSignUp) {
            const confirmPwd = $('authPasswordConfirm')?.value || '';
            if (password !== confirmPwd) {
                alert('পাসওয়ার্ড দুটি মিলছে না!');
                return;
            }
        }

        const btn = $('authSubmitBtn');
        if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> অপেক্ষা করুন...'; }
        
        const result = await window.App.Auth.handleAuthSubmit(identifier, password, isSignUp);
        
        if(btn) { btn.disabled = false; btn.innerHTML = isSignUp ? '<i class="fa-solid fa-user-plus"></i> অ্যাকাউন্ট তৈরি করুন' : '<i class="fa-solid fa-arrow-right-to-bracket"></i> প্রবেশ করুন'; }

        if (result.success) {
            if (isSignUp) {
                alert(result.message);
                window.location.reload();
            } else {
                checkUserSession();
            }
        } else {
            alert('ব্যর্থ হয়েছে: ' + result.message);
        }
    };

    $('authForm')?.addEventListener('submit', (e) => { e.preventDefault(); processAuth(); });
    $('authSubmitBtn')?.addEventListener('click', (e) => { e.preventDefault(); processAuth(); });

    $('authToggleBtn')?.addEventListener('click', () => {
        const title = $('authTitleText');
        const btn = $('authSubmitBtn');
        const confirmGroup = $('authConfirmGroup');
        
        if (title.innerText.includes('লগইন')) {
            title.innerText = 'সাইন আপ';
            btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> অ্যাকাউন্ট তৈরি করুন';
            $('authToggleBtn').innerText = 'লগইন করতে এখানে ক্লিক করুন';
            confirmGroup?.classList.remove('hidden');
            $('authPasswordConfirm').setAttribute('required', 'true');
        } else {
            title.innerText = 'লগইন';
            btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> প্রবেশ করুন';
            $('authToggleBtn').innerText = 'অ্যাকাউন্ট নেই? নতুন তৈরি করুন';
            confirmGroup?.classList.add('hidden');
            $('authPasswordConfirm').removeAttribute('required');
        }
    });

    $('authTogglePasswordBtn')?.addEventListener('click', () => {
        const pwdInput = $('authPassword');
        if (pwdInput.type === 'password') {
            pwdInput.type = 'text';
            $('authTogglePasswordBtn').innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
        } else {
            pwdInput.type = 'password';
            $('authTogglePasswordBtn').innerHTML = '<i class="fa-solid fa-eye"></i>';
        }
    });

    // Critical 6 Fix: Distinct handlers for both logout buttons
    $('menuLogoutBtn')?.addEventListener('click', async () => {
        await window.App.Auth.signOut(); window.location.reload();
    });
    $('pendingLogoutBtn')?.addEventListener('click', async () => {
        await window.App.Auth.signOut(); window.location.reload();
    });

    // --- UI NAVIGATION & MODALS ---
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if(App.UI) App.UI.switchTab(e.currentTarget.dataset.target);
        });
    });

    $('fabBtn')?.addEventListener('click', () => { if(App.UI) App.UI.openEntryModal(); });
    $('closeEntryModalBtn')?.addEventListener('click', () => { if(App.UI) App.UI.closeEntryModal(); });
    $('closeEditModalBtn')?.addEventListener('click', () => { if(App.UI) App.UI.closeEditModal(); });
    
    // Critical 5 Fix: Entry Type Radio Change Listener
    document.querySelectorAll('input[name="entryTypeRadio"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val === 'meal') {
                $('entryTxnFields').classList.add('hidden');
                $('entryMealFields').classList.remove('hidden');
            } else if (val === 'transfer') {
                $('entryTxnFields').classList.remove('hidden');
                $('entryMealFields').classList.add('hidden');
                $('categoryContainer').classList.add('hidden');
                $('transferToContainer').classList.remove('hidden');
                $('walletCategoryRow').classList.replace('grid-cols-2', 'grid-cols-1');
            } else {
                $('entryTxnFields').classList.remove('hidden');
                $('entryMealFields').classList.add('hidden');
                $('categoryContainer').classList.remove('hidden');
                $('transferToContainer').classList.add('hidden');
                $('walletCategoryRow').classList.replace('grid-cols-1', 'grid-cols-2');
            }
            if(App.UI) App.UI.populateDropdowns();
        });
    });

    // Month Selector Listener
    $('monthSelector')?.addEventListener('change', async (e) => {
        if(App.Data) await App.Data.loadMonthData(e.target.value);
    });

    // Handle Main Entry Submission (Prevents Double Tap)
    $('entryForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('entrySubmitBtn');
        if(btn) btn.disabled = true;
        
        try {
            const type = document.querySelector('input[name="entryTypeRadio"]:checked').value;
            const date = $('entryDate').value;

            if (type === 'meal') {
                await App.Data.saveMeal({
                    date: date,
                    breakfast: $('mealB').value,
                    lunch: $('mealL').value,
                    dinner: $('mealD').value
                });
            } else {
                await App.Data.saveTransaction({
                    date: date,
                    type: type,
                    amount: $('entryAmount').value,
                    wallet_id: $('entryWallet').value,
                    to_wallet_id: type === 'transfer' ? $('entryToWallet').value : null,
                    category_id: type === 'transfer' ? null : $('entryCategory').value,
                    notes: $('entryNotes').value
                }, $('entryReceipt').files[0]);
            }
            if(App.UI) { App.UI.closeEntryModal(); App.UI.showToast('এন্ট্রি সেভ হয়েছে!'); }
        } catch(err) {
            if(App.UI) App.UI.showToast(err.message, 'error');
        } finally {
            if(btn) btn.disabled = false;
        }
    });

    // --- EXPORT, PLANNING & SETTINGS BINDINGS ---
    $('exportPdfBtn')?.addEventListener('click', () => { if(App.Export) App.Export.downloadPDF(); });
    $('exportExcelBtn')?.addEventListener('click', () => { if(App.Export) App.Export.exportSpreadsheet('xlsx'); });
    $('exportCsvBtn')?.addEventListener('click', () => { if(App.Export) App.Export.exportSpreadsheet('csv'); });
    $('backupBtn')?.addEventListener('click', () => { if(App.Export) App.Export.downloadJSONBackup(); });
    $('restoreBtn')?.addEventListener('change', (e) => { 
        if(e.target.files.length > 0 && App.Export) {
            App.Export.restoreJSONBackup(e.target.files[0]);
            e.target.value = ''; // reset input
        }
    });

    $('saveBudgetBtn')?.addEventListener('click', async () => {
        const v = $('budgetInput').value;
        await App.Data.updateSettings({ monthly_budget: v ? Number(v) : null });
        App.UI.showToast('বাজেট সেভ হয়েছে');
        App.UI.renderPlanning();
    });

    $('saveSavingsBtn')?.addEventListener('click', async () => {
        const v = $('savingsGoalInput').value;
        await App.Data.updateSettings({ savings_goal: v ? Number(v) : null });
        App.UI.showToast('সঞ্চয়ের লক্ষ্য সেভ হয়েছে');
        App.UI.renderPlanning();
    });

    $('addCategoryBtn')?.addEventListener('click', async () => {
        const name = $('newCategoryName').value.trim();
        const type = $('newCategoryType').value;
        const isBazar = $('newCategoryBazar').checked;
        if(!name) return;
        try {
            await App.Data.addCategory(name, type, isBazar);
            $('newCategoryName').value = ''; $('newCategoryBazar').checked = false;
            App.UI.showToast('নতুন ক্যাটাগরি যুক্ত হয়েছে');
            App.UI.populateDropdowns(); App.UI.renderSettings();
        } catch(err) { App.UI.showToast(err.message, 'error'); }
    });
    
    $('saveOpeningBalancesBtn')?.addEventListener('click', async () => {
        const inputs = document.querySelectorAll('.wallet-opening-input');
        try {
            for (const inp of inputs) {
                await App.Data.updateWalletOpeningBalance(inp.dataset.id, Number(inp.value));
            }
            App.UI.showToast('ওপেনিং ব্যালেন্স আপডেট হয়েছে');
        } catch(err) { App.UI.showToast(err.message, 'error'); }
    });

    $('themeToggleBtn')?.addEventListener('click', () => {
        const html = document.documentElement;
        html.classList.toggle('dark');
        const isDark = html.classList.contains('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        localStorage.setItem('theme_override', 'true');
        $('themeToggleBtn').innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    });

} // End of setupEventListeners()