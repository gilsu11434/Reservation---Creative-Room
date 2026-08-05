import { supabase } from "./config.js";

const signupForm = document.getElementById("signup-form");
const loginForm = document.getElementById("login-form");
const signupMessage = document.getElementById("signup-message");
const loginMessage = document.getElementById("login-message");
const tabButtons = document.querySelectorAll("[data-auth-tab]");

function normalizeStudentId(value) {
  return String(value ?? "")
    .trim()
    .replaceAll(" ", "")
    .toLowerCase();
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function convertAuthError(message = "") {
  const normalized = message.toLowerCase();

  if (normalized.includes("email rate limit exceeded")) {
    return "이메일 발송 한도를 초과했습니다. Supabase에서 Confirm email을 끈 뒤 잠시 후 다시 시도해 주세요.";
  }

  if (normalized.includes("user already registered")) {
    return "이미 가입된 이메일입니다. 로그인 탭을 이용해 주세요.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }

  if (normalized.includes("password should be")) {
    return "비밀번호는 8자 이상으로 입력해 주세요.";
  }

  return message || "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function showFormMessage(element, message, type = "error") {
  element.textContent = message;
  element.classList.remove("success", "error");
  element.classList.add(type);
}

function setFormBusy(form, busy) {
  const submitButton = form.querySelector('button[type="submit"]');

  submitButton.disabled = busy;
  submitButton.textContent = busy
    ? "처리 중..."
    : submitButton.dataset.defaultText;
}

function activateTab(tabName) {
  tabButtons.forEach((button) => {
    const active = button.dataset.authTab === tabName;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  document.getElementById("login-panel").hidden = tabName !== "login";
  document.getElementById("signup-panel").hidden = tabName !== "signup";

  const target = document.querySelector(
    tabName === "login" ? "#login-email" : "#signup-name"
  );

  target?.focus();
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => activateTab(button.dataset.authTab));
});

document.querySelectorAll('button[type="submit"]').forEach((button) => {
  button.dataset.defaultText = button.textContent.trim();
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const fullName = document.getElementById("signup-name").value.trim();
  const phone = document.getElementById("signup-phone").value.trim();
  const department = document.getElementById("signup-department").value.trim();
  const studentId = normalizeStudentId(
    document.getElementById("signup-student-id").value
  );
  const contactEmail = normalizeEmail(
    document.getElementById("signup-email").value
  );
  const password = document.getElementById("signup-password").value;
  const passwordConfirm = document.getElementById(
    "signup-password-confirm"
  ).value;

  signupMessage.textContent = "";
  signupMessage.classList.remove("success", "error");

  if (!/^[a-z0-9-]{4,20}$/.test(studentId)) {
    showFormMessage(signupMessage, "학번을 정확히 입력해 주세요.");
    return;
  }

  if (password !== passwordConfirm) {
    showFormMessage(signupMessage, "비밀번호가 서로 일치하지 않습니다.");
    return;
  }

  setFormBusy(signupForm, true);

  try {
    const { data, error } = await supabase.auth.signUp({
      email: contactEmail,
      password,
      options: {
        data: {
          full_name: fullName,
          phone,
          department,
          student_id: studentId,
          contact_email: contactEmail
        }
      }
    });

    if (error) {
      throw error;
    }

    if (!data.user) {
      throw new Error("사용자 계정이 생성되지 않았습니다.");
    }

    if (!data.session) {
      throw new Error(
        "로그인 세션이 생성되지 않았습니다. Supabase의 Confirm email 설정을 꺼주세요."
      );
    }

    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: data.user.id,
        email: contactEmail,
        full_name: fullName,
        phone,
        department,
        student_id: studentId,
        updated_at: new Date().toISOString()
      },
      { onConflict: "id" }
    );

    if (profileError) {
      throw profileError;
    }

    showFormMessage(
      signupMessage,
      "회원가입이 완료되었습니다. 예약 페이지로 이동합니다.",
      "success"
    );

    window.setTimeout(() => {
      window.location.replace("./reservation.html");
    }, 500);
  } catch (error) {
    showFormMessage(signupMessage, convertAuthError(error.message));
  } finally {
    setFormBusy(signupForm, false);
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const loginEmail = normalizeEmail(
    document.getElementById("login-email").value
  );
  const password = document.getElementById("login-password").value;

  loginMessage.textContent = "";
  loginMessage.classList.remove("success", "error");
  setFormBusy(loginForm, true);

  try {
    const { data: resolvedEmail, error: resolveError } =
      await supabase.rpc("resolve_login_email", {
        p_email: loginEmail
      });

    if (resolveError) {
      throw new Error(
        `이메일 로그인 설정 오류: ${resolveError.message}`
      );
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(resolvedEmail || loginEmail),
      password
    });

    if (error) {
      throw error;
    }

    const { data: permission, error: permissionError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (permissionError) {
      throw permissionError;
    }

    showFormMessage(loginMessage, "로그인되었습니다.", "success");

    window.location.replace(
      permission?.role === "admin" ? "./admin.html" : "./reservation.html"
    );
  } catch (error) {
    showFormMessage(loginMessage, convertAuthError(error.message));
  } finally {
    setFormBusy(loginForm, false);
  }
});
