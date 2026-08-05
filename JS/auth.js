import { supabase } from "./config.js";

const signupForm =
  document.getElementById("signup-form");

const loginForm =
  document.getElementById("login-form");

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const fullName =
    document.getElementById("signup-name").value.trim();

  const phone =
    document.getElementById("signup-phone").value.trim();

  const department =
    document.getElementById("signup-department").value.trim();

  const studentId =
    document.getElementById("signup-student-id").value.trim();

  const email =
    document.getElementById("signup-email").value.trim();

  const password =
    document.getElementById("signup-password").value;

  const redirectUrl =
    new URL("./login.html", window.location.href).href;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectUrl,
      data: {
        full_name: fullName,
        phone,
        department,
        student_id: studentId
      }
    }
  });

  const message =
    document.getElementById("signup-message");

  if (error) {
    message.textContent = error.message;
    return;
  }

  message.textContent =
    "회원가입 이메일을 발송했습니다. 이메일의 인증 링크를 눌러주세요.";
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email =
    document.getElementById("login-email").value.trim();

  const password =
    document.getElementById("login-password").value;

  const message =
    document.getElementById("login-message");

  const {
    data,
    error
  } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    message.textContent = error.message;
    return;
  }

  const user = data.user;
  const metadata = user.user_metadata;

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({
      id: user.id,
      full_name: metadata.full_name,
      phone: metadata.phone,
      department: metadata.department,
      student_id: metadata.student_id,
      updated_at: new Date().toISOString()
    });

  if (profileError) {
    message.textContent =
      `사용자 정보 저장 오류: ${profileError.message}`;
    return;
  }

  const { data: permission, error: permissionError } =
    await supabase
      .from("user_roles")
      .select("role, is_approved")
      .eq("user_id", user.id)
      .single();

  if (permissionError) {
    message.textContent = permissionError.message;
    return;
  }

  if (!permission.is_approved) {
    await supabase.auth.signOut();

    message.textContent =
      "회원가입은 완료됐지만 관리자 승인이 필요합니다.";
    return;
  }

  if (permission.role === "admin") {
    window.location.href = "./admin.html";
  } else {
    window.location.href = "./reservation.html";
  }
});