import {
  supabase,
  getCurrentUser,
  logout
} from "./config.js";

let currentUser = null;
let reservations = [];

const ACTIVE_RESERVATION_STATUSES = new Set([
  "documents_pending",
  "ready"
]);

document
  .getElementById("logout-button")
  .addEventListener("click", logout);

async function initialize() {
  currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  await loadReservations();
}

async function loadReservations() {
  const { data, error } = await supabase
    .from("reservations")
    .select(`
      *,
      teams(team_name),
      reservation_members(*),
      usage_reports(*),
      extension_requests(*)
    `)
    .order("start_at", {
      ascending: true
    });

  if (error) {
    alert(error.message);
    return;
  }

  const now = Date.now();

  reservations = (data ?? []).filter((reservation) => {
    const members = reservation.reservation_members ?? [];
    const effectiveEnd = new Date(
      reservation.effective_end_at ?? reservation.end_at
    ).getTime();
    const hasCompleteParticipantInfo =
      members.length === Number(reservation.headcount);

    return (
      ACTIVE_RESERVATION_STATUSES.has(reservation.status) &&
      Number.isFinite(effectiveEnd) &&
      effectiveEnd >= now &&
      hasCompleteParticipantInfo
    );
  });
  renderReservations();
}

function formatDate(value) {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul"
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getStatusLabel(status) {
  const labels = {
    documents_pending: "수료증 확인 대기",
    ready: "이용 가능",
    completed: "이용 완료",
    cancelled: "취소"
  };

  return labels[status] ?? status;
}

function renderReservations() {
  const container =
    document.getElementById("reservation-list");

  if (reservations.length === 0) {
    container.innerHTML =
      `<section class="card">
        <h2>현재 예약이 없습니다</h2>
        <p class="muted">새 예약을 만들면 이곳에서 현재 예약을 확인할 수 있습니다.</p>
        <a class="button" href="./reservation.html">새 예약 만들기</a>
      </section>`;
    return;
  }

  container.innerHTML = reservations
    .map((reservation) => {
      const members =
        reservation.reservation_members ?? [];

      const submittedCertificateCount = members.filter(
        (member) => Boolean(member.safety_certificate_path)
      ).length;

      const reports =
        reservation.usage_reports ?? [];

      const status = escapeHtml(reservation.status);

      return `
        <section class="card reservation-card">
          <div class="reservation-heading">
            <div>
              <p class="eyebrow">Reservation</p>
              <h2>${escapeHtml(reservation.teams?.team_name ?? "팀")}</h2>
            </div>
            <span class="status-badge status-${status}">
              ${escapeHtml(getStatusLabel(reservation.status))}
            </span>
          </div>

          <div class="reservation-meta">
            <div class="meta-item">
              <span>이용 시간</span>
              <strong>
                ${formatDate(reservation.start_at)}<br>
                ${formatDate(reservation.end_at)}
              </strong>
            </div>
            <div class="meta-item">
              <span>사용 목적</span>
              <strong>${escapeHtml(reservation.purpose)}</strong>
            </div>
            <div class="meta-item">
              <span>인원 · 수료증</span>
              <strong>${reservation.headcount}명 · ${submittedCertificateCount}/${reservation.headcount}건</strong>
            </div>
          </div>

          <div class="reservation-actions">
            <button
              type="button"
              class="cancel-button"
              data-id="${reservation.id}"
            >
              예약 취소
            </button>
          </div>

          <div class="workflow-grid">
            <section class="workflow-panel">
              <h3>참여자 수료증</h3>
              <p>PDF, JPG, PNG · 최대 10MB</p>
              ${
                members.length === 0
                  ? `
                    <form class="member-form" data-id="${reservation.id}">
                      <input name="memberName" placeholder="참여자 이름" aria-label="참여자 이름" required>
                      <input name="studentId" placeholder="학번" aria-label="참여자 학번" required>
                      <input name="memberEmail" type="email" placeholder="가입 이메일" aria-label="참여자 이메일" required>
                      <input name="certificate" type="file" accept=".pdf,.jpg,.jpeg,.png" aria-label="수료증 파일" required>
                      <button type="submit">수료증 제출</button>
                    </form>
                  `
                  : `
                    <div class="participant-upload-list">
                      ${members.map((member) => `
                        <div class="participant-upload-row">
                          <div class="participant-upload-name">
                            <strong>${escapeHtml(member.member_name)}</strong>
                            <span>
                              ${escapeHtml(member.student_id)} ·
                              ${escapeHtml(member.member_email ?? "이메일 미등록")}
                            </span>
                          </div>
                          ${
                            member.safety_certificate_path
                              ? `
                                <span class="status-badge status-ready">
                                  ${member.certificate_verified ? "확인 완료" : "제출 완료"}
                                </span>
                              `
                              : `
                                <form
                                  class="certificate-form"
                                  data-id="${reservation.id}"
                                  data-member-id="${member.id}"
                                  data-student-id="${escapeHtml(member.student_id)}"
                                >
                                  <input
                                    name="certificate"
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    aria-label="${escapeHtml(member.member_name)} 수료증 파일"
                                    required
                                  >
                                  <button type="submit">수료증 제출</button>
                                </form>
                              `
                          }
                        </div>
                      `).join("")}
                    </div>
                  `
              }
            </section>

            <section class="workflow-panel">
              <h3>연장 신청</h3>
              <p>필요한 연장 시간과 사유를 입력하세요.</p>
              <form class="extension-form" data-id="${reservation.id}">
                <input name="minutes" type="number" min="1" max="120" placeholder="연장시간(분)" aria-label="연장시간" required>
                <input name="reason" placeholder="연장 사유" aria-label="연장 사유" required>
                <button type="submit">연장 신청</button>
              </form>
            </section>

            <section class="workflow-panel">
              <h3>이용확인서</h3>
              <p>이용을 마친 후 확인서를 제출하세요.</p>
              ${
                reports.length > 0
                  ? `<div class="message">이용확인서 제출 완료</div>`
                  : `
                    <form class="report-form" data-id="${reservation.id}">
                      <input name="report" type="file" accept=".pdf,.jpg,.jpeg,.png" aria-label="이용확인서 파일" required>
                      <textarea name="notes" placeholder="특이사항" aria-label="특이사항"></textarea>
                      <button type="submit">이용확인서 제출</button>
                    </form>
                  `
              }
            </section>
          </div>
        </section>
      `;
    })
    .join("");

  attachEventListeners();
}

function validateFile(file) {
  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png"
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error(
      "PDF, JPG, PNG 파일만 제출할 수 있습니다."
    );
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error(
      "파일 크기는 최대 10MB입니다."
    );
  }
}

function getExtension(fileName) {
  return fileName.split(".").pop().toLowerCase();
}

function attachEventListeners() {
  document
    .querySelectorAll(".cancel-button")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm("예약을 취소하시겠습니까?")) {
          return;
        }

        const { error } = await supabase.rpc(
          "cancel_my_reservation",
          {
            p_reservation_id: button.dataset.id
          }
        );

        if (error) {
          alert(error.message);
          return;
        }

        alert("예약을 취소했습니다.");
        await loadReservations();
      });
    });

  document
    .querySelectorAll(".member-form")
    .forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const reservationId = form.dataset.id;
        const memberName =
          form.memberName.value.trim();
        const studentId =
          form.studentId.value.trim();
        const memberEmail =
          form.memberEmail.value.trim().toLowerCase();
        const file = form.certificate.files[0];

        const { data: emailChecks, error: emailCheckError } =
          await supabase.rpc("check_registered_participant_emails", {
            p_emails: [memberEmail]
          });

        if (emailCheckError) {
          alert(emailCheckError.message);
          return;
        }

        if (!emailChecks?.[0]?.is_registered) {
          alert("가입되지 않은 이메일입니다.");
          return;
        }

        try {
          validateFile(file);
        } catch (error) {
          alert(error.message);
          return;
        }

        const extension =
          getExtension(file.name);

        const path =
          `${currentUser.id}/` +
          `${reservationId}/` +
          `${studentId}-${Date.now()}.${extension}`;

        const {
          error: uploadError
        } = await supabase.storage
          .from("safety-certificates")
          .upload(path, file, {
            upsert: false
          });

        if (uploadError) {
          alert(uploadError.message);
          return;
        }

        const {
          error: memberError
        } = await supabase
          .from("reservation_members")
          .insert({
            reservation_id: reservationId,
            member_name: memberName,
            student_id: studentId,
            member_email: memberEmail,
            safety_certificate_path: path,
            safety_submitted_at:
              new Date().toISOString()
          });

        if (memberError) {
          await supabase.storage
            .from("safety-certificates")
            .remove([path]);

          alert(memberError.message);
          return;
        }

        alert("수료증을 제출했습니다.");
        await loadReservations();
      });
    });

  document
    .querySelectorAll(".certificate-form")
    .forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const reservationId = form.dataset.id;
        const memberId = form.dataset.memberId;
        const studentId = form.dataset.studentId;
        const file = form.certificate.files[0];

        try {
          validateFile(file);
        } catch (error) {
          alert(error.message);
          return;
        }

        const extension = getExtension(file.name);
        const path =
          `${currentUser.id}/` +
          `${reservationId}/` +
          `${studentId}-${Date.now()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from("safety-certificates")
          .upload(path, file, { upsert: false });

        if (uploadError) {
          alert(uploadError.message);
          return;
        }

        const { error: memberError } = await supabase
          .from("reservation_members")
          .update({
            safety_certificate_path: path,
            safety_submitted_at: new Date().toISOString()
          })
          .eq("id", memberId)
          .eq("reservation_id", reservationId);

        if (memberError) {
          await supabase.storage
            .from("safety-certificates")
            .remove([path]);

          alert(memberError.message);
          return;
        }

        alert("수료증을 제출했습니다.");
        await loadReservations();
      });
    });

  document
    .querySelectorAll(".extension-form")
    .forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const { error } = await supabase
          .from("extension_requests")
          .insert({
            reservation_id: form.dataset.id,
            requested_minutes:
              Number(form.minutes.value),
            reason: form.reason.value.trim()
          });

        if (error) {
          alert(error.message);
          return;
        }

        alert("연장 신청을 제출했습니다.");
        await loadReservations();
      });
    });

  document
    .querySelectorAll(".report-form")
    .forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const reservationId = form.dataset.id;
        const file = form.report.files[0];

        try {
          validateFile(file);
        } catch (error) {
          alert(error.message);
          return;
        }

        const extension =
          getExtension(file.name);

        const path =
          `${currentUser.id}/` +
          `${reservationId}/` +
          `usage-report-${Date.now()}.${extension}`;

        const {
          error: uploadError
        } = await supabase.storage
          .from("usage-reports")
          .upload(path, file, {
            upsert: false
          });

        if (uploadError) {
          alert(uploadError.message);
          return;
        }

        const {
          error: reportError
        } = await supabase
          .from("usage_reports")
          .insert({
            reservation_id: reservationId,
            file_path: path,
            notes: form.notes.value.trim()
          });

        if (reportError) {
          await supabase.storage
            .from("usage-reports")
            .remove([path]);

          alert(reportError.message);
          return;
        }

        alert("이용확인서를 제출했습니다.");
        await loadReservations();
      });
    });
}

initialize();
