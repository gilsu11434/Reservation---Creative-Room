import {
  supabase,
  getCurrentUser,
  checkApproved,
  logout
} from "./config.js";

const calendar = document.getElementById(
  "admin-reservation-calendar"
);
const calendarMonthLabel = document.getElementById(
  "calendar-month-label"
);
const adminMessage = document.getElementById(
  "admin-message"
);
const reservationDetailDialog = document.getElementById(
  "reservation-detail-dialog"
);
const reservationDetailContent = document.getElementById(
  "reservation-detail-content"
);

const SEOUL_TIME_ZONE = "Asia/Seoul";
const WEEKDAY_LABELS = [
  "일",
  "월",
  "화",
  "수",
  "목",
  "금",
  "토"
];

const seoulDateFormatter = new Intl.DateTimeFormat(
  "en-CA",
  {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }
);

const seoulTimeFormatter = new Intl.DateTimeFormat(
  "ko-KR",
  {
    timeZone: SEOUL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }
);

const seoulDateDetailFormatter = new Intl.DateTimeFormat(
  "ko-KR",
  {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }
);

const seoulDateTimeFormatter = new Intl.DateTimeFormat(
  "ko-KR",
  {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }
);

let allReservations = [];
let visibleYear;
let visibleMonth;

document
  .getElementById("logout-button")
  .addEventListener("click", logout);

document
  .getElementById("refresh-button")
  .addEventListener("click", loadReservations);

document
  .getElementById("calendar-prev-button")
  .addEventListener("click", () => {
    moveVisibleMonth(-1);
  });

document
  .getElementById("calendar-next-button")
  .addEventListener("click", () => {
    moveVisibleMonth(1);
  });

document
  .getElementById("calendar-today-button")
  .addEventListener("click", () => {
    setVisibleMonthToToday();
    renderCalendar();
  });

document
  .getElementById("reservation-detail-close")
  .addEventListener("click", closeReservationDetails);

calendar.addEventListener("click", (event) => {
  const reservationButton = event.target.closest(
    "[data-reservation-id]"
  );

  if (!reservationButton) {
    return;
  }

  openReservationDetails(
    reservationButton.dataset.reservationId
  );
});

reservationDetailDialog.addEventListener("click", (event) => {
  if (event.target === reservationDetailDialog) {
    closeReservationDetails();
  }
});

reservationDetailDialog.addEventListener("close", () => {
  document.body.classList.remove("modal-open");
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(message, isError = false) {
  adminMessage.textContent = message;
  adminMessage.classList.toggle(
    "error-message",
    isError
  );
  adminMessage.hidden = !message;
}

function getDateParts(value = new Date()) {
  const parts = seoulDateFormatter.formatToParts(
    new Date(value)
  );
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day)
  };
}

function makeDateKey(year, month, day) {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

function getReservationDateKey(reservation) {
  const { year, month, day } = getDateParts(
    reservation.start_at
  );

  return makeDateKey(year, month, day);
}

function formatTime(value) {
  if (!value) {
    return "--:--";
  }

  return seoulTimeFormatter.format(new Date(value));
}

function formatDateDetail(value) {
  if (!value) {
    return "-";
  }

  return seoulDateDetailFormatter.format(new Date(value));
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return seoulDateTimeFormatter.format(new Date(value));
}

function formatDuration(startValue, endValue) {
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  const hours = (end - start) / (60 * 60 * 1000);

  if (!Number.isFinite(hours) || hours <= 0) {
    return "-";
  }

  return `${Number(hours.toFixed(2))}시간`;
}

function getStatusLabel(status) {
  const labels = {
    documents_pending: "수료증 확인 대기",
    ready: "이용 가능",
    completed: "이용 완료",
    cancelled: "취소"
  };

  return labels[status] ?? status ?? "상태 미확인";
}

function getCertificateStatus(member) {
  if (member.certificate_verified) {
    return {
      label: "확인 완료",
      className: "status-ready"
    };
  }

  if (member.safety_certificate_path) {
    return {
      label: "제출 완료",
      className: "status-documents_pending"
    };
  }

  return {
    label: "미제출",
    className: "status-cancelled"
  };
}

function renderDetailItem(label, value, className = "") {
  return `
    <div class="admin-detail-item${className ? ` ${className}` : ""}">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value || "-")}</dd>
    </div>
  `;
}

function renderParticipants(reservation) {
  const participants = reservation.reservation_members ?? [];

  if (participants.length === 0) {
    return `
      <p class="admin-detail-empty">
        저장된 참여자 정보가 없습니다.
      </p>
    `;
  }

  return `
    <div class="admin-participant-table-wrap">
      <table class="admin-participant-table">
        <thead>
          <tr>
            <th scope="col">구분</th>
            <th scope="col">이름</th>
            <th scope="col">학번</th>
            <th scope="col">이메일</th>
            <th scope="col">수료증</th>
          </tr>
        </thead>
        <tbody>
          ${participants.map((member, index) => {
            const certificateStatus = getCertificateStatus(member);
            const isRequester =
              String(member.member_email ?? "").toLowerCase() ===
              String(reservation.requester_email ?? "").toLowerCase();

            return `
              <tr>
                <td>${isRequester ? "예약자" : `참여자 ${index + 1}`}</td>
                <td><strong>${escapeHtml(member.member_name || "-")}</strong></td>
                <td>${escapeHtml(member.student_id || "-")}</td>
                <td>${escapeHtml(member.member_email || "-")}</td>
                <td>
                  <span class="status-badge ${certificateStatus.className}">
                    ${certificateStatus.label}
                  </span>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function openReservationDetails(reservationId) {
  const reservation = allReservations.find(
    (item) => String(item.id) === String(reservationId)
  );

  if (!reservation) {
    showMessage("예약 상세정보를 찾지 못했습니다.", true);
    return;
  }

  const effectiveEnd =
    reservation.effective_end_at || reservation.end_at;
  const hasExtension =
    new Date(effectiveEnd).getTime() >
    new Date(reservation.end_at).getTime();
  const status = escapeHtml(reservation.status || "unknown");

  reservationDetailContent.innerHTML = `
    <section class="admin-detail-summary">
      <div>
        <span class="admin-detail-date">
          ${escapeHtml(formatDateDetail(reservation.start_at))}
        </span>
        <strong>
          ${escapeHtml(formatTime(reservation.start_at))}
          <span aria-hidden="true">~</span>
          ${escapeHtml(formatTime(effectiveEnd))}
        </strong>
        <small>
          이용시간 ${escapeHtml(formatDuration(reservation.start_at, effectiveEnd))}
          ${hasExtension ? " · 연장 포함" : ""}
        </small>
      </div>
      <span class="status-badge status-${status}">
        ${escapeHtml(getStatusLabel(reservation.status))}
      </span>
    </section>

    <section class="admin-detail-section">
      <h3>예약자 정보</h3>
      <dl class="admin-detail-grid">
        ${renderDetailItem("예약자 이름", reservation.requester_name)}
        ${renderDetailItem("이메일", reservation.requester_email)}
        ${renderDetailItem("전화번호", reservation.requester_phone)}
        ${renderDetailItem("학과", reservation.department)}
        ${renderDetailItem("학번", reservation.student_id)}
        ${renderDetailItem(
          "사용 인원",
          reservation.headcount == null
            ? "-"
            : `${reservation.headcount}명`
        )}
      </dl>
    </section>

    <section class="admin-detail-section">
      <h3>이용 정보</h3>
      <dl class="admin-detail-grid">
        ${renderDetailItem("사용할 장비", reservation.equipment || "없음")}
        ${renderDetailItem(
          "예약 신청 일시",
          formatDateTime(reservation.created_at)
        )}
        ${renderDetailItem(
          "사용 목적",
          reservation.purpose,
          "is-full"
        )}
        ${renderDetailItem(
          "예약번호",
          String(reservation.id ?? "-"),
          "is-full"
        )}
      </dl>
    </section>

    <section class="admin-detail-section">
      <div class="admin-detail-section-heading">
        <h3>참여자 정보</h3>
        <span>${reservation.reservation_members?.length ?? 0}명</span>
      </div>
      ${renderParticipants(reservation)}
    </section>
  `;

  document.body.classList.add("modal-open");

  if (typeof reservationDetailDialog.showModal === "function") {
    reservationDetailDialog.showModal();
  } else {
    reservationDetailDialog.setAttribute("open", "");
  }
}

function closeReservationDetails() {
  if (typeof reservationDetailDialog.close === "function") {
    reservationDetailDialog.close();
  } else {
    reservationDetailDialog.removeAttribute("open");
    document.body.classList.remove("modal-open");
  }
}

function setVisibleMonthToToday() {
  const today = getDateParts();
  visibleYear = today.year;
  visibleMonth = today.month;
}

function moveVisibleMonth(offset) {
  const date = new Date(
    Date.UTC(visibleYear, visibleMonth - 1 + offset, 1)
  );

  visibleYear = date.getUTCFullYear();
  visibleMonth = date.getUTCMonth() + 1;
  renderCalendar();
}

function groupReservationsByDate() {
  const grouped = new Map();

  allReservations
    .filter((reservation) => reservation.status !== "cancelled")
    .sort(
      (first, second) =>
        new Date(first.start_at) - new Date(second.start_at)
    )
    .forEach((reservation) => {
      const dateKey = getReservationDateKey(reservation);

      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }

      grouped.get(dateKey).push(reservation);
    });

  return grouped;
}

function renderReservation(reservation) {
  const requesterName =
    reservation.requester_name || "이름 없음";
  const startTime = formatTime(reservation.start_at);
  const endTime = formatTime(
    reservation.effective_end_at || reservation.end_at
  );

  return `
    <button
      type="button"
      class="calendar-reservation-item"
      data-reservation-id="${escapeHtml(reservation.id)}"
      aria-label="${escapeHtml(requesterName)} ${escapeHtml(startTime)}부터 ${escapeHtml(endTime)}까지 예약 상세정보 보기"
    >
      <strong class="calendar-reservation-name">
        ${escapeHtml(requesterName)}
      </strong>
      <span class="calendar-reservation-time">
        <strong class="calendar-start-time">
          ${escapeHtml(startTime)}
        </strong>
        <span aria-hidden="true">~</span>
        <span>${escapeHtml(endTime)}</span>
      </span>
      <span class="calendar-reservation-more">상세 보기</span>
    </button>
  `;
}

function renderCalendar() {
  const reservationsByDate = groupReservationsByDate();
  const firstWeekday = new Date(
    Date.UTC(visibleYear, visibleMonth - 1, 1)
  ).getUTCDay();
  const daysInMonth = new Date(
    Date.UTC(visibleYear, visibleMonth, 0)
  ).getUTCDate();
  const today = getDateParts();
  const todayKey = makeDateKey(
    today.year,
    today.month,
    today.day
  );
  const numberOfWeeks = Math.ceil(
    (firstWeekday + daysInMonth) / 7
  );
  const numberOfCells = numberOfWeeks * 7;
  const calendarCells = [];

  calendarMonthLabel.textContent =
    `${visibleYear}년 ${visibleMonth}월`;

  WEEKDAY_LABELS.forEach((label, index) => {
    const weekdayClass =
      index === 0
        ? " is-sunday"
        : index === 6
          ? " is-saturday"
          : "";

    calendarCells.push(`
      <div class="admin-calendar-weekday${weekdayClass}">
        ${label}
      </div>
    `);
  });

  for (let index = 0; index < numberOfCells; index += 1) {
    const day = index - firstWeekday + 1;

    if (day < 1 || day > daysInMonth) {
      calendarCells.push(`
        <div
          class="admin-calendar-day is-outside-month"
          aria-hidden="true"
        ></div>
      `);
      continue;
    }

    const dateKey = makeDateKey(
      visibleYear,
      visibleMonth,
      day
    );
    const dayReservations =
      reservationsByDate.get(dateKey) ?? [];
    const weekday = new Date(
      Date.UTC(visibleYear, visibleMonth - 1, day)
    ).getUTCDay();
    const dayClasses = ["admin-calendar-day"];

    if (dateKey === todayKey) {
      dayClasses.push("is-today");
    }

    if (weekday === 0 || weekday === 6) {
      dayClasses.push("is-weekend");
    }

    calendarCells.push(`
      <section
        class="${dayClasses.join(" ")}"
        aria-label="${visibleYear}년 ${visibleMonth}월 ${day}일, 예약 ${dayReservations.length}건"
      >
        <div class="admin-calendar-date">
          <span>${day}</span>
          ${dateKey === todayKey ? "<small>오늘</small>" : ""}
        </div>
        <div class="calendar-reservation-list">
          ${dayReservations.map(renderReservation).join("")}
        </div>
      </section>
    `);
  }

  calendar.innerHTML = calendarCells.join("");
}

async function loadReservations() {
  showMessage("예약 현황을 불러오는 중입니다.");

  const { data, error } = await supabase
    .from("reservations")
    .select(`
      *,
      reservation_members(*)
    `)
    .order("start_at", { ascending: true });

  if (error) {
    showMessage(
      `예약 현황을 불러오지 못했습니다: ${error.message}`,
      true
    );
    return;
  }

  allReservations = data ?? [];
  renderCalendar();
  showMessage("");
}

async function initialize() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return;
    }

    const permission = await checkApproved(user.id);

    if (permission.role !== "admin") {
      alert("관리자만 접근할 수 있습니다.");
      window.location.href = "./reservation.html";
      return;
    }

    setVisibleMonthToToday();
    await loadReservations();
  } catch (error) {
    showMessage(
      `관리자 확인 오류: ${error.message}`,
      true
    );
  }
}

initialize();
