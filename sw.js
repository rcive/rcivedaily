/**
 * RCIVE DAILY - ADVANCED SERVICE WORKER
 * Offline Caching, CDNs, & Safe Updates
 */

const CACHE_VERSION = 'v1.1'; // আপডেট এলে এই ভার্সনটি পরিবর্তন করতে হবে
const STATIC_CACHE = `rcive-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `rcive-dynamic-${CACHE_VERSION}`;

// প্রয়োজনীয় স্ট্যাটিক ফাইল ও আইকন
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './app-auth.js',
    './app-data.js',
    './app-ui.js',
    './app-export.js',
    './config.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// থার্ড-পার্টি CDN লিস্ট
const CDN_HOSTS = [
    'cdn.tailwindcss.com',
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdn.jsdelivr.net'
];

// 1. Safe Install (যাতে একটি ফাইল মিসিং হলেও ইন্সটল ফেইল না করে)
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(STATIC_CACHE).then(async (cache) => {
            for (let asset of STATIC_ASSETS) {
                try {
                    await cache.add(asset);
                } catch (err) {
                    console.warn(`[SW] Failed to cache ${asset}:`, err);
                }
            }
        })
    );
    // skipWaiting() এখানে নেই, যাতে অ্যাপ থেকে আপডেট ব্যানার দেখানো যায়।
});

// 2. Activate & Cleanup Old Caches
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(key => {
                if (key !== STATIC_CACHE && key !== DYNAMIC_CACHE) {
                    return caches.delete(key);
                }
            })
        ))
    );
    self.clients.claim();
});

// 3. Listen for Update Message (ব্যানার থেকে কনফার্ম করলে)
self.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// 4. Fetch Strategy 
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Bypass: POST রিকোয়েস্ট বা অন্য মেথড হলে ক্যাশ করবে না
    if (e.request.method !== 'GET') return; 
    
    // Bypass: Supabase (Auth/API/Storage) সবসময় নেটওয়ার্ক থেকে চলবে
    if (url.hostname.includes('supabase.co')) return;

    // Strategy 1: Admin Pages (Network First, Fallback to Cache)
    if (url.pathname.includes('/admin/')) {
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    const resClone = res.clone();
                    caches.open(DYNAMIC_CACHE).then(cache => cache.put(e.request, resClone));
                    return res;
                })
                .catch(() => caches.match(e.request))
        );
        return;
    }

    // Strategy 2: CDNs (Cache First, Fallback to Network)
    if (CDN_HOSTS.some(host => url.hostname.includes(host))) {
        e.respondWith(
            caches.match(e.request).then(cachedRes => {
                if (cachedRes) return cachedRes; // ক্যাশে পেলে সেটা দেবে
                return fetch(e.request).then(res => {
                    const resClone = res.clone();
                    caches.open(DYNAMIC_CACHE).then(cache => cache.put(e.request, resClone));
                    return res;
                }).catch(err => console.warn('[SW] CDN Fetch failed offline:', err));
            })
        );
        return;
    }

    // Strategy 3: Default App Files (Stale-While-Revalidate / Fallback)
    e.respondWith(
        caches.match(e.request).then(cachedRes => {
            const fetchPromise = fetch(e.request).then(networkRes => {
                caches.open(STATIC_CACHE).then(cache => cache.put(e.request, networkRes.clone()));
                return networkRes;
            }).catch(err => {
                // Navigation Fallback: অফলাইনে রিফ্রেশ দিলে index.html দেখাবে
                if (e.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
                throw err;
            });
            
            return cachedRes || fetchPromise;
        })
    );
});