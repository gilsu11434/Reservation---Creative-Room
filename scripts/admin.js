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
    <div class="calendar-reservation-item">
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
    </div>
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
      requester_name,
      start_at,
      end_at,
      effective_end_at,
      status
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
