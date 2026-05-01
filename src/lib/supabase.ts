import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isMockMode =
  !supabaseUrl ||
  supabaseUrl === 'your-project-url-here' ||
  supabaseUrl.includes('placeholder') ||
  supabaseUrl === '';

export const supabase = isMockMode ? null : createClient(supabaseUrl, supabaseAnonKey);
