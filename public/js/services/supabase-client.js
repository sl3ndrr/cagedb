// public/js/services/supabase-client.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3?target=es2022";
import { APP_CONFIG } from "../config.js";
import { assertPublicConfig } from "./public-config.mjs";

const publicConfig = assertPublicConfig(APP_CONFIG);

export const supabase = createClient(
  publicConfig.supabaseUrl,
  publicConfig.supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      persistSession: true,
      storageKey: "cagedb.auth",
    },
  },
);
