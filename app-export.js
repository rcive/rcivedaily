/**
 * ==========================================
 * RCIVE DAILY - EXPORT LAYER
 * ==========================================
 * Handles PDF, Excel, JSON Backup and Restore operations.
 */

window.App = window.App || {};

App.Export = {
    // ----------------------------------------------------------------------
    // PDF Export
    // ----------------------------------------------------------------------
    downloadPDF: () => {
        const area = document.getElementById('pdfExportArea');
        if (!area) return;

        // Temporarily adjust styles for better PDF output
        const originalClasses = area.className;
        area.className = 'w-[800px] bg-white p-8 text-black';
        document.body.classList.remove('dark');
        
        // Hide scrollbars in tables for printing
        document.querySelectorAll('.overflow-x-auto').forEach(el => {
            el.style.overflow = 'visible';
        });

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
            // Restore styles
            area.className = originalClasses;
            document.querySelectorAll('.overflow-x-auto').forEach(el => {
                el.style.overflow = '';
            });
            if (localStorage.getItem('theme') === 'dark') {
                document.documentElement.classList.add('dark');
            }
            App.UI.showToast('পিডিএফ ডাউনলোড সম্পন্ন হয়েছে!');
        }).catch(err => {
            console.error('PDF Error:', err);
            App.UI.showToast('পিডিএফ তৈরিতে সমস্যা হয়েছে!', 'error');
            area.className = originalClasses;
        });
    },

    // ----------------------------------------------------------------------
    // Excel & CSV Export
    // ----------------------------------------------------------------------
    exportSpreadsheet: (format = 'xlsx') => {
        if (!window.XLSX) {
            App.UI.showToast('এক্সেল লাইব্রেরি লোড হয়নি!', 'error');
            return;
        }

        const wb = XLSX.utils.book_new();
        const dateStr = App.State.currentMonth || new Date().toISOString().slice(0,7);

        // 1. Transactions Sheet
        const txHeaders = ['Date', 'Type', 'Category/Transfer', 'Wallet', 'Amount', 'Notes'];
        const txData = [txHeaders];

        App.State.transactions.forEach(t => {
            const w1 = App.State.wallets.find(w => w.wallet_id === t.wallet_id)?.name || '';
            const cat = App.State.categories.find(c => c.id === t.category_id)?.name || '';
            
            let catOrTrans = cat;
            if (t.type === 'transfer') {
                const w2 = App.State.wallets.find(w => w.wallet_id === t.to_wallet_id)?.name || '';
                catOrTrans = `Transfer to ${w2}`;
            }

            txData.push([
                t.date,
                t.type.toUpperCase(),
                catOrTrans,
                w1,
                t.amount,
                t.notes || ''
            ]);
        });

        const txWs = XLSX.utils.aoa_to_sheet(txData);
        XLSX.utils.book_append_sheet(wb, txWs, "Transactions");

        // 2. Meals Sheet
        const mealHeaders = ['Date', 'Breakfast', 'Lunch', 'Dinner', 'Total'];
        const mealData = [mealHeaders];

        App.State.meals.forEach(m => {
            const total = Number(m.breakfast) + Number(m.lunch) + Number(m.dinner);
            mealData.push([m.date, m.breakfast, m.lunch, m.dinner, total]);
        });

        const mealWs = XLSX.utils.aoa_to_sheet(mealData);
        XLSX.utils.book_append_sheet(wb, mealWs, "Meals");

        // Execute Download
        XLSX.writeFile(wb, `Rcive_Data_${dateStr}.${format}`);
        App.UI.showToast(`${format.toUpperCase()} ফাইল ডাউনলোড হয়েছে!`);
    },

    // ----------------------------------------------------------------------
    // JSON Backup (Master Data + Monthly Data)
    // ----------------------------------------------------------------------
    downloadJSONBackup: () => {
        const backupData = {
            export_date: new Date().toISOString(),
            app: 'Rcive Daily',
            user: App.State.user.email,
            data: {
                settings: App.State.settings,
                categories: App.State.categories,
                wallets: App.State.wallets,
                transactions: App.State.transactions,
                meals: App.State.meals,
                month: App.State.currentMonth
            }
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `Rcive_Backup_${App.State.currentMonth}.json`);
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        
        App.UI.showToast('JSON ব্যাকআপ ডাউনলোড হয়েছে!');
    },

    // ----------------------------------------------------------------------
    // JSON Restore
    // ----------------------------------------------------------------------
    restoreJSONBackup: (file) => {
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = JSON.parse(e.target.result);
                if (json.app !== 'Rcive Daily' || !json.data) {
                    throw new Error('অবৈধ ব্যাকআপ ফাইল!');
                }

                if (!confirm('সতর্কতা: রিস্টোর করলে বর্তমান মাসের ডাটার সাথে ব্যাকআপের ডাটা মার্জ হয়ে যেতে পারে। চালিয়ে যাবেন?')) {
                    return;
                }

                App.UI.showToast('ডাটা রিস্টোর হচ্ছে...', 'success');

                // 1. Restore Categories
                if (json.data.categories) {
                    for (const cat of json.data.categories) {
                        const exists = App.State.categories.find(c => c.name === cat.name && c.type === cat.type);
                        if (!exists) {
                            await App.Data.addCategory(cat.name, cat.type, cat.is_bazar || false);
                        }
                    }
                    // Re-fetch to get accurate DB IDs mapped
                    await App.Data.loadInitialData(); 
                }

                // 2. Restore Transactions
                if (json.data.transactions) {
                    for (const tx of json.data.transactions) {
                        // Attempt to map old Category ID to new DB based on name mapping
                        let mappedCatId = null;
                        if (tx.category_id) {
                            const oldCat = json.data.categories.find(c => c.id === tx.category_id);
                            if (oldCat) {
                                const newCat = App.State.categories.find(c => c.name === oldCat.name && c.type === oldCat.type);
                                if (newCat) mappedCatId = newCat.id;
                            }
                        }

                        // Attempt to map Wallet ID based on name mapping
                        let mappedWalletId = null;
                        let mappedToWalletId = null;
                        
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
                            // Check if exact tx already exists to prevent duplicate
                            const exists = App.State.transactions.find(t => 
                                t.date === tx.date && 
                                t.amount === tx.amount && 
                                t.type === tx.type && 
                                (t.notes || '') === (tx.notes || '')
                            );

                            if (!exists) {
                                const payload = {
                                    id: undefined, // let DB generate
                                    date: tx.date,
                                    type: tx.type,
                                    amount: tx.amount,
                                    wallet_id: mappedWalletId,
                                    to_wallet_id: mappedToWalletId,
                                    category_id: mappedCatId,
                                    notes: tx.notes,
                                    receipt_path: null // Do not restore dead file paths
                                };
                                await App.Data.saveTransaction(payload, null);
                            }
                        }
                    }
                }

                // 3. Restore Meals
                if (json.data.meals) {
                    for (const m of json.data.meals) {
                        const exists = App.State.meals.find(meal => meal.date === m.date);
                        if (!exists) {
                            await App.Data.saveMeal({
                                id: undefined,
                                date: m.date,
                                breakfast: m.breakfast,
                                lunch: m.lunch,
                                dinner: m.dinner
                            });
                        }
                    }
                }

                App.UI.showToast('রিস্টোর সম্পন্ন হয়েছে!');
                await App.Data.loadMonthData(); // Reload UI

            } catch (err) {
                console.error(err);
                App.UI.showToast(err.message, 'error');
            }
        };
        reader.readAsText(file);
    }
};