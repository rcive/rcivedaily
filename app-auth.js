/**
 * ==========================================
 * RCIVE DAILY - AUTHENTICATION MODULE
 * ==========================================
 */

window.App = window.App || {};

App.Auth = {
    currentUser: null,
    currentProfile: null,
    supabaseClient: null,

    // Initialize Auth state
    async init() {
        try {
            if (!window.App.Config || !window.App.Config.isConfigured()) {
                console.error("Supabase is not configured properly in config.js");
                return false;
            }

            // Initialize Supabase client and assign to global App object (Critical 1 Fix)
            this.supabaseClient = window.supabase.createClient(
                window.App.Config.SUPABASE_URL,
                window.App.Config.SUPABASE_ANON_KEY
            );
            App.supabase = this.supabaseClient;

            // Check active session
            const { data: { session }, error } = await this.supabaseClient.auth.getSession();
            if (error) throw error;

            if (session) {
                this.currentUser = session.user;
                if(App.State) App.State.user = session.user;
                await this.fetchUserProfile(session.user.id);
            }

            // Listen for auth changes (Fixed await deadlock issue)
            this.supabaseClient.auth.onAuthStateChange((event, session) => {
                if (session) {
                    this.currentUser = session.user;
                    if(App.State) App.State.user = session.user;
                    // Fetch profile non-blocking
                    this.fetchUserProfile(session.user.id).then(() => {
                        if (event === 'SIGNED_IN') window.location.reload();
                    });
                } else {
                    this.currentUser = null;
                    this.currentProfile = null;
                    if(App.State) App.State.user = null;
                }
            });

            return true;
        } catch (err) {
            console.error("Auth init error:", err.message);
            return false;
        }
    },

    // Fetch user profile from database
    async fetchUserProfile(userId) {
        try {
            const { data, error } = await this.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) throw error;
            this.currentProfile = data;
            return data;
        } catch (err) {
            console.error("Error fetching user profile:", err.message);
            return null;
        }
    },

    // Handle Login / Signup form submit
    async handleAuthSubmit(identifier, password, isSignUp, fullName = '') {
        try {
            // High Fix: Strict username validation
            if (isSignUp) {
                if (identifier.length < 3 || identifier.length > 20) {
                    return { success: false, message: 'ইউজারনেম ৩ থেকে ২০ অক্ষরের মধ্যে হতে হবে।' };
                }
                if (!/^[a-z0-9_]+$/.test(identifier)) {
                    return { success: false, message: 'ইউজারনেমে শুধুমাত্র ছোট হাতের a-z, 0-9 এবং _ ব্যবহার করা যাবে।' };
                }
            }

            const cleanIdentifier = identifier.toLowerCase().trim();
            const email = `${cleanIdentifier}@rcive.app`; // Changed domain
            
            if (isSignUp) {
                const { data, error } = await this.supabaseClient.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            username: cleanIdentifier,
                            full_name: fullName || cleanIdentifier
                        }
                    }
                });

                if (error) throw error;
                return { success: true, message: 'অ্যাকাউন্ট তৈরি হয়েছে! দয়া করে লগইন করুন।' };
            } else {
                const { data, error } = await this.supabaseClient.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (error) throw error;
                this.currentUser = data.user;
                if(App.State) App.State.user = data.user;
                await this.fetchUserProfile(data.user.id);

                return { success: true, profile: this.currentProfile };
            }
        } catch (err) {
            return { success: false, message: err.message };
        }
    },

    // Logout
    async signOut() {
        try {
            const { error } = await this.supabaseClient.auth.signOut();
            if (error) throw error;
            this.currentUser = null;
            this.currentProfile = null;
            if(App.State) App.State.user = null;
            return { success: true };
        } catch (err) {
            return { success: false, message: err.message };
        }
    }
};