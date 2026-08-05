import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabaseUrl = "https://lnbqbtoqcajqwhupkvid.supabase.co";
const supabasePublishableKey = "sb_publishable__0ybYkAl9p4aOLw5yV6Fag_ey8qQ3Oq";

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);

const { data, error } = await supabase.auth.signUp({
  email: email,
  password: password
});

if (error) {
  alert(error.message);
} else {
  alert("이메일을 확인해 회원가입을 완료해 주세요.");
}