/**
 * ==========================================
 * RCIVE DAILY - MAIN CONTROLLER (app.js)
 * ==========================================
 * Connects Auth, Data, UI, and Export layers.
 */

window.App = window.App || {};

(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);

    // 1. Initialize Supabase
    if (!App.Config || !App.Config.isConfigured()) {
        document.addEventListener('DOMContentLoaded', () => {
            $('splashScreen').classList.add('hidden');
            $('configErrorScreen').classList.remove('hidden');
        });
        return;
    }

    App.supabase = window.supabase.createClient(
        App.Config.SUPABASE_URL,
        App.Config.SUPABASE_ANON_KEY
    );

    // 2. Offline/Online Handling
    function updateOnlineStatus() {
        const offlineBanner = $('offlineBanner');
        if (navigator.onLine) {
            offlineBanner.classList.remove('is-visible');
            if (App.State && App.State.user) {
                App.Auth.checkSession(); // Retry syncing if came back online
            }
        } else {
            offlineBanner.classList.add('is-visible');
        }
    }
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // 3. Setup Event Listeners
    function setupEventListeners() {
        // --- Auth ---
        $('authForm').addEventListener('submit', App.Auth.handleAuthSubmit);
        $('authToggleBtn').addEventListener('click', App.Auth.toggleMode);
        $('pendingLogoutBtn').addEventListener('click', App.Auth.logout);
        
        $('authTogglePasswordBtn').addEventListener('click', () => {
            const input = $('authPassword');
            const icon = $('authTogglePasswordBtn').querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.replace('fa-eye-slash', 'fa-eye');
            }
        });

        // --- Navigation & Menu ---
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.dataset.target;
                App.UI.switchTab(target);
            });
        });

        $('monthSelector').addEventListener('change', async (e) => {
            await App.Data.loadMonthData(e.target.value);
        });

        $('headerMenuBtn').addEventListener('click', () => {
            $('contextMenu').classList.toggle('hidden');
        });
        
        document.addEventListener('click', (e) => {
            if (!$('headerMenuBtn').contains(e.target) && !$('contextMenu').contains(e.target)) {
                $('contextMenu').classList.add('hidden');
            }
        });

        $('menuLogoutBtn').addEventListener('click', App.Auth.logout);

        // --- Exports ---
        $('menuPdfBtn').addEventListener('click', () => {
            $('contextMenu').classList.add('hidden');
            App.Export.downloadPDF();
        });
        $('menuExcelBtn').addEventListener('click', () => {
            $('contextMenu').classList.add('hidden');
            App.Export.exportSpreadsheet('xlsx');
        });
        $('menuCsvBtn').addEventListener('click', () => {
            $('contextMenu').classList.add('hidden');
            App.Export.exportSpreadsheet('csv');
        });
        $('backupJsonBtn').addEventListener('click', App.Export.downloadJSONBackup);
        $('restoreJsonInput').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                App.Export.restoreJSONBackup(e.target.files[0]);
                e.target.value = ''; // reset
            }
        });

        // --- Theme ---
        $('themeToggleBtn').addEventListener('click', () => {
            const html = document.documentElement;
            html.classList.toggle('dark');
            const isDark = html.classList.contains('dark');
            
            localStorage.setItem('theme_override', 'true'); // user manually toggled
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            
            // Sync with DB settings if logged in
            if (App.State.user) {
                App.Data.updateSettings({ theme: isDark ? 'dark' : 'light' });
            }
            App.UI.renderCharts();
        });

        // --- Entry Modal Logic ---
        $('fabBtn').addEventListener('click', App.UI.openEntryModal);
        $('closeEntryModalBtn').addEventListener('click', App.UI.closeEntryModal);
        $('entryModalBackdrop').addEventListener('click', App.UI.closeEntryModal);

        const handleTypeChange = (e, prefix) => {
            const type = e.target.value;
            const txnFields = $(`${prefix}TxnFields`);
            const mealFields = $(`${prefix}MealFields`);
            const transferContainer = $(`${prefix}TransferToContainer`) || $(`transferToContainer`);
            const categoryContainer = $(`${prefix}CategoryContainer`) || $(`categoryContainer`);
            const walletCategoryRow = $(`${prefix}WalletCategoryRow`) || $(`walletCategoryRow`);

            if (type === 'meal') {
                txnFields.classList.add('hidden');
                mealFields.classList.remove('hidden');
            } else if (type === 'transfer') {
                txnFields.classList.remove('hidden');
                mealFields.classList.add('hidden');
                categoryContainer.classList.add('hidden');
                transferContainer.classList.remove('hidden');
                walletCategoryRow.classList.replace('grid-cols-2', 'grid-cols-1');
            } else {
                txnFields.classList.remove('hidden');
                mealFields.classList.add('hidden');
                categoryContainer.classList.remove('hidden');
                transferContainer.classList.add('hidden');
                walletCategoryRow.classList.replace('grid-cols-1', 'grid-cols-2');
            }
            App.UI.populateDropdowns();
        };

        document.querySelectorAll('input[name="entryTypeRadio"]').forEach(radio => {
            radio.addEventListener('change', (e) => handleTypeChange(e, 'entry'));
        });

        // Receipt label update
        $('entryReceipt').addEventListener('change', (e) => {
            const file = e.target.files[0];
            $('entryReceiptLabel').textContent = file ? file.name : 'রসিদ ছবি আপলোড (সর্বোচ্চ ২MB)';
        });
        $('editReceipt').addEventListener('change', (e) => {
            const file = e.target.files[0];
            $('editReceiptLabel').textContent = file ? file.name : 'নতুন রসিদ ছবি (ঐচ্ছিক)';
        });

        // Submit Entry Form
        $('entryForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = $('entrySubmitBtn');
            const type = document.querySelector('input[name="entryTypeRadio"]:checked').value;
            
            try {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> সেভ হচ্ছে...';

                if (type === 'meal') {
                    await App.Data.saveMeal({
                        date: $('entryDate').value,
                        breakfast: $('mealB').value,
                        lunch: $('mealL').value,
                        dinner: $('mealD').value
                    });
                } else {
                    const data = {
                        date: $('entryDate').value,
                        type: type,
                        amount: $('entryAmount').value,
                        wallet_id: $('entryWallet').value,
                        notes: $('entryNotes').value,
                        category_id: type !== 'transfer' ? $('entryCategory').value : null,
                        to_wallet_id: type === 'transfer' ? $('entryToWallet').value : null
                    };
                    const receiptFile = $('entryReceipt').files[0];
                    await App.Data.saveTransaction(data, receiptFile);
                }

                App.UI.closeEntryModal();
                App.UI.showToast('সফলভাবে সেভ হয়েছে!');
            } catch (err) {
                App.UI.showToast(err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-check"></i> সংরক্ষণ করুন';
            }
        });

        // --- Edit Modal Logic ---
        $('closeEditModalBtn').addEventListener('click', App.UI.closeEditModal);
        $('editModalBackdrop').addEventListener('click', App.UI.closeEditModal);

        $('editForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = $('editSubmitBtn');
            const id = $('editId').value;
            const type = $('editType').value;
            
            try {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> আপডেট হচ্ছে...';

                if (type === 'meal') {
                    await App.Data.saveMeal({
                        id: id,
                        date: $('editDate').value,
                        breakfast: $('editMealB').value,
                        lunch: $('editMealL').value,
                        dinner: $('editMealD').value
                    });
                } else {
                    const txnType = App.State.transactions.find(t => t.id === id)?.type || 'expense';
                    const data = {
                        id: id,
                        date: $('editDate').value,
                        type: txnType,
                        amount: $('editAmount').value,
                        wallet_id: $('editWallet').value,
                        notes: $('editNotes').value,
                        category_id: txnType !== 'transfer' ? $('editCategory').value : null,
                        to_wallet_id: txnType === 'transfer' ? $('editToWallet').value : null
                    };
                    
                    const receiptFile = $('editReceipt').files[0];
                    const existingReceipt = $('editOriginalReceipt').value;
                    const removeReceipt = $('editRemoveReceipt').checked;
                    
                    await App.Data.saveTransaction(data, receiptFile, existingReceipt, removeReceipt);
                }

                App.UI.closeEditModal();
                App.UI.showToast('সফলভাবে আপডেট হয়েছে!');
            } catch (err) {
                App.UI.showToast(err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-check"></i> আপডেট করুন';
            }
        });

        // --- Settings Forms ---
        $('addCategoryForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const name = $('newCategoryInput').value.trim();
                const type = $('newCategoryType').value;
                const isBazar = $('newCategoryIsBazar').checked;
                
                await App.Data.addCategory(name, type, isBazar);
                App.UI.showToast('ক্যাটাগরি যুক্ত হয়েছে!');
                $('addCategoryForm').reset();
                App.UI.populateDropdowns();
                App.UI.renderSettings();
            } catch (err) {
                App.UI.showToast(err.message, 'error');
            }
        });

        $('saveBudgetBtn').addEventListener('click', async () => {
            try {
                const val = $('budgetInput').value;
                await App.Data.updateSettings({ monthly_budget: val || 0 });
                App.UI.showToast('বাজেট সেভ হয়েছে!');
                App.UI.renderPlanning();
            } catch (err) {
                App.UI.showToast(err.message, 'error');
            }
        });

        $('saveSavingsBtn').addEventListener('click', async () => {
            try {
                const val = $('savingsGoalInput').value;
                await App.Data.updateSettings({ savings_goal: val || 0 });
                App.UI.showToast('সঞ্চয় টার্গেট সেভ হয়েছে!');
                App.UI.renderPlanning();
            } catch (err) {
                App.UI.showToast(err.message, 'error');
            }
        });

        $('saveOpeningBalancesBtn').addEventListener('click', async () => {
            try {
                const inputs = document.querySelectorAll('.wallet-opening-input');
                for (const input of inputs) {
                    await App.Data.updateWalletOpeningBalance(input.dataset.id, input.value || 0);
                }
                App.UI.showToast('প্রারম্ভিক ব্যালেন্স সেভ হয়েছে!');
                App.UI.renderPlanning();
                App.UI.renderDashboard();
            } catch (err) {
                App.UI.showToast(err.message, 'error');
            }
        });

        // Live search filters
        $('searchTxn').addEventListener('input', App.UI.renderLedger);
        $('filterTxnType').addEventListener('change', App.UI.renderLedger);

        // Update PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').then(reg => {
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            $('updateBanner').classList.remove('hidden');
                        }
                    });
                });
            });

            $('updateReloadBtn').addEventListener('click', () => {
                window.location.reload();
            });
        }
    }

    // 4. Boot App
    document.addEventListener('DOMContentLoaded', () => {
        updateOnlineStatus();
        setupEventListeners();
        
        // Ensure theme toggle matches initial state
        const isDark = document.documentElement.classList.contains('dark');
        $('themeToggleBtn').innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
        
        // Start Auth Lifecycle
        if (App.Auth && typeof App.Auth.checkSession === 'function') {
            App.Auth.checkSession();
        } else {
            console.error("App.Auth is not defined. Ensure app-auth.js is loaded.");
            App.UI.showToast('সিস্টেম লোড হতে সমস্যা হয়েছে!', 'error');
        }
    });

})();