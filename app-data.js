/**
 * ==========================================
 * RCIVE DAILY - DATA LAYER
 * ==========================================
 */

window.App = window.App || {};

// Local Timezone Helper
App.getLocalMonthStr = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 7);
};

App.State = {
    user: null,
    settings: {},
    wallets: [],
    categories: [],
    transactions: [],
    meals: [],
    currentMonth: App.getLocalMonthStr(),
    
    kpi: {
        income: 0, expense: 0, transfer: 0, savings: 0,
        mealRate: 0, totalMeals: 0, bazarTotal: 0
    }
};

App.Data = {
    loadInitialData: async () => {
        try {
            const { data: settingsData, error: setErr } = await App.supabase
                .from('settings').select('*').eq('user_id', App.State.user.id).single();
            if (setErr) throw setErr;
            App.State.settings = settingsData;

            const { data: catData, error: catErr } = await App.supabase
                .from('categories').select('*').order('created_at', { ascending: true });
            if (catErr) throw catErr;
            App.State.categories = catData;

            await App.Data.refreshWallets();

            if (App.State.settings.theme !== 'system' && !localStorage.getItem('theme_override')) {
                localStorage.setItem('theme', App.State.settings.theme);
                if (App.State.settings.theme === 'dark') document.documentElement.classList.add('dark');
                else document.documentElement.classList.remove('dark');
            }
        } catch (err) {
            console.error('Initial Data Load Error:', err);
            if(App.UI) App.UI.showToast('প্রাথমিক ডাটা লোড করতে সমস্যা হয়েছে!', 'error');
        }
    },

    refreshWallets: async () => {
        const { data: walletData, error: walErr } = await App.supabase
            .from('wallet_balances').select('*').order('name', { ascending: true });
        if (walErr) throw walErr;
        App.State.wallets = walletData;
    },

    loadMonthData: async (monthStr = App.State.currentMonth) => {
        App.State.currentMonth = monthStr;
        const [year, month] = monthStr.split('-').map(Number);
        
        // Exact month boundary calculation
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        try {
            const { data: txData, error: txErr } = await App.supabase
                .from('transactions').select('*')
                .gte('date', startDate).lte('date', endDate)
                .order('date', { ascending: false }).order('created_at', { ascending: false });
            if (txErr) throw txErr;
            App.State.transactions = txData;

            const { data: mealData, error: mealErr } = await App.supabase
                .from('meals').select('*')
                .gte('date', startDate).lte('date', endDate)
                .order('date', { ascending: false });
            if (mealErr) throw mealErr;
            App.State.meals = mealData;

            App.Data.calculateKPIs();
            if (App.UI && typeof App.UI.refreshAllViews === 'function') {
                await App.UI.refreshAllViews();
            }
        } catch (err) {
            console.error('Month Data Load Error:', err);
            if(App.UI) App.UI.showToast('এই মাসের ডাটা লোড করতে সমস্যা হয়েছে!', 'error');
        }
    },

    calculateKPIs: () => {
        let inc = 0, exp = 0, tx = 0, bazar = 0;
        const bazarCatIds = App.State.categories.filter(c => c.is_bazar).map(c => c.id);

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
            income: inc, expense: exp, transfer: tx, savings: inc - exp,
            bazarTotal: bazar, totalMeals: totalMealsCount,
            mealRate: totalMealsCount > 0 ? (bazar / totalMealsCount) : 0
        };
    },

    // Client-side Image Compression (High Fix)
    compressImage: async (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let { width, height } = img;
                    const MAX_SIZE = 1200;
                    if (width > height && width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
                    else if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
                    
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob((blob) =>