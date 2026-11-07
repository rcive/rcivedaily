/**
 * ==========================================
 * RCIVE DAILY - DATA LAYER
 * ==========================================
 * Handles all Supabase database and storage interactions,
 * as well as the global application state.
 */

window.App = window.App || {};

// Global App State
App.State = {
    user: null,           // Populated by Auth
    settings: {},
    wallets: [],          // Includes calculated balances from the view
    categories: [],
    transactions: [],
    meals: [],
    currentMonth: new Date().toISOString().slice(0, 7), // YYYY-MM format
    
    // KPI Derived Data
    kpi: {
        income: 0,
        expense: 0,
        transfer: 0,
        savings: 0,
        mealRate: 0,
        totalMeals: 0,
        bazarTotal: 0
    }
};

App.Data = {
    /** 
     * Load foundational data: Settings, Categories, and Wallets (with balances)
     */
    loadInitialData: async () => {
        try {
            // Fetch Settings
            const { data: settingsData, error: setErr } = await App.supabase
                .from('settings')
                .select('*')
                .eq('user_id', App.State.user.id)
                .single();
            if (setErr) throw setErr;
            App.State.settings = settingsData;

            // Fetch Categories
            const { data: catData, error: catErr } = await App.supabase
                .from('categories')
                .select('*')
                .order('created_at', { ascending: true });
            if (catErr) throw catErr;
            App.State.categories = catData;

            // Fetch Wallets & computed total balances across all time
            await App.Data.refreshWallets();

            // Apply theme from settings if it's not strictly local overridden
            if (App.State.settings.theme !== 'system' && !localStorage.getItem('theme_override')) {
                localStorage.setItem('theme', App.State.settings.theme);
                if (App.State.settings.theme === 'dark') document.documentElement.classList.add('dark');
                else document.documentElement.classList.remove('dark');
            }

        } catch (err) {
            console.error('Initial Data Load Error:', err);
            App.UI.showToast('প্রাথমিক ডাটা লোড করতে সমস্যা হয়েছে!', 'error');
        }
    },

    /**
     * Refresh just the wallet balances (useful after adding a transaction)
     */
    refreshWallets: async () => {
        const { data: walletData, error: walErr } = await App.supabase
            .from('wallet_balances')
            .select('*')
            .order('name', { ascending: true });
        if (walErr) throw walErr;
        App.State.wallets = walletData;
    },

    /**
     * Load transactions and meals for the specific selected month, then compute KPIs
     */
    loadMonthData: async (monthStr = App.State.currentMonth) => {
        App.State.currentMonth = monthStr;
        
        // Calculate start and end date of the month (YYYY-MM-01 to YYYY-MM-last)
        const [year, month] = monthStr.split('-').map(Number);
        const startDate = `${monthStr}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${monthStr}-${lastDay.toString().padStart(2, '0')}`;

        try {
            // Fetch Transactions
            const { data: txData, error: txErr } = await App.supabase
                .from('transactions')
                .select('*')
                .gte('date', startDate)
                .lte('date', endDate)
                .order('date', { ascending: false })
                .order('created_at', { ascending: false });
            if (txErr) throw txErr;
            App.State.transactions = txData;

            // Fetch Meals
            const { data: mealData, error: mealErr } = await App.supabase
                .from('meals')
                .select('*')
                .gte('date', startDate)
                .lte('date', endDate)
                .order('date', { ascending: false });
            if (mealErr) throw mealErr;
            App.State.meals = mealData;

            // Compute KPIs
            App.Data.calculateKPIs();

            // Refresh UI bindings
            if (App.UI && typeof App.UI.refreshAllViews === 'function') {
                App.UI.refreshAllViews();
            }

        } catch (err) {
            console.error('Month Data Load Error:', err);
            App.UI.showToast('এই মাসের ডাটা লোড করতে সমস্যা হয়েছে!', 'error');
        }
    },

    /**
     * Process arrays into monthly KPIs (Income, Expense, Meal Rates, etc.)
     */
    calculateKPIs: () => {
        let inc = 0, exp = 0, tx = 0, bazar = 0;
        
        // Map category IDs to determine which ones are 'is_bazar'
        const bazarCatIds = App.State.categories
            .filter(c => c.is_bazar)
            .map(c => c.id);

        App.State.transactions.forEach(t => {
            const amt = Number(t.amount);
            if (t.type === 'income') inc += amt;
            else if (t.type === 'expense') {
                exp += amt;
                if (bazarCatIds.includes(t.category_id)) bazar += amt;
            }
            else if (t.type === 'transfer') tx += amt;
        });

        let totalMealsCount = 0;
        App.State.meals.forEach(m => {
            totalMealsCount += Number(m.breakfast) + Number(m.lunch) + Number(m.dinner);
        });

        App.State.kpi = {
            income: inc,
            expense: exp,
            transfer: tx,
            savings: inc - exp,
            bazarTotal: bazar,
            totalMeals: totalMealsCount,
            mealRate: totalMealsCount > 0 ? (bazar / totalMealsCount) : 0
        };
    },

    /**
     * Handle Receipt Upload to Storage (Max 2MB, Images Only)
     */
    uploadReceipt: async (file) => {
        if (!file) return null;
        if (file.size > 2097152) throw new Error('রসিদ ছবির সাইজ সর্বোচ্চ ২MB হতে পারবে!');
        if (!file.type.startsWith('image/')) throw new Error('শুধুমাত্র ছবি আপলোড করা যাবে!');

        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${App.State.user.id}/${fileName}`;

        const { error } = await App.supabase.storage
            .from('receipts')
            .upload(filePath, file, { cacheControl: '3600', upsert: false });
        
        if (error) throw new Error('ছবি আপলোড ব্যর্থ হয়েছে!');
        return filePath;
    },

    deleteReceipt: async (filePath) => {
        if (!filePath) return;
        try {
            await App.supabase.storage.from('receipts').remove([filePath]);
        } catch (e) {
            console.warn('Failed to delete old receipt:', e);
        }
    },

    /**
     * Transaction CRUD
     */
    saveTransaction: async (data, receiptFile, existingReceiptPath = null, removeOldReceipt = false) => {
        let finalReceiptPath = existingReceiptPath;

        if (removeOldReceipt && existingReceiptPath) {
            await App.Data.deleteReceipt(existingReceiptPath);
            finalReceiptPath = null;
        }

        if (receiptFile) {
            if (existingReceiptPath && !removeOldReceipt) {
                await App.Data.deleteReceipt(existingReceiptPath);
            }
            finalReceiptPath = await App.Data.uploadReceipt(receiptFile);
        }

        const payload = {
            user_id: App.State.user.id,
            date: data.date,
            type: data.type,
            amount: data.amount,
            wallet_id: data.wallet_id,
            notes: data.notes || null,
            receipt_path: finalReceiptPath
        };

        if (data.type === 'expense' || data.type === 'income') {
            payload.category_id = data.category_id;
            payload.to_wallet_id = null;
        } else if (data.type === 'transfer') {
            payload.category_id = null;
            payload.to_wallet_id = data.to_wallet_id;
            if (payload.wallet_id === payload.to_wallet_id) throw new Error('একই ওয়ালেটে ট্রান্সফার সম্ভব নয়!');
        }

        if (data.id) {
            // Update
            const { error } = await App.supabase.from('transactions').update(payload).eq('id', data.id);
            if (error) throw error;
        } else {
            // Insert
            const { error } = await App.supabase.from('transactions').insert([payload]);
            if (error) throw error;
        }

        await App.Data.refreshWallets();
        await App.Data.loadMonthData(App.State.currentMonth);
    },

    deleteTransaction: async (id, receiptPath) => {
        if (receiptPath) {
            await App.Data.deleteReceipt(receiptPath);
        }
        const { error } = await App.supabase.from('transactions').delete().eq('id', id);
        if (error) throw error;

        await App.Data.refreshWallets();
        await App.Data.loadMonthData(App.State.currentMonth);
    },

    /**
     * Meal CRUD
     */
    saveMeal: async (data) => {
        const payload = {
            user_id: App.State.user.id,
            date: data.date,
            breakfast: data.breakfast,
            lunch: data.lunch,
            dinner: data.dinner
        };

        if (data.id) {
            const { error } = await App.supabase.from('meals').update(payload).eq('id', data.id);
            if (error) throw error;
        } else {
            // Upsert based on unique user_id + date constraint
            const { error } = await App.supabase.from('meals').upsert(payload, { onConflict: 'user_id,date' });
            if (error) throw error;
        }

        await App.Data.loadMonthData(App.State.currentMonth);
    },

    deleteMeal: async (id) => {
        const { error } = await App.supabase.from('meals').delete().eq('id', id);
        if (error) throw error;
        await App.Data.loadMonthData(App.State.currentMonth);
    },

    /**
     * Settings & Master Data Management
     */
    updateSettings: async (payload) => {
        const { error } = await App.supabase
            .from('settings')
            .update(payload)
            .eq('user_id', App.State.user.id);
        
        if (error) throw error;
        App.State.settings = { ...App.State.settings, ...payload };
    },

    addCategory: async (name, type, isBazar) => {
        const payload = {
            user_id: App.State.user.id,
            name: name,
            type: type,
            is_bazar: isBazar
        };
        const { data, error } = await App.supabase.from('categories').insert([payload]).select().single();
        if (error) {
            if (error.code === '23505') throw new Error('এই নামের ক্যাটাগরি আগেই আছে!');
            throw error;
        }
        App.State.categories.push(data);
        return data;
    },
    
    deleteCategory: async (id) => {
        const { error } = await App.supabase.from('categories').delete().eq('id', id);
        if (error) {
            if (error.code === '23503') throw new Error('এই ক্যাটাগরিতে ট্রানজেকশন আছে। আগে সেগুলো পরিবর্তন বা ডিলিট করুন!');
            throw error;
        }
        App.State.categories = App.State.categories.filter(c => c.id !== id);
    },

    updateWalletOpeningBalance: async (id, balance) => {
        const { error } = await App.supabase
            .from('wallets')
            .update({ opening_balance: balance })
            .eq('id', id)
            .eq('user_id', App.State.user.id);
            
        if (error) throw error;
        await App.Data.refreshWallets();
    }
};