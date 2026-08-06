import { supabase } from "./config.js";

const suggestionForm = document.getElementById("suggestion-form");
const suggestionLoginPrompt = document.getElementById(
  "suggestion-login-prompt"
);
const suggestionMessage = document.getElementById(
  "suggestion-message"
);
const suggestionList = document.getElementById("suggestion-list");
const suggestionCount = document.getElementById("suggestion-count");
const suggestionListTitle = document.getElementById(
  "suggestion-list-title"
);
const refreshButton = document.getElementById(
  "suggestion-refresh-button"
);
const authLink = document.getElementById("suggestion-auth-link");
const submitButton = document.getElementById(
  "suggestion-submit-button"
);

const seoulDateTimeFormatter = new Intl.DateTimeFormat(
  "ko-KR",
  {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }
);

let currentUser = null;
let currentRole = null;
let suggestions = [];

refreshButton.addEventListener("click", loadSuggestions);

suggestionForm.addEventListener("submit", submitSuggestion);

suggestionList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest(
    "[data-delete-suggestion-id]"
  );

  if (!deleteButton) {
    return;
  }

  deleteSuggestion(deleteButton.dataset.deleteSuggestionId);
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return seoulDateTimeFormatter.format(new Date(value));
}

function showMessage(message, isError = false) {
  suggestionMessage.textContent = message;
  suggestionMessage.classList.toggle("error-message", isError);
  suggestionMessage.hidden = !message;
}

function canDeleteSuggestion(suggestion) {
  return Boolean(
    currentUser && suggestion && currentRole === "admin"
  );
}

function renderPrivateNotice() {
  suggestions = [];
  suggestionCount.textContent = "비공개";
  suggestionListTitle.textContent = "비공개 건의사항";
  refreshButton.hidden = true;
  suggestionList.innerHTML = `
    <div class="suggestion-empty">
      <span aria-hidden="true">🔒</span>
      <strong>작성 내용은 관리자만 확인할 수 있습니다.</strong>
      <p>제목, 본문, 작성자 정보는 다른 이용자에게 공개되지 않습니다.</p>
    </div>
  `;
}

function renderSuggestions() {
  suggestionListTitle.textContent = "접수된 건의사항";
  suggestionCount.textContent = `${suggestions.length}건`;
  refreshButton.hidden = false;

  if (suggestions.length === 0) {
    suggestionList.innerHTML = `
      <div class="suggestion-empty">
        <span aria-hidden="true">✦</span>
        <strong>아직 등록된 건의사항이 없습니다.</strong>
        <p>첫 번째 개선 아이디어를 남겨주세요.</p>
      </div>
    `;
    return;
  }

  suggestionList.innerHTML = suggestions
    .map((suggestion) => `
      <article class="suggestion-post">
        <header class="suggestion-post-header">
          <div>
            <h3>${escapeHtml(suggestion.title)}</h3>
            <p>
              <span>${escapeHtml(suggestion.author_name || "이용자")}</span>
              <span aria-hidden="true">·</span>
              <time datetime="${escapeHtml(suggestion.created_at)}">
                ${escapeHtml(formatDateTime(suggestion.created_at))}
              </time>
            </p>
          </div>
          ${
            canDeleteSuggestion(suggestion)
              ? `
                <button
                  type="button"
                  class="suggestion-delete-button"
                  data-delete-suggestion-id="${escapeHtml(suggestion.id)}"
                  aria-label="${escapeHtml(suggestion.title)} 게시글 삭제"
                >
                  삭제
                </button>
              `
              : ""
          }
        </header>
        <p class="suggestion-post-content">
          ${escapeHtml(suggestion.content)}
        </p>
      </article>
    `)
    .join("");
}

async function loadSuggestions() {
  if (currentRole !== "admin") {
    renderPrivateNotice();
    return;
  }

  suggestionList.setAttribute("aria-busy", "true");

  const { data, error } = await supabase
    .from("suggestions")
    .select(`
      id,
      user_id,
      author_name,
      title,
      content,
      created_at
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  suggestionList.removeAttribute("aria-busy");

  if (error) {
    suggestionList.innerHTML = `
      <div class="suggestion-empty is-error">
        <strong>건의사항을 불러오지 못했습니다.</strong>
        <p>Supabase에서 건의사항 SQL을 실행했는지 확인해 주세요.</p>
      </div>
    `;
    showMessage(
      `건의사항 조회 오류: ${error.message}`,
      true
    );
    return;
  }

  suggestions = data ?? [];
  renderSuggestions();
}

async function submitSuggestion(event) {
  event.preventDefault();

  if (!currentUser) {
    window.location.href = "./login.html";
    return;
  }

  const title = document
    .getElementById("suggestion-title")
    .value.trim();
  const content = document
    .getElementById("suggestion-content")
    .value.trim();

  if (!title || !content) {
    showMessage("제목과 내용을 모두 입력해 주세요.", true);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "등록 중...";
  showMessage("");

  const { error } = await supabase
    .from("suggestions")
    .insert({ title, content });

  submitButton.disabled = false;
  submitButton.textContent = "비공개 접수";

  if (error) {
    showMessage(`게시글 등록 오류: ${error.message}`, true);
    return;
  }

  suggestionForm.reset();
  showMessage(
    "건의사항이 비공개로 접수되었습니다. 작성 내용은 관리자만 확인할 수 있습니다."
  );

  if (currentRole === "admin") {
    await loadSuggestions();
  } else {
    renderPrivateNotice();
  }
}

async function deleteSuggestion(suggestionId) {
  const suggestion = suggestions.find(
    (item) => String(item.id) === String(suggestionId)
  );

  if (!suggestion || !canDeleteSuggestion(suggestion)) {
    showMessage("이 게시글을 삭제할 권한이 없습니다.", true);
    return;
  }

  const confirmed = window.confirm(
    `“${suggestion.title}” 게시글을 삭제할까요?`
  );

  if (!confirmed) {
    return;
  }

  const { error } = await supabase
    .from("suggestions")
    .delete()
    .eq("id", suggestion.id);

  if (error) {
    showMessage(`게시글 삭제 오류: ${error.message}`, true);
    return;
  }

  showMessage("게시글이 삭제되었습니다.");
  if (currentRole === "admin") {
    await loadSuggestions();
  } else {
    renderPrivateNotice();
  }
}

async function initialize() {
  const {
    data: { user }
  } = await supabase.auth.getUser();

  currentUser = user ?? null;

  if (currentUser) {
    const { data: permission } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    currentRole = permission?.role ?? null;
    suggestionForm.hidden = false;
    suggestionLoginPrompt.hidden = true;
    authLink.textContent = currentRole === "admin"
      ? "관리자 페이지"
      : "예약 페이지";
    authLink.href = currentRole === "admin"
      ? "./admin.html"
      : "./reservation.html";
  } else {
    suggestionForm.hidden = true;
    suggestionLoginPrompt.hidden = false;
  }

  await loadSuggestions();
}

initialize();
