/**
 * ==========================================
 * RCIVE DAILY - CONFIGURATION
 * ==========================================
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to your Supabase Dashboard: https://supabase.com/dashboard
 * 2. Select your project.
 * 3. Open Project Settings -> API (or "API Keys").
 * 4. Copy the "Project URL" into SUPABASE_URL below.
 * 5. Copy the "anon" key (starts with eyJ...) OR the "Publishable key"
 *    (starts with sb_publishable_...) into SUPABASE_ANON_KEY below.
 *
 * WARNING: NEVER put the "service_role" or "sb_secret_..." key here!
 * The anon/publishable key is safe to expose in the frontend ONLY because
 * Row Level Security (RLS) is enabled by schema.sql.
 */

window.App = window.App || {};

App.Config = Object.freeze({
    // Replace with your Supabase Project URL (e.g. https://abcdefgh.supabase.co)
    SUPABASE_URL: 'https://hgblsnlgxdiklmazrfoi.supabase.co',

    // Replace with your Supabase anon / publishable key
    SUPABASE_ANON_KEY: 'sb_publishable_x3SLocuWJL13Vy1yS6n7RQ_SJkeS5pR',

    // True only after both placeholders above were replaced with real values
    isConfigured() {
        return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(this.SUPABASE_URL) &&
               typeof this.SUPABASE_ANON_KEY === 'string' &&
               this.SUPABASE_ANON_KEY.length > 20 &&
               !this.SUPABASE_ANON_KEY.startsWith('YOUR_');
    }
});
