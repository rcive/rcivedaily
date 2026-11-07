/**
 * ==========================================
 * RCIVE DAILY - SECURE ADMIN LAYER
 * ==========================================
 */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    
    if (!window.App || !window.App.Config || !window.App.Config.isConfigured()) {
        alert('সিস্টেম কনফিগার করা নেই। config.js চেক করুন।');
        window.location.replace('../index.html');
        return;
    }
    
    const supabase = window.supabase.createClient(window.App.Config.SUPABASE_URL, window.App.Config.SUPABASE_ANON_KEY);
    let usersData = [];
    let actionTarget = null; 

    const escapeHTML = (str) => {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };

    const showToast = (message, type = 'success') => {
        const container = $('toastContainer');
        const toast = document.createElement('div');
        const isErr = type === 'error';
        toast.className = `glass-panel px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 toast-animate border-l-4 ${isErr ? 'border-rose-500' : 'border-emerald-500'} bg-white dark:bg-slate-900`;
        toast.innerHTML = `<i class="fa-solid ${isErr ? 'fa-circle-exclamation text-rose-500' : 'fa-circle-check text-emerald-500'}"></i><span class="text-sm font-bold text-slate-800 dark:text-white">${escapeHTML(message)}</span>`;
        container.prepend(toast);
        setTimeout(() => {
            toast.classList.replace('toast-animate', 'opacity-0');
            toast.style.transform = 'translateY(-10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    async function checkAccess() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { window.location.replace('../index.html'); return; }

        const { data: profile, error } = await supabase.from('profiles').select('username, role, status').eq('id', session.user.id).single();
        $('loadingScreen').classList.add('hidden');

        if (error || !profile || profile.role !== 'admin' || profile.status !== 'approved') {
            $('accessDeniedScreen').classList.remove('hidden');
            await supabase.auth.signOut();
            return;
        }

        $('adminHeaderUsername').textContent = `@${profile.username}`;
        $('adminApp').classList.remove('hidden');
        loadDashboard();
    }

    async function loadDashboard() {
        try {
            const { data, error } = await supabase.rpc('admin_user_stats');
            if (error) throw error;
            usersData = data || [];
            renderDashboard();
        } catch (err) { showToast(err.message, 'error'); }
    }

    function renderDashboard() {
        const searchTerm = $('searchUser').value.toLowerCase();
        const filterStatus = $('filterStatus').value;

        let filtered = usersData.filter(u => u.username.toLowerCase().includes(searchTerm) && (filterStatus === 'all' || u.status === filterStatus));

        $('statTotalUsers').textContent = usersData.length;
        $('statApproved').textContent = usersData.filter(u => u.status === 'approved').length;
        $('statPending').textContent = usersData.filter(u => u.status === 'pending').length;
        $('statBlocked').textContent = usersData.filter(u => ['blocked', 'rejected'].includes(u.status)).length;

        const tbody = $('userTableBody');
        tbody.innerHTML = '';

        if (filtered.length === 0) $('userEmptyState').classList.remove('hidden');
        else {
            $('userEmptyState').classList.add('hidden');
            filtered.forEach(u => {
                const dateStr = new Date(u.created_at).toLocaleDateString('bn-BD', { year: 'numeric', month: 'short', day: 'numeric' });
                let statusBadge = u.status === 'approved' ? '<span class="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-[10px]">অ্যাপ্রুভড</span>' :
                                  u.status === 'pending' ? '<span class="px-2 py-1 bg-amber-100 text-amber-700 rounded text-[10px]">পেন্ডিং</span>' :
                                  `<span class="px-2 py-1 bg-rose-100 text-rose-700 rounded text-[10px]">${u.status === 'blocked' ? 'ব্লকড' : 'বাতিল'}</span>`;
                
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors';
                
                // Event Delegation Data Attributes
                tr.innerHTML = `
                    <td class="p-4 flex items-center gap-2"><div class="w-8 h-8 rounded bg-slate-200 flex items-center justify-center"><i class="fa-solid fa-user"></i></div><span>@${escapeHTML(u.username)}</span></td>
                    <td class="p-4 text-center text-xs uppercase">${u.role === 'admin' ? '<span class="text-amber-500"><i class="fa-solid fa-shield"></i> Admin</span>' : 'User'}</td>
                    <td class="p-4 text-center">${statusBadge}</td>
                    <td class="p-4 text-center font-black">${u.tx_count} / ${u.meal_count}</td>
                    <td class="p-4 text-right text-xs">${dateStr}</td>
                    <td class="p-4 text-center space-x-2">
                        ${['pending','rejected','blocked'].includes(u.status) ? `<button data-action="approve" data-id="${u.id}" data-name="${escapeHTML(u.username)}" class="admin-action-btn w-8 h-8 rounded bg-emerald-100 text-emerald-600 hover:bg-emerald-500 hover:text-white"><i class="fa-solid fa-check"></i></button>` : ''}
                        ${u.status === 'pending' ? `<button data-action="reject" data-id="${u.id}" data-name="${escapeHTML(u.username)}" class="admin-action-btn w-8 h-8 rounded bg-amber-100 text-amber-600 hover:bg-amber-500 hover:text-white"><i class="fa-solid fa-xmark"></i></button>` : ''}
                        ${u.status === 'approved' && u.role !== 'admin' ? `<button data-action="block" data-id="${u.id}" data-name="${escapeHTML(u.username)}" class="admin-action-btn w-8 h-8 rounded bg-rose-100 text-rose-600 hover:bg-rose-500 hover:text-white"><i class="fa-solid fa-ban"></i></button>` : ''}
                        ${u.role !== 'admin' ? `<button data-action="delete" data-id="${u.id}" data-name="${escapeHTML(u.username)}" class="admin-action-btn w-8 h-8 rounded bg-slate-200 text-slate-600 hover:bg-rose-600 hover:text-white"><i class="fa-solid fa-trash"></i></button>` : ''}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    }

    // Event Delegation for Admin Actions
    $('userTableBody').addEventListener('click', (e) => {
        const btn = e.target.closest('.admin-action-btn');
        if (!btn) return;
        
        const { id, action, name } = btn.dataset;
        actionTarget = { id, action, name };
        
        const modal = $('confirmModal');
        const title = $('confirmModalTitle');
        const text = $('confirmModalText');
        const icon = $('confirmModalIcon');
        const exeBtn = $('executeConfirmBtn');

        modal.classList.remove('hidden');

        if (action === 'approve') {
            icon.className = 'w-16 h-16 mx-auto rounded-full flex items-center justify-center text-3xl mb-2 bg-emerald-100 text-emerald-500'; icon.innerHTML = '<i class="fa-solid fa-check"></i>';
            title.textContent = 'অ্যাপ্রুভ করুন'; text.textContent = `@${name} কে সিস্টেমে প্রবেশের অনুমতি দিতে চান?`;
            exeBtn.className = 'flex-1 py-3 rounded-xl font-black text-white bg-emerald-500';
        } else if (action === 'reject') {
            icon.className = 'w-16 h-16 mx-auto rounded-full flex items-center justify-center text-3xl mb-2 bg-amber-100 text-amber-500'; icon.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            title.textContent = 'আবেদন বাতিল'; text.textContent = `@${name} এর আবেদন বাতিল করতে চান?`;
            exeBtn.className = 'flex-1 py-3 rounded-xl font-black text-white bg-amber-500';
        } else if (action === 'block') {
            icon.className = 'w-16 h-16 mx-auto rounded-full flex items-center justify-center text-3xl mb-2 bg-rose-100 text-rose-500'; icon.innerHTML = '<i class="fa-solid fa-ban"></i>';
            title.textContent = 'অ্যাকাউন্ট ব্লক'; text.textContent = `@${name} কে ব্লক করতে চান?`;
            exeBtn.className = 'flex-1 py-3 rounded-xl font-black text-white bg-rose-500';
        } else if (action === 'delete') {
            icon.className = 'w-16 h-16 mx-auto rounded-full flex items-center justify-center text-3xl mb-2 bg-rose-500 text-white'; icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
            title.textContent = 'সম্পূর্ণ ডিলিট'; text.innerHTML = `<span class="text-rose-500 font-black">সতর্কতা:</span> @${name} এর অ্যাকাউন্ট সব মুছে যাবে!`;
            exeBtn.className = 'flex-1 py-3 rounded-xl font-black text-white bg-slate-900';
        }
    });

    $('cancelConfirmBtn').onclick = () => { $('confirmModal').classList.add('hidden'); actionTarget = null; };
    $('confirmModalBackdrop').onclick = $('cancelConfirmBtn').onclick;

    $('executeConfirmBtn').onclick = async () => {
        if (!actionTarget) return;
        const { id, action, name } = actionTarget;
        const btn = $('executeConfirmBtn');
        const ogText = btn.textContent;
        
        try {
            btn.disabled = true; btn.textContent = 'অপেক্ষা করুন...';

            if (['approve', 'reject', 'block'].includes(action)) {
                let newStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'blocked';
                const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', id);
                if (error) throw error;
                showToast(`@${name} এর স্ট্যাটাস আপডেট করা হয়েছে`);
            } 
            else if (action === 'delete') {
                // High Fix: Storage Pagination (Fetches all files to prevent orphans)
                let allFiles = [];
                let offset = 0;
                const limit = 100;
                while (true) {
                    const { data: files } = await supabase.storage.from('receipts').list(id, { limit, offset });
                    if (!files || files.length === 0) break;
                    allFiles.push(...files);
                    if (files.length < limit) break;
                    offset += limit;
                }
                
                if (allFiles.length > 0) {
                    const paths = allFiles.map(f => `${id}/${f.name}`);
                    // Delete in chunks of 100
                    for (let i = 0; i < paths.length; i += 100) {
                        await supabase.storage.from('receipts').remove(paths.slice(i, i + 100));
                    }
                }
                
                const { error } = await supabase.rpc('admin_delete_user', { target: id });
                if (error) throw error;
                showToast(`@${name} কে চিরতরে মুছে ফেলা হয়েছে`);
            }
            $('confirmModal').classList.add('hidden');
            loadDashboard();
        } catch (err) { showToast(err.message, 'error'); } 
        finally { btn.disabled = false; btn.textContent = ogText; actionTarget = null; }
    };

    $('searchUser').addEventListener('input', renderDashboard);
    $('filterStatus').addEventListener('change', renderDashboard);
    $('refreshBtn').addEventListener('click', () => { showToast('ডেটা রিফ্রেশ হচ্ছে...'); loadDashboard(); });
    $('adminLogoutBtn').addEventListener('click', async () => { await supabase.auth.signOut(); window.location.replace('../index.html'); });
    $('returnHomeBtn').addEventListener('click', () => { window.location.replace('../index.html'); });

    $('themeToggleBtn').addEventListener('click', () => {
        const html = document.documentElement;
        html.classList.toggle('dark');
        const isDark = html.classList.contains('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        $('themeToggleBtn').innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    });

    document.addEventListener('DOMContentLoaded', () => {
        const isDark = document.documentElement.classList.contains('dark');
        $('themeToggleBtn').innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
        checkAccess();
    });
})();