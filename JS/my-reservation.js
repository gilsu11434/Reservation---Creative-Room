import {
  supabase,
  getCurrentUser,
  logout
} from "./config.js";

let currentUser = null;
let reservations = [];

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
      ascending: false
    });

  if (error) {
    alert(error.message);
    return;
  }

  reservations = data;
  renderReservations();
}

function formatDate(value) {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul"
  });
}

function renderReservations() {
  const container =
    document.getElementById("reservation-list");

  if (reservations.length === 0) {
    container.innerHTML =
      "<p>등록된 예약이 없습니다.</p>";
    return;
  }

  container.innerHTML = reservations
    .map((reservation) => {
      const members =
        reservation.reservation_members ?? [];

      const reports =
        reservation.usage_reports ?? [];

      return `
        <section class="card">
          <h2>
            ${reservation.teams?.team_name ?? "팀"}
          </h2>

          <p>
            ${formatDate(reservation.start_at)}
            ~
            ${formatDate(reservation.end_at)}
          </p>

          <p>목적: ${reservation.purpose}</p>
          <p>인원: ${reservation.headcount}명</p>
          <p>상태: ${reservation.status}</p>

          <p>
            수료증 제출:
            ${members.length}/${reservation.headcount}
          </p>

          <button
            class="cancel-button"
            data-id="${reservation.id}"
          >
            예약 취소
          </button>

          <h3>참여자 수료증 제출</h3>

          <form
            class="member-form"
            data-id="${reservation.id}"
          >
            <input
              name="memberName"
              placeholder="참여자 이름"
              required
            >

            <input
              name="studentId"
              placeholder="학번"
              required
            >

            <input
              name="certificate"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              required
            >

            <button type="submit">
              수료증 제출
            </button>
          </form>

          <h3>연장 신청</h3>

          <form
            class="extension-form"
            data-id="${reservation.id}"
          >
            <input
              name="minutes"
              type="number"
              min="1"
              max="120"
              placeholder="연장시간(분)"
              required
            >

            <input
              name="reason"
              placeholder="연장 사유"
              required
            >

            <button type="submit">
              연장 신청
            </button>
          </form>

          <h3>이용확인서 제출</h3>

          ${
            reports.length > 0
              ? "<p>이용확인서 제출 완료</p>"
              : `
                <form
                  class="report-form"
                  data-id="${reservation.id}"
                >
                  <input
                    name="report"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    required
                  >

                  <textarea
                    name="notes"
                    placeholder="특이사항"
                  ></textarea>

                  <button type="submit">
                    이용확인서 제출
                  </button>
                </form>
              `
          }
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
        const file = form.certificate.files[0];

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