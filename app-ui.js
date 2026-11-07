/**
 * ==========================================
 * RCIVE DAILY - UI & RENDERING LAYER
 * ==========================================
 */

window.App = window.App || {};
window.App.Charts = window.App.Charts || {};

// Safe global selector to prevent redeclaration conflicts
const $ = window.$ || ((id) => document.getElementById(id));
window.$ = $;

window.App.UI = {
    escapeText: (str) => {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    formatMoney: (amount) => {
        return new Intl.NumberFormat('bn-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount || 0);
    },

    formatDate: (dateStr) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' });
    },

    getLocalDateStr: () => {
        const d = new Date();
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().split('T')[0];
    },

    showToast: (message, type = 'success') => {
        const container = $('toastContainer');
        if(!container) return;
        const toast = document.createElement('div');
        const isErr = type === 'error';
        
        toast.className = `glass-panel px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 toast-animate border-l-4 ${isErr ? 'border-rose-500' : 'border-emerald-500'} bg-white dark:bg-slate-900 pointer-events-auto`;
        toast.innerHTML = `<i class="fa-solid ${isErr ? 'fa-circle-exclamation text-rose-500' : 'fa-circle-check text-emerald-500'}"></i><span class="text-sm font-bold text-slate-800 dark:text-white">${window.App.UI.escapeText(message)}</span>`;
        
        container.prepend(toast);
        setTimeout(() => {
            toast.classList.replace('toast-animate', 'opacity-0');
            toast.style.transform = 'translateY(-10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

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
        $('contextMenu')?.classList.add('hidden');
    },

    renderMonthSelector: () => {
        const select = $('monthSelector');
        if(!select) return;
        select.innerHTML = '';
        const now = new Date();
        
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
        const walletSelect = $('entryWallet');
        const toWalletSelect = $('entryToWallet');

        if(catSelect) catSelect.innerHTML = '';
        if(walletSelect) walletSelect.innerHTML = '';
        if(toWalletSelect) toWalletSelect.innerHTML = '';

        const currentType = document.querySelector('input[name="entryTypeRadio"]:checked')?.value || 'expense';
        const cats = window.App.State.categories.filter(c => c.type === (currentType === 'transfer' ? 'expense' : currentType));

        cats.forEach(c => {
            if(catSelect) catSelect.add(new Option(c.name, c.id));
        });

        window.App.State.wallets.forEach(w => {
            const label = `${w.name} (${window.App.UI.formatMoney(w.balance)})`;
            if(walletSelect) walletSelect.add(new Option(label, w.wallet_id));
            if(toWalletSelect) toWalletSelect.add(new Option(label, w.wallet_id));
        });
    },

    refreshAllViews: async () => {
        window.App.UI.renderDashboard();
        await window.App.UI.renderLedger();
        window.App.UI.renderMeals();
        window.App.UI.renderPlanning();
        window.App.UI.renderSettings();
    },

    renderDashboard: () => {
        const { kpi } = window.App.State;
        if($('kpiIncome')) $('kpiIncome').textContent = window.App.UI.formatMoney(kpi.income);
        if($('kpiExpense')) $('kpiExpense').textContent = window.App.UI.formatMoney(kpi.expense);
        if($('kpiSavings')) $('kpiSavings').textContent = window.App.UI.formatMoney(kpi.savings);
        if($('kpiMealRate')) $('kpiMealRate').textContent = window.App.UI.formatMoney(kpi.mealRate);
        if($('kpiTotalMeals')) $('kpiTotalMeals').textContent = kpi.totalMeals;

        const totalBal = window.App.State.wallets.reduce((sum, w) => sum + Number(w.balance), 0);
        if($('kpiBalance')) $('kpiBalance').textContent = window.App.UI.formatMoney(totalBal);
        window.App.UI.renderCharts();
    },

    renderCharts: () => {
        if(typeof Chart === 'undefined') return;

        const expCats = {};
        window.App.State.transactions.filter(t => t.type === 'expense').forEach(t => {
            const cat = window.App.State.categories.find(c => c.id === t.category_id);
            const name = cat ? cat.name : 'Unknown';
            expCats[name] = (expCats[name] || 0) + Number(t.amount);
        });

        const catLabels = Object.keys(expCats);
        const catData = Object.values(expCats);
        const catColors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

        const summaryList = $('categorySummaryList');
        if(summaryList) {
            summaryList.innerHTML = '';
            catLabels.forEach((label, idx) => {
                const div = document.createElement('div');
                div.className = 'flex justify-between items-center text-xs font-bold p-2 glass-panel rounded-lg';
                div.innerHTML = `
                    <div class="flex items-center gap-2">
                        <span class="w-3 h-3 rounded-full" style="background-color: ${catColors[idx % catColors.length]}"></span>
                        <span>${window.App.UI.escapeText(label)}</span>
                    </div>
                    <span>${window.App.UI.formatMoney(catData[idx])}</span>
                `;
                summaryList.appendChild(div);
            });
        }

        if (window.App.Charts.category) window.App.Charts.category.destroy();
        const catCanvas = $('categoryChart');
        if(catCanvas) {
            window.App.Charts.category = new Chart(catCanvas, {
                type: 'doughnut',
                data: { labels: catLabels, datasets: [{ data: catData, backgroundColor: catColors, borderWidth: 0 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '70%' }
            });
        }

        const trendLabels = [];
        const trendIncome = [];
        const trendExpense = [];
        
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            const dateStr = d.toISOString().split('T')[0];
            
            trendLabels.push(d.toLocaleDateString('bn-BD', { weekday: 'short' }));

            const dayTx = window.App.State.transactions.filter(t => t.date === dateStr);
            trendIncome.push(dayTx.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0));
            trendExpense.push(dayTx.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0));
        }

        if (window.App.Charts.trend) window.App.Charts.trend.destroy();
        const isDark = document.documentElement.classList.contains('dark');
        const trendCanvas = $('trendChart');
        if(trendCanvas) {
            window.App.Charts.trend = new Chart(trendCanvas, {
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
        }
    },

    renderLedger: async () => {
        const tbody = $('txnTableBody');
        if(!tbody) return;
        tbody.innerHTML = '';
        
        const filterType = $('filterTxnType')?.value || 'all';
        const searchRaw = $('searchTxn')?.value.toLowerCase() || '';
        
        let txns = window.App.State.transactions;
        if (filterType !== 'all') txns = txns.filter(t => t.type === filterType);
        if (searchRaw) {
            txns = txns.filter(t => {
                const catName = window.App.State.categories.find(c => c.id === t.category_id)?.name || '';
                return (t.notes || '').toLowerCase().includes(searchRaw) || catName.toLowerCase().includes(searchRaw);
            });
        }

        if (txns.length === 0) {
            $('txnEmptyState')?.classList.remove('hidden');
        } else {
            $('txnEmptyState')?.classList.add('hidden');
            
            for (const t of txns) {
                const w1 = window.App.State.wallets.find(w => w.wallet_id === t.wallet_id)?.name || 'Unknown';
                const cat = window.App.State.categories.find(c => c.id === t.category_id)?.name || '';
                
                let sourceHTML = '';
                let amountClass = 'text-slate-800 dark:text-white';
                let amountPrefix = '';

                if (t.type === 'income') {
                    sourceHTML = `<span class="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-1 rounded text-[10px]">${window.App.UI.escapeText(w1)}</span>`;
                    amountClass = 'text-emerald-500'; amountPrefix = '+';
                } else if (t.type === 'expense') {
                    sourceHTML = `<span class="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 px-2 py-1 rounded text-[10px]">${window.App.UI.escapeText(w1)}</span>`;
                    amountClass = 'text-rose-500'; amountPrefix = '-';
                } else {
                    const w2 = window.App.State.wallets.find(w => w.wallet_id === t.to_wallet_id)?.name || 'Unknown';
                    sourceHTML = `<div class="flex items-center justify-center gap-1 text-[10px]"><span class="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">${window.App.UI.escapeText(w1)}</span><i class="fa-solid fa-arrow-right text-blue-500"></i><span class="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded">${window.App.UI.escapeText(w2)}</span></div>`;
                    amountClass = 'text-blue-500';
                }

                let receiptIcon = '';
                if (t.receipt_path) {
                    const { data } = await window.App.supabase.storage.from('receipts').createSignedUrl(t.receipt_path, 3600);
                    if (data?.signedUrl) {
                        receiptIcon = `<a href="${data.signedUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-600" title="রসিদ দেখুন"><i class="fa-solid fa-paperclip"></i></a>`;
                    }
                }

                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors';
                tr.innerHTML = `
                    <td class="p-4 text-xs whitespace-nowrap">${window.App.UI.formatDate(t.date)}</td>
                    <td class="p-4"><div class="flex items-center gap-2">${receiptIcon}<div><p class="leading-tight">${t.type !== 'transfer' ? window.App.UI.escapeText(cat) : 'ট্রান্সফার'}</p>${t.notes ? `<p class="text-[10px] font-black text-slate-400">${window.App.UI.escapeText(t.notes)}</p>` : ''}</div></div></td>
                    <td class="p-4 text-center">${sourceHTML}</td>
                    <td class="p-4 text-right whitespace-nowrap ${amountClass}">${amountPrefix}${window.App.UI.formatMoney(t.amount)}</td>
                    <td class="p-4 text-center space-x-2 no-print">
                        <button class="text-slate-400 hover:text-blue-500 transition-colors edit-txn-btn" data-id="${t.id}" title="এডিট"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button class="text-slate-400 hover:text-rose-500 transition-colors delete-txn-btn" data-id="${t.id}" title="ডিলিট"><i class="fa-solid fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            }
        }
    },

    renderMeals: () => {
        const tbody = $('mealTableBody');
        if(!tbody) return;
        tbody.innerHTML = '';

        if (window.App.State.meals.length === 0) {
            $('mealEmptyState')?.classList.remove('hidden');
            if($('statBreakfast')) $('statBreakfast').textContent = '0';
            if($('statLunch')) $('statLunch').textContent = '0';
            if($('statDinner')) $('statDinner').textContent = '0';
        } else {
            $('mealEmptyState')?.classList.add('hidden');
            let bTotal = 0, lTotal = 0, dTotal = 0;
            
            window.App.State.meals.forEach(m => {
                bTotal += Number(m.breakfast); lTotal += Number(m.lunch); dTotal += Number(m.dinner);
                const total = Number(m.breakfast) + Number(m.lunch) + Number(m.dinner);
                
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors';
                tr.innerHTML = `
                    <td class="p-4 text-xs font-black text-left whitespace-nowrap">${window.App.UI.formatDate(m.date)}</td>
                    <td class="p-4 text-emerald-600 dark:text-emerald-400">${m.breakfast}</td>
                    <td class="p-4 text-blue-600 dark:text-blue-400">${m.lunch}</td>
                    <td class="p-4 text-indigo-600 dark:text-indigo-400">${m.dinner}</td>
                    <td class="p-4 text-amber-500 font-black">${total}</td>
                    <td class="p-4 no-print space-x-2">
                        <button class="text-slate-400 hover:text-blue-500 transition-colors edit-meal-btn" data-id="${m.id}" title="এডিট"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button class="text-slate-400 hover:text-rose-500 transition-colors delete-meal-btn" data-id="${m.id}" title="ডিলিট"><i class="fa-solid fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            if($('statBreakfast')) $('statBreakfast').textContent = bTotal;
            if($('statLunch')) $('statLunch').textContent = lTotal;
            if($('statDinner')) $('statDinner').textContent = dTotal;
        }
    },

    renderPlanning: () => {
        const wContainer = $('walletCardsContainer');
        if(wContainer) {
            wContainer.innerHTML = '';
            window.App.State.wallets.forEach(w => {
                const div = document.createElement('div');
                div.className = 'glass-panel p-4 rounded-xl flex flex-col justify-between';
                div.innerHTML = `<span class="text-[10px] font-black uppercase text-slate-500 mb-2 truncate">${window.App.UI.escapeText(w.name)}</span><h4 class="text-sm font-black text-slate-800 dark:text-white truncate">${window.App.UI.formatMoney(w.balance)}</h4>`;
                wContainer.appendChild(div);
            });
        }

        const budget = Number(window.App.State.settings.monthly_budget);
        if($('budgetInput')) $('budgetInput').value = budget > 0 ? budget : '';
        if (budget > 0) {
            const exp = window.App.State.kpi.expense;
            const pct = Math.min(100, Math.round((exp / budget) * 100));
            if($('budgetPercentText')) $('budgetPercentText').textContent = `${pct}% (${window.App.UI.formatMoney(exp)} / ${window.App.UI.formatMoney(budget)})`;
            if($('budgetProgressBar')) $('budgetProgressBar').style.width = `${pct}%`;
            if (pct >= 100) { 
                $('budgetProgressBar')?.classList.replace('bg-emerald-500', 'bg-rose-500'); 
                $('budgetWarningText')?.classList.remove('hidden'); 
            } else { 
                $('budgetProgressBar')?.classList.replace('bg-rose-500', 'bg-emerald-500'); 
                $('budgetWarningText')?.classList.add('hidden'); 
            }
        }

        const savingsTarget = Number(window.App.State.settings.savings_goal);
        if($('savingsGoalInput')) $('savingsGoalInput').value = savingsTarget > 0 ? savingsTarget : '';
        if (savingsTarget > 0) {
            const sav = window.App.State.kpi.savings;
            const pct = sav > 0 ? Math.min(100, Math.round((sav / savingsTarget) * 100)) : 0;
            if($('savingsPercentText')) $('savingsPercentText').textContent = `${pct}% (${window.App.UI.formatMoney(sav)} / ${window.App.UI.formatMoney(savingsTarget)})`;
            if($('savingsProgressBar')) $('savingsProgressBar').style.width = `${pct}%`;
        }
    },

    renderSettings: () => {
        const catContainer = $('settingsCategoryList');
        if(catContainer) {
            catContainer.innerHTML = '';
            window.App.State.categories.forEach(c => {
                const div = document.createElement('div');
                const typeColor = c.type === 'income' ? 'text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30' : 'text-rose-500 bg-rose-100 dark:bg-rose-900/30';
                const bazarBadge = c.is_bazar ? '<i class="fa-solid fa-basket-shopping text-[10px] ml-1 text-amber-500" title="বাজার খাত"></i>' : '';
                div.className = `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border border-transparent hover:border-rose-300 transition-colors ${typeColor}`;
                div.innerHTML = `<span>${window.App.UI.escapeText(c.name)}${bazarBadge}</span><button type="button" class="delete-cat-btn ml-1 text-rose-500 hover:text-rose-700 p-1" data-id="${c.id}" title="ডিলিট"><i class="fa-solid fa-xmark"></i></button>`;
                catContainer.appendChild(div);
            });
        }

        const wOpenList = $('walletOpeningList');
        if(wOpenList && wOpenList.children.length === 0) {
            window.App.State.wallets.forEach(w => {
                const div = document.createElement('div');
                div.className = 'flex items-center justify-between gap-3 p-3 glass-panel rounded-xl';
                div.innerHTML = `<span class="text-xs font-bold w-24 truncate">${window.App.UI.escapeText(w.name)}</span><input type="number" step="any" inputmode="decimal" class="wallet-opening-input flex-1 bg-transparent outline-none text-right font-black text-sm" data-id="${w.wallet_id}" value="${w.opening_balance}"><span class="text-xs font-black text-slate-400">৳</span>`;
                wOpenList.appendChild(div);
            });
        }
    },

    openEntryModal: () => {
        $('entryForm')?.reset();
        if (!$('entryDate').value) $('entryDate').value = window.App.UI.getLocalDateStr();
        
        const ev = new Event('change');
        const expRadio = document.querySelector('input[name="entryTypeRadio"][value="expense"]');
        if(expRadio) {
            expRadio.checked = true;
            expRadio.dispatchEvent(ev);
        }
        
        if($('entryReceiptLabel')) $('entryReceiptLabel').textContent = 'রসিদ ছবি আপলোড (সর্বোচ্চ ২MB)';
        $('entryModal')?.classList.remove('hidden');
        window.App.UI.populateDropdowns();
    },

    closeEntryModal: () => $('entryModal')?.classList.add('hidden'),
    closeEditModal: () => $('editModal')?.classList.add('hidden'),

    openEditModal: (id, type) => {
        $('editForm')?.reset();
        if($('editId')) $('editId').value = id;
        if($('editType')) $('editType').value = type;
        if($('editOriginalReceipt')) $('editOriginalReceipt').value = '';

        if (type === 'txn') {
            const txn = window.App.State.transactions.find(t => t.id === id);
            if (!txn) return;

            $('editTxnFields')?.classList.remove('hidden');
            $('editMealFields')?.classList.add('hidden');
            if($('editDate')) $('editDate').value = txn.date;
            if($('editAmount')) $('editAmount').value = txn.amount;
            if($('editNotes')) $('editNotes').value = txn.notes || '';
            
            if (txn.receipt_path) {
                if($('editOriginalReceipt')) $('editOriginalReceipt').value = txn.receipt_path;
                if($('editReceiptLabel')) $('editReceiptLabel').textContent = 'আগের রসিদ আছে। নতুন দিলে পরিবর্তন হবে।';
            } else {
                if($('editReceiptLabel')) $('editReceiptLabel').textContent = 'নতুন রসিদ ছবি আপলোড (ঐচ্ছিক)';
            }

            const editCatSelect = $('editCategory');
            const cats = window.App.State.categories.filter(c => c.type === (txn.type === 'transfer' ? 'expense' : txn.type));
            if(editCatSelect) {
                editCatSelect.innerHTML = '';
                cats.forEach(c => editCatSelect.add(new Option(c.name, c.id)));
            }

            const editWalletSelect = $('editWallet');
            const editToWalletSelect = $('editToWallet');
            if(editWalletSelect) editWalletSelect.innerHTML = '';
            if(editToWalletSelect) editToWalletSelect.innerHTML = '';

            window.App.State.wallets.forEach(w => {
                const label = `${w.name} (${window.App.UI.formatMoney(w.balance)})`;
                editWalletSelect?.add(new Option(label, w.wallet_id));
                editToWalletSelect?.add(new Option(label, w.wallet_id));
            });

            if (txn.type === 'transfer') {
                $('editWalletCategoryRow')?.classList.replace('grid-cols-2', 'grid-cols-1');
                $('editCategoryContainer')?.classList.add('hidden');
                $('editTransferToContainer')?.classList.remove('hidden');
                if($('editWallet')) $('editWallet').value = txn.wallet_id;
                if($('editToWallet')) $('editToWallet').value = txn.to_wallet_id;
            } else {
                $('editWalletCategoryRow')?.classList.replace('grid-cols-1', 'grid-cols-2');
                $('editCategoryContainer')?.classList.remove('hidden');
                $('editTransferToContainer')?.classList.add('hidden');
                
                if (txn.category_id && !window.App.State.categories.find(c => c.id === txn.category_id)) {
                    editCatSelect?.add(new Option('Deleted Category', txn.category_id));
                }
                if($('editCategory')) $('editCategory').value = txn.category_id;
                if($('editWallet')) $('editWallet').value = txn.wallet_id;
            }
        } else if (type === 'meal') {
            const meal = window.App.State.meals.find(m => m.id === id);
            if (!meal) return;
            $('editTxnFields')?.classList.add('hidden');
            $('editMealFields')?.classList.remove('hidden');
            if($('editDate')) $('editDate').value = meal.date;
            if($('editMealB')) $('editMealB').value = meal.breakfast;
            if($('editMealL')) $('editMealL').value = meal.lunch;
            if($('editMealD')) $('editMealD').value = meal.dinner;
        }

        $('editModal')?.classList.remove('hidden');
    }
};

// --- GLOBAL EVENT DELEGATION ---
document.addEventListener('click', async (e) => {
    if (e.target.closest('.delete-txn-btn')) {
        const id = e.target.closest('.delete-txn-btn').dataset.id;
        if (confirm('আপনি কি এই ট্রানজেকশনটি ডিলিট করতে চান?')) {
            try {
                const t = window.App.State.transactions.find(x => x.id === id);
                await window.App.Data.deleteTransaction(id, t?.receipt_path);
                window.App.UI.showToast('ট্রানজেকশন ডিলিট করা হয়েছে');
            } catch (err) { window.App.UI.showToast(err.message, 'error'); }
        }
    }
    if (e.target.closest('.delete-meal-btn')) {
        const id = e.target.closest('.delete-meal-btn').dataset.id;
        if (confirm('আপনি কি এই মিল এন্ট্রি ডিলিট করতে চান?')) {
            try { await window.App.Data.deleteMeal(id); window.App.UI.showToast('মিল এন্ট্রি ডিলিট করা হয়েছে'); } 
            catch (err) { window.App.UI.showToast(err.message, 'error'); }
        }
    }
    if (e.target.closest('.delete-cat-btn')) {
        const id = e.target.closest('.delete-cat-btn').dataset.id;
        if (confirm('আপনি কি এই ক্যাটাগরিটি ডিলিট করতে চান?')) {
            try { 
                await window.App.Data.deleteCategory(id); 
                window.App.UI.showToast('ক্যাটাগরি ডিলিট করা হয়েছে');
                window.App.UI.populateDropdowns(); 
                window.App.UI.renderSettings(); 
            } 
            catch (err) { window.App.UI.showToast(err.message, 'error'); }
        }
    }
    if (e.target.closest('.edit-txn-btn')) {
        window.App.UI.openEditModal(e.target.closest('.edit-txn-btn').dataset.id, 'txn');
    }
    if (e.target.closest('.edit-meal-btn')) {
        window.App.UI.openEditModal(e.target.closest('.edit-meal-btn').dataset.id, 'meal');
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.App.UI.closeEntryModal();
        window.App.UI.closeEditModal();
    }
});