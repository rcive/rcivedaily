/**
 * ==========================================
 * RCIVE DAILY - UI & RENDERING LAYER
 * ==========================================
 * Handles DOM manipulation, chart rendering, and formatting.
 */

window.App = window.App || {};
App.Charts = App.Charts || {};

const $ = (id) => document.getElementById(id);

App.UI = {
    // ----------------------------------------------------------------------
    // Helpers & Formatting
    // ----------------------------------------------------------------------
    escapeText: (str) => {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    formatMoney: (amount) => {
        return new Intl.NumberFormat('bn-BD', {
            style: 'currency',
            currency: 'BDT',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(amount || 0);
    },

    formatDate: (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' });
    },

    showToast: (message, type = 'success') => {
        const container = $('toastContainer');
        const toast = document.createElement('div');
        const isErr = type === 'error';
        
        toast.className = `glass-panel px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 toast-animate border-l-4 ${isErr ? 'border-rose-500' : 'border-emerald-500'} bg-white dark:bg-slate-900 pointer-events-auto`;
        toast.innerHTML = `<i class="fa-solid ${isErr ? 'fa-circle-exclamation text-rose-500' : 'fa-circle-check text-emerald-500'}"></i><span class="text-sm font-bold text-slate-800 dark:text-white">${App.UI.escapeText(message)}</span>`;
        
        container.prepend(toast);
        setTimeout(() => {
            toast.classList.replace('toast-animate', 'opacity-0');
            toast.style.transform = 'translateY(-10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // ----------------------------------------------------------------------
    // Navigation & Global UI
    // ----------------------------------------------------------------------
    switchTab: (tabId) => {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
        const target = $(`tab-${tabId}`);
        if (target) target.classList.remove('hidden');

        document.querySelectorAll('.nav-btn').forEach(btn => {
            if (btn.dataset.target === tabId) {
                btn.classList.add('text-emerald-500');
                btn.classList.remove('text-slate-400');
            } else {
                btn.classList.remove('text-emerald-500');
                btn.classList.add('text-slate-400');
            }
        });

        // Close context menu if open
        $('contextMenu').classList.add('hidden');
    },

    renderMonthSelector: () => {
        const select = $('monthSelector');
        select.innerHTML = '';
        const now = new Date();
        
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const val = d.toISOString().slice(0, 7); // YYYY-MM
            const label = d.toLocaleDateString('bn-BD', { month: 'long', year: 'numeric' });
            
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = label;
            if (i === 0) opt.selected = true;
            select.appendChild(opt);
        }
    },

    populateDropdowns: () => {
        const catSelect = $('entryCategory');
        const editCatSelect = $('editCategory');
        const walletSelect = $('entryWallet');
        const editWalletSelect = $('editWallet');
        const toWalletSelect = $('entryToWallet');
        const editToWalletSelect = $('editToWallet');

        // Reset
        [catSelect, editCatSelect, walletSelect, editWalletSelect, toWalletSelect, editToWalletSelect].forEach(el => el.innerHTML = '');

        // Only income/expense logic handles categories
        const currentType = document.querySelector('input[name="entryTypeRadio"]:checked')?.value || 'expense';
        const cats = App.State.categories.filter(c => c.type === (currentType === 'transfer' ? 'expense' : currentType)); // Transfer doesn't use category, fallback to avoid error

        cats.forEach(c => {
            const opt1 = new Option(c.name, c.id);
            const opt2 = new Option(c.name, c.id);
            catSelect.add(opt1);
            editCatSelect.add(opt2);
        });

        App.State.wallets.forEach(w => {
            const label = `${w.name} (${App.UI.formatMoney(w.balance)})`;
            walletSelect.add(new Option(label, w.wallet_id));
            editWalletSelect.add(new Option(label, w.wallet_id));
            toWalletSelect.add(new Option(label, w.wallet_id));
            editToWalletSelect.add(new Option(label, w.wallet_id));
        });
    },

    refreshAllViews: () => {
        App.UI.renderDashboard();
        App.UI.renderLedger();
        App.UI.renderMeals();
        App.UI.renderPlanning();
        App.UI.renderSettings();
    },

    // ----------------------------------------------------------------------
    // Tab Renders
    // ----------------------------------------------------------------------
    renderDashboard: () => {
        const { kpi } = App.State;
        
        $('kpiIncome').textContent = App.UI.formatMoney(kpi.income);
        $('kpiExpense').textContent = App.UI.formatMoney(kpi.expense);
        $('kpiSavings').textContent = App.UI.formatMoney(kpi.savings);
        $('kpiMealRate').textContent = App.UI.formatMoney(kpi.mealRate);
        $('kpiTotalMeals').textContent = kpi.totalMeals;

        const totalBal = App.State.wallets.reduce((sum, w) => sum + Number(w.balance), 0);
        $('kpiBalance').textContent = App.UI.formatMoney(totalBal);

        App.UI.renderCharts();
    },

    renderCharts: () => {
        // Prepare Data for Category Pie Chart (Expenses only)
        const expCats = {};
        App.State.transactions.filter(t => t.type === 'expense').forEach(t => {
            const cat = App.State.categories.find(c => c.id === t.category_id);
            const name = cat ? cat.name : 'Unknown';
            expCats[name] = (expCats[name] || 0) + Number(t.amount);
        });

        const catLabels = Object.keys(expCats);
        const catData = Object.values(expCats);
        const catColors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

        // Render Summary List next to Pie Chart
        const summaryList = $('categorySummaryList');
        summaryList.innerHTML = '';
        catLabels.forEach((label, idx) => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center text-xs font-bold p-2 glass-panel rounded-lg';
            div.innerHTML = `
                <div class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full" style="background-color: ${catColors[idx % catColors.length]}"></span>
                    <span>${App.UI.escapeText(label)}</span>
                </div>
                <span>${App.UI.formatMoney(catData[idx])}</span>
            `;
            summaryList.appendChild(div);
        });

        if (App.Charts.category) App.Charts.category.destroy();
        App.Charts.category = new Chart($('categoryChart'), {
            type: 'doughnut',
            data: { labels: catLabels, datasets: [{ data: catData, backgroundColor: catColors, borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '70%' }
        });

        // Prepare Data for 7-Day Trend Chart
        const today = new Date();
        const trendLabels = [];
        const trendIncome = [];
        const trendExpense = [];

        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            trendLabels.push(d.toLocaleDateString('bn-BD', { weekday: 'short' }));

            const dayTx = App.State.transactions.filter(t => t.date === dateStr);
            const dInc = dayTx.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
            const dExp = dayTx.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

            trendIncome.push(dInc);
            trendExpense.push(dExp);
        }

        if (App.Charts.trend) App.Charts.trend.destroy();
        const isDark = document.documentElement.classList.contains('dark');
        App.Charts.trend = new Chart($('trendChart'), {
            type: 'line',
            data: {
                labels: trendLabels,
                datasets: [
                    { label: 'আয়', data: trendIncome, borderColor: '#10b981', backgroundColor: '#10b98120', fill: true, tension: 0.4 },
                    { label: 'খরচ', data: trendExpense, borderColor: '#ef4444', backgroundColor: '#ef444420', fill: true, tension: 0.4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { border: { display: false }, grid: { color: isDark ? '#334155' : '#e2e8f0' } },
                    x: { border: { display: false }, grid: { display: false } }
                }
            }
        });
    },

    renderLedger: () => {
        const tbody = $('txnTableBody');
        tbody.innerHTML = '';
        
        const filterType = $('filterTxnType').value;
        const searchRaw = $('searchTxn').value.toLowerCase();
        
        let txns = App.State.transactions;
        if (filterType !== 'all') txns = txns.filter(t => t.type === filterType);
        if (searchRaw) {
            txns = txns.filter(t => (t.notes || '').toLowerCase().includes(searchRaw));
        }

        if (txns.length === 0) {
            $('txnEmptyState').classList.remove('hidden');
        } else {
            $('txnEmptyState').classList.add('hidden');
            
            txns.forEach(t => {
                const w1 = App.State.wallets.find(w => w.wallet_id === t.wallet_id)?.name || 'Unknown';
                const cat = App.State.categories.find(c => c.id === t.category_id)?.name || '';
                
                let sourceHTML = '';
                let amountClass = 'text-slate-800 dark:text-white';
                let amountPrefix = '';

                if (t.type === 'income') {
                    sourceHTML = `<span class="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-1 rounded text-[10px]">${App.UI.escapeText(w1)}</span>`;
                    amountClass = 'text-emerald-500';
                    amountPrefix = '+';
                } else if (t.type === 'expense') {
                    sourceHTML = `<span class="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 px-2 py-1 rounded text-[10px]">${App.UI.escapeText(w1)}</span>`;
                    amountClass = 'text-rose-500';
                    amountPrefix = '-';
                } else {
                    const w2 = App.State.wallets.find(w => w.wallet_id === t.to_wallet_id)?.name || 'Unknown';
                    sourceHTML = `<div class="flex items-center justify-center gap-1 text-[10px]"><span class="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">${App.UI.escapeText(w1)}</span><i class="fa-solid fa-arrow-right text-blue-500"></i><span class="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded">${App.UI.escapeText(w2)}</span></div>`;
                    amountClass = 'text-blue-500';
                }

                let receiptIcon = '';
                if (t.receipt_path) {
                    const url = App.supabase.storage.from('receipts').getPublicUrl(t.receipt_path).data.publicUrl;
                    receiptIcon = `<a href="${url}" target="_blank" class="text-blue-500 hover:text-blue-600" title="রসিদ দেখুন"><i class="fa-solid fa-paperclip"></i></a>`;
                }

                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors';
                
                tr.innerHTML = `
                    <td class="p-4 text-xs whitespace-nowrap">${App.UI.formatDate(t.date)}</td>
                    <td class="p-4">
                        <div class="flex items-center gap-2">
                            ${receiptIcon}
                            <div>
                                <p class="leading-tight">${t.type !== 'transfer' ? App.UI.escapeText(cat) : 'ট্রান্সফার'}</p>
                                ${t.notes ? `<p class="text-[10px] font-black text-slate-400">${App.UI.escapeText(t.notes)}</p>` : ''}
                            </div>
                        </div>
                    </td>
                    <td class="p-4 text-center">${sourceHTML}</td>
                    <td class="p-4 text-right whitespace-nowrap ${amountClass}">${amountPrefix}${App.UI.formatMoney(t.amount)}</td>
                    <td class="p-4 text-center space-x-2 no-print">
                        <button class="text-slate-400 hover:text-blue-500 transition-colors" onclick="App.UI.openEditModal('${t.id}', 'txn')" title="এডিট"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button class="text-slate-400 hover:text-rose-500 transition-colors" onclick="window.deleteTxn('${t.id}')" title="ডিলিট"><i class="fa-solid fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    },

    renderMeals: () => {
        const tbody = $('mealTableBody');
        tbody.innerHTML = '';

        if (App.State.meals.length === 0) {
            $('mealEmptyState').classList.remove('hidden');
            $('statBreakfast').textContent = '0';
            $('statLunch').textContent = '0';
            $('statDinner').textContent = '0';
        } else {
            $('mealEmptyState').classList.add('hidden');
            
            let bTotal = 0, lTotal = 0, dTotal = 0;
            
            App.State.meals.forEach(m => {
                bTotal += Number(m.breakfast);
                lTotal += Number(m.lunch);
                dTotal += Number(m.dinner);
                
                const total = Number(m.breakfast) + Number(m.lunch) + Number(m.dinner);
                
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors';
                tr.innerHTML = `
                    <td class="p-4 text-xs font-black text-left whitespace-nowrap">${App.UI.formatDate(m.date)}</td>
                    <td class="p-4 text-emerald-600 dark:text-emerald-400">${m.breakfast}</td>
                    <td class="p-4 text-blue-600 dark:text-blue-400">${m.lunch}</td>
                    <td class="p-4 text-indigo-600 dark:text-indigo-400">${m.dinner}</td>
                    <td class="p-4 text-amber-500 font-black">${total}</td>
                    <td class="p-4 no-print space-x-2">
                        <button class="text-slate-400 hover:text-blue-500 transition-colors" onclick="App.UI.openEditModal('${m.id}', 'meal')" title="এডিট"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button class="text-slate-400 hover:text-rose-500 transition-colors" onclick="window.deleteMeal('${m.id}')" title="ডিলিট"><i class="fa-solid fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            $('statBreakfast').textContent = bTotal;
            $('statLunch').textContent = lTotal;
            $('statDinner').textContent = dTotal;
        }
    },

    renderPlanning: () => {
        // Wallet Cards
        const wContainer = $('walletCardsContainer');
        wContainer.innerHTML = '';
        App.State.wallets.forEach(w => {
            const div = document.createElement('div');
            div.className = 'glass-panel p-4 rounded-xl flex flex-col justify-between';
            div.innerHTML = `
                <span class="text-[10px] font-black uppercase text-slate-500 mb-2 truncate">${App.UI.escapeText(w.name)}</span>
                <h4 class="text-sm font-black text-slate-800 dark:text-white truncate">${App.UI.formatMoney(w.balance)}</h4>
            `;
            wContainer.appendChild(div);
        });

        // Budget Tracker
        const budget = Number(App.State.settings.monthly_budget);
        $('budgetInput').value = budget > 0 ? budget : '';
        if (budget > 0) {
            const exp = App.State.kpi.expense;
            const pct = Math.min(100, Math.round((exp / budget) * 100));
            $('budgetPercentText').textContent = `${pct}% (${App.UI.formatMoney(exp)} / ${App.UI.formatMoney(budget)})`;
            $('budgetProgressBar').style.width = `${pct}%`;
            
            if (pct >= 100) {
                $('budgetProgressBar').classList.replace('bg-emerald-500', 'bg-rose-500');
                $('budgetWarningText').classList.remove('hidden');
            } else {
                $('budgetProgressBar').classList.replace('bg-rose-500', 'bg-emerald-500');
                $('budgetWarningText').classList.add('hidden');
            }
        } else {
            $('budgetPercentText').textContent = 'সেট করা নেই';
            $('budgetProgressBar').style.width = '0%';
            $('budgetWarningText').classList.add('hidden');
        }

        // Savings Tracker
        const savingsTarget = Number(App.State.settings.savings_goal);
        $('savingsGoalInput').value = savingsTarget > 0 ? savingsTarget : '';
        if (savingsTarget > 0) {
            const sav = App.State.kpi.savings;
            const pct = sav > 0 ? Math.min(100, Math.round((sav / savingsTarget) * 100)) : 0;
            $('savingsPercentText').textContent = `${pct}% (${App.UI.formatMoney(sav)} / ${App.UI.formatMoney(savingsTarget)})`;
            $('savingsProgressBar').style.width = `${pct}%`;
        } else {
            $('savingsPercentText').textContent = 'সেট করা নেই';
            $('savingsProgressBar').style.width = '0%';
        }
    },

    renderSettings: () => {
        // Categories
        const catContainer = $('settingsCategoryList');
        catContainer.innerHTML = '';
        App.State.categories.forEach(c => {
            const div = document.createElement('div');
            const typeColor = c.type === 'income' ? 'text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30' : 'text-rose-500 bg-rose-100 dark:bg-rose-900/30';
            const bazarBadge = c.is_bazar ? '<i class="fa-solid fa-basket-shopping text-[10px] ml-1 text-amber-500" title="বাজার খাত"></i>' : '';
            
            div.className = `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border border-transparent hover:border-rose-300 transition-colors ${typeColor}`;
            div.innerHTML = `
                <span>${App.UI.escapeText(c.name)}${bazarBadge}</span>
                <button type="button" onclick="window.deleteCat('${c.id}')" class="ml-1 text-rose-500 hover:text-rose-700 p-1" title="ডিলিট"><i class="fa-solid fa-xmark"></i></button>
            `;
            catContainer.appendChild(div);
        });

        // Wallet Opening Balances
        const wOpenList = $('walletOpeningList');
        wOpenList.innerHTML = '';
        App.State.wallets.forEach(w => {
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between gap-3 p-3 glass-panel rounded-xl';
            div.innerHTML = `
                <span class="text-xs font-bold w-24 truncate">${App.UI.escapeText(w.name)}</span>
                <input type="number" step="any" inputmode="decimal" class="wallet-opening-input flex-1 bg-transparent outline-none text-right font-black text-sm" data-id="${w.wallet_id}" value="${w.opening_balance}">
                <span class="text-xs font-black text-slate-400">৳</span>
            `;
            wOpenList.appendChild(div);
        });
    },

    // ----------------------------------------------------------------------
    // Modals
    // ----------------------------------------------------------------------
    openEntryModal: () => {
        $('entryForm').reset();
        
        // Auto-fill today's date if not set
        if (!$('entryDate').value) {
            $('entryDate').value = new Date().toISOString().split('T')[0];
        }
        
        // Trigger radio logic
        const ev = new Event('change');
        document.querySelector('input[name="entryTypeRadio"][value="expense"]').checked = true;
        document.querySelector('input[name="entryTypeRadio"][value="expense"]').dispatchEvent(ev);
        
        $('entryReceiptLabel').textContent = 'রসিদ ছবি আপলোড (সর্বোচ্চ ২MB)';
        $('entryModal').classList.remove('hidden');
        App.UI.populateDropdowns();
    },

    closeEntryModal: () => {
        $('entryModal').classList.add('hidden');
    },

    openEditModal: (id, type) => {
        $('editForm').reset();
        $('editId').value = id;
        $('editType').value = type;
        $('editOriginalReceipt').value = '';

        if (type === 'txn') {
            const txn = App.State.transactions.find(t => t.id === id);
            if (!txn) return;

            $('editTxnFields').classList.remove('hidden');
            $('editMealFields').classList.add('hidden');
            
            $('editDate').value = txn.date;
            $('editAmount').value = txn.amount;
            $('editNotes').value = txn.notes || '';
            
            if (txn.receipt_path) {
                $('editOriginalReceipt').value = txn.receipt_path;
                $('editReceiptLabel').textContent = 'আগের রসিদ আছে। নতুন দিলে পরিবর্তন হবে।';
            } else {
                $('editReceiptLabel').textContent = 'নতুন রসিদ ছবি আপলোড (ঐচ্ছিক)';
            }

            App.UI.populateDropdowns();

            // Adjust form for type
            if (txn.type === 'transfer') {
                $('editWalletCategoryRow').classList.remove('grid-cols-2');
                $('editWalletCategoryRow').classList.add('grid-cols-1');
                $('editCategoryContainer').classList.add('hidden');
                $('editTransferToContainer').classList.remove('hidden');
                
                $('editWallet').value = txn.wallet_id;
                $('editToWallet').value = txn.to_wallet_id;
            } else {
                $('editWalletCategoryRow').classList.add('grid-cols-2');
                $('editWalletCategoryRow').classList.remove('grid-cols-1');
                $('editCategoryContainer').classList.remove('hidden');
                $('editTransferToContainer').classList.add('hidden');
                
                // Temporarily inject missing category into dropdown if it was deleted
                if (txn.category_id && !App.State.categories.find(c => c.id === txn.category_id)) {
                    $('editCategory').add(new Option('Deleted Category', txn.category_id));
                }
                
                $('editCategory').value = txn.category_id;
                $('editWallet').value = txn.wallet_id;
            }
        } else if (type === 'meal') {
            const meal = App.State.meals.find(m => m.id === id);
            if (!meal) return;

            $('editTxnFields').classList.add('hidden');
            $('editMealFields').classList.remove('hidden');

            $('editDate').value = meal.date;
            $('editMealB').value = meal.breakfast;
            $('editMealL').value = meal.lunch;
            $('editMealD').value = meal.dinner;
        }

        $('editModal').classList.remove('hidden');
    },

    closeEditModal: () => {
        $('editModal').classList.add('hidden');
    }
};

// Global expose for inline onclick attributes in HTML strings
window.deleteTxn = async (id) => {
    if (confirm('আপনি কি এই ট্রানজেকশনটি ডিলিট করতে চান?')) {
        try {
            const t = App.State.transactions.find(x => x.id === id);
            await App.Data.deleteTransaction(id, t?.receipt_path);
            App.UI.showToast('ট্রানজেকশন ডিলিট করা হয়েছে');
        } catch (err) {
            App.UI.showToast(err.message, 'error');
        }
    }
};

window.deleteMeal = async (id) => {
    if (confirm('আপনি কি এই মিল এন্ট্রি ডিলিট করতে চান?')) {
        try {
            await App.Data.deleteMeal(id);
            App.UI.showToast('মিল এন্ট্রি ডিলিট করা হয়েছে');
        } catch (err) {
            App.UI.showToast(err.message, 'error');
        }
    }
};

window.deleteCat = async (id) => {
    if (confirm('আপনি কি এই ক্যাটাগরিটি ডিলিট করতে চান?')) {
        try {
            await App.Data.deleteCategory(id);
            App.UI.showToast('ক্যাটাগরি ডিলিট করা হয়েছে');
            App.UI.populateDropdowns();
            App.UI.renderSettings();
        } catch (err) {
            App.UI.showToast(err.message, 'error');
        }
    }
};