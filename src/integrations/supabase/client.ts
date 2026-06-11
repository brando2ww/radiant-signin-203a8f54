import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://frbziqazwhymwsrtneoy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyYnppcWF6d2h5bXdzcnRuZW95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMDI1NDcsImV4cCI6MjA3NTU3ODU0N30.qqsPBZW5H2z97grckj8LJeJVpQM0oB_hTM4KCtacezw";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});