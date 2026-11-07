/**
 * ==========================================
 * RCIVE DAILY - AUTHENTICATION MODULE
 * ==========================================
 */

window.App = window.App || {};

App.Auth = {
    currentUser: null,
    currentProfile: null,

    // Initialize Auth state
    async init() {
        try {
            if (!window.App.Config || !window.App.Config.isConfigured()) {
                console.error("Supabase is not configured properly in config.js");
                return false;
            }

            // Initialize Supabase client
            this.supabaseClient = window.supabase.createClient(
                window.App.Config.SUPABASE_URL,
                window.App.Config.SUPABASE_ANON_KEY
            );

            // Check active session
            const { data: { session }, error } = await this.supabaseClient.auth.getSession();
            if (error) throw error;

            if (session) {
                this.currentUser = session.user;
                await this.fetchUserProfile(this.currentUser.id);
            }

            // Listen for auth changes
            this.supabaseClient.auth.onAuthStateChange(async (event, session) => {
                if (session) {
                    this.currentUser = session.user;
                    await this.fetchUserProfile(this.currentUser.id);
                } else {
                    this.currentUser = null;
                    this.currentProfile = null;
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
            const cleanIdentifier = identifier.toLowerCase().replace(/[^a-z0-9_]/g, '');
            
            if (isSignUp) {
                // Generate a unique email using the username to prevent rate limits on local domain
                const email = `${cleanIdentifier}@rcivedaily.local`;
                const username = cleanIdentifier;

                const { data, error } = await this.supabaseClient.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            username: username,
                            full_name: fullName || username
                        }
                    }
                });

                if (error) throw error;
                return { success: true, message: 'Account created successfully! Please login now.' };
            } else {
                // Sign In logic: Try searching or logging in with the mapped local email
                const email = `${cleanIdentifier}@rcivedaily.local`;

                const { data, error } = await this.supabaseClient.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (error) throw error;
                this.currentUser = data.user;
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
            return { success: true };
        } catch (err) {
            return { success: false, message: err.message };
        }
    }
};