const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAvatar() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, first_name, avatar_url')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Recent profiles:");
    console.dir(profiles, { depth: null });
  }
}

checkAvatar();
