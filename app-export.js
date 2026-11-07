/**
 * ==========================================
 * RCIVE DAILY - EXPORT LAYER
 * ==========================================
 */

window.App = window.App || {};

App.Export = {
    // ----------------------------------------------------------------------
    // PDF Export (Dark mode body bug fixed)
    // ----------------------------------------------------------------------
    downloadPDF: () => {
        const area = document.getElementById('pdfExportArea');
        if (!area) return;

        const isDark = document.documentElement.classList.contains('dark');
        document.documentElement.classList.remove('dark');
        
        document.querySelectorAll('.overflow-x-auto').forEach(el => el.style.overflow = 'visible');

        const dateStr = App.State.currentMonth || new Date().toISOString().slice(0,7);
        const opt = {
            margin: 0.5,
            filename: `Rcive_Daily_Report_${dateStr}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
        };

        App.UI.showToast('পিডিএফ তৈরি হচ্ছে, অপেক্ষা করুন...');

        html2pdf().set(opt).from(area).save().then(() => {
            document.querySelectorAll('.overflow-x-auto').forEach(el => el.style.overflow = '');
            if (isDark) document.documentElement.classList.add('dark');
            App.UI.showToast('পিডিএফ ডাউনলোড সম্পন্ন হয়েছে!');
        }).catch(err => {
            console.error('PDF Error:', err);
            App.UI.showToast('পিডিএফ তৈরিতে সমস্যা হয়েছে!', 'error');
            if (isDark) document.documentElement.classList.add('dark');
        });
    },

    // ----------------------------------------------------------------------
    // Excel & CSV Export (Sanitized against Formula Injection)
    // ----------------------------------------------------------------------
    exportSpreadsheet: (format = 'xlsx') => {
        if (!window.XLSX) { App.UI.showToast('এক্সেল লাইব্রেরি লোড হয়নি!', 'error'); return; }

        const wb = XLSX.utils.book_new();
        const dateStr = App.State.currentMonth || new Date().toISOString().slice(0,7);

        // Sanitize string to prevent Excel Formula Injection (High Fix)
        const sanitize = (val) => {
            if (typeof val === 'string' && /^[=+\-@]/.test(val)) return "'" + val;
            return val;
        };

        const txHeaders = ['Date', 'Type', 'Category/Transfer', 'Wallet', 'Amount', 'Notes'];
        const txData = [txHeaders];

        App.State.transactions.forEach(t => {
            const w1 = App.State.wallets.find(w => w.wallet_id === t.wallet_id)?.name || '';
            let catOrTrans = App.State.categories.find(c => c.id === t.category_id)?.name || '';
            if (t.type === 'transfer') {
                const w2 = App.State.wallets.find(w => w.wallet_id === t.to_wallet_id)?.name || '';
                catOrTrans = `Transfer to ${w2}`;
            }
            txData.push([t.date, t.type.toUpperCase(), catOrTrans, w1, t.amount, sanitize(t.notes || '')]);
        });

        const txWs = XLSX.utils.aoa_to_sheet(txData);
        XLSX.utils.book_append_sheet(wb, txWs, "Transactions");

        const mealHeaders = ['Date', 'Breakfast', 'Lunch', 'Dinner', 'Total'];
        const mealData = [mealHeaders];

        App.State.meals.forEach(m => {
            const total = Number(m.breakfast) + Number(m.lunch) + Number(m.dinner);
            mealData.push([m.date, m.breakfast, m.lunch, m.dinner, total]);
        });

        const mealWs = XLSX.utils.aoa_to_sheet(mealData);
        XLSX.utils.book_append_sheet(wb, mealWs, "Meals");

        XLSX.writeFile(wb, `Rcive_Data_${dateStr}.${format}`);
        App.UI.showToast(`${format.toUpperCase()} ফাইল ডাউনলোড হয়েছে!`);
    },

    // ----------------------------------------------------------------------
    // JSON Backup (Now pulls ALL historical DB data, not just current month)
    // ----------------------------------------------------------------------
    downloadJSONBackup: async () => {
        App.UI.showToast('ব্যাকআপ প্রস্তুত হচ্ছে...');
        try {
            const { data: allTx, error: txErr } = await App.supabase.from('transactions').select('*');
            const { data: allMeals, error: mErr } = await App.supabase.from('meals').select('*');
            if(txErr || mErr) throw new Error('ডাটাবেস রিড এরর!');

            const backupData = {
                export_date: new Date().toISOString(),
                app: 'Rcive Daily',
                user: App.State.user.email,
                data: {
                    settings: App.State.settings,
                    categories: App.State.categories,
                    wallets: App.State.wallets,
                    transactions: allTx || [],
                    meals: allMeals || []
                }
            };

            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `Rcive_Full_Backup_${App.getLocalMonthStr()}.json`);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            
            App.UI.showToast('সম্পূর্ণ ডাটাবেস JSON ব্যাকআপ ডাউনলোড হয়েছে!');
        } catch (err) { App.UI.showToast(err.message, 'error'); }
    },

    // ----------------------------------------------------------------------
    // JSON Restore (Validation added, robust sequential execution)
    // ----------------------------------------------------------------------
    restoreJSONBackup: (file) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = JSON.parse(e.target.result);
                if (json.app !== 'Rcive Daily' || !json.data || !json.data.wallets) {
                    throw new Error('অবৈধ বা ত্রুটিযুক্ত ব্যাকআপ ফাইল!');
                }
                if (!confirm('সতর্কতা: রিস্টোর করলে বর্তমান ডাটাবেসের সাথে ব্যাকআপের ডাটা মার্জ হয়ে যাবে। চালিয়ে যাবেন?')) return;

                App.UI.showToast('ডাটা রিস্টোর হচ্ছে... দয়া করে অপেক্ষা করুন', 'success');

                // 1. Restore Categories
                if (json.data.categories) {
                    for (const cat of json.data.categories) {
                        const exists = App.State.categories.find(c => c.name === cat.name && c.type === cat.type);
                        if (!exists) await App.Data.addCategory(cat.name, cat.type, cat.is_bazar || false);
                    }
                    await App.Data.loadInitialData(); // Reload to get fresh IDs mapping
                }

                // 2. Fetch full server data to prevent duplicates across all months
                const { data: serverTx } = await App.supabase.from('transactions').select('date, amount, type, notes');
                const { data: serverMeals } = await App.supabase.from('meals').select('date');

                // 3. Restore Transactions (Using sequential await to prevent rate limits)
                if (json.data.transactions) {
                    for (const tx of json.data.transactions) {
                        let mappedCatId = null, mappedWalletId = null, mappedToWalletId = null;
                        
                        if (tx.category_id) {
                            const oldCat = json.data.categories.find(c => c.id === tx.category_id);
                            if (oldCat) {
                                const newCat = App.State.categories.find(c => c.name === oldCat.name && c.type === oldCat.type);
                                if (newCat) mappedCatId = newCat.id;
                            }
                        }

                        const oldWallet = json.data.wallets.find(w => w.wallet_id === tx.wallet_id);
                        if (oldWallet) {
                            const newWallet = App.State.wallets.find(w => w.name === oldWallet.name);
                            if (newWallet) mappedWalletId = newWallet.wallet_id;
                        }

                        if (tx.to_wallet_id) {
                            const oldToWallet = json.data.wallets.find(w => w.wallet_id === tx.to_wallet_id);
                            if (oldToWallet) {
                                const newToWallet = App.State.wallets.find(w => w.name === oldToWallet.name);
                                if (newToWallet) mappedToWalletId = newToWallet.wallet_id;
                            }
                        }

                        if (mappedWalletId) {
                            const exists = serverTx?.find(t => t.date === tx.date && Number(t.amount) === Number(tx.amount) && t.type === tx.type && (t.notes || '') === (tx.notes || ''));
                            if (!exists) {
                                await App.Data.saveTransaction({
                                    id: undefined, date: tx.date, type: tx.type, amount: tx.amount,
                                    wallet_id: mappedWalletId, to_wallet_id: mappedToWalletId, category_id: mappedCatId,
                                    notes: tx.notes, receipt_path: null
                                }, null);
                            }
                        }
                    }
                }

                // 4. Restore Meals
                if (json.data.meals) {
                    for (const m of json.data.meals) {
                        const exists = serverMeals?.find(meal => meal.date === m.date);
                        if (!exists) {
                            await App.Data.saveMeal({ id: undefined, date: m.date, breakfast: m.breakfast, lunch: m.lunch, dinner: m.dinner });
                        }
                    }
                }

                App.UI.showToast('রিস্টোর সফলভাবে সম্পন্ন হয়েছে!');
                await App.Data.loadMonthData();

            } catch (err) {
                console.error(err);
                App.UI.showToast(err.message, 'error');
            }
        };
        reader.readAsText(file);
    }
};