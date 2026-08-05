import {
  supabase,
  getCurrentUser,
  logout
} from "./config.js";

let currentUser = null;
let currentTeamId = null;

document
  .getElementById("logout-button")
  .addEventListener("click", logout);

async function initialize() {
  currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  const profile = await loadProfile();

  if (!profile) {
    return;
  }

  await ensureReservationTeam(profile);
  await loadBookedSlots();
  setDateLimits();
}

async function loadProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  if (error) {
    alert(error.message);
    return null;
  }

  document.getElementById("requester-name").value =
    data.full_name;

  document.getElementById("requester-phone").value =
    data.phone ?? "";

  document.getElementById("department").value =
    data.department;

  document.getElementById("student-id").value =
    data.student_id;

  return data;
}

async function ensureReservationTeam(profile) {
  const { data: existingTeams, error: loadError } = await supabase
    .from("teams")
    .select("id")
    .eq("leader_id", currentUser.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (loadError) {
    alert(`예약 정보 준비 오류: ${loadError.message}`);
    return false;
  }

  if (existingTeams.length > 0) {
    currentTeamId = existingTeams[0].id;
    return true;
  }

  const defaultTeamName =
    `${profile.student_id || currentUser.id.slice(0, 8)} 예약`;

  const { data: createdTeam, error: createError } = await supabase
    .from("teams")
    .insert({
      team_name: defaultTeamName,
      leader_id: currentUser.id
    })
    .select("id")
    .single();

  if (createError) {
    alert(`예약 정보 준비 오류: ${createError.message}`);
    return false;
  }

  currentTeamId = createdTeam.id;
  return true;
}

function setDateLimits() {
  const dateInput =
    document.getElementById("reservation-date");

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);

  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 7);

  dateInput.min =
    minDate.toISOString().slice(0, 10);

  dateInput.max =
    maxDate.toISOString().slice(0, 10);
}

async function loadBookedSlots() {
  const from = new Date();

  const to = new Date();
  to.setDate(to.getDate() + 8);

  const { data, error } = await supabase.rpc(
    "get_booked_slots",
    {
      p_from: from.toISOString(),
      p_to: to.toISOString()
    }
  );

  const container =
    document.getElementById("booked-slots");

  if (error) {
    container.textContent = error.message;
    return;
  }

  if (data.length === 0) {
    container.textContent = "현재 예약된 시간이 없습니다.";
    return;
  }

  container.innerHTML = data
    .map((slot) => {
      const start = new Date(slot.start_at)
        .toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul"
        });

      const end = new Date(slot.end_at)
        .toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul"
        });

      const startParts = start.split(" ");
      const endParts = end.split(" ");

      return `
        <div class="booked-slot">
          <strong>${startParts.slice(0, 3).join(" ")}</strong>
          <span>
            ${startParts.slice(3).join(" ")} ~
            ${endParts.slice(3).join(" ")}
          </span>
        </div>
      `;
    })
    .join("");
}

document
  .getElementById("reservation-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();

    const message =
      document.getElementById("reservation-message");

    if (!currentTeamId) {
      message.textContent =
        "예약 정보를 준비하지 못했습니다. 페이지를 새로고침해 주세요.";
      message.classList.add("error");
      return;
    }

    const date =
      document.getElementById("reservation-date").value;

    const startTime =
      document.getElementById("start-time").value;

    const endTime =
      document.getElementById("end-time").value;

    const startAt =
      new Date(
        `${date}T${startTime}:00+09:00`
      ).toISOString();

    const endAt =
      new Date(
        `${date}T${endTime}:00+09:00`
      ).toISOString();

    const { data, error } = await supabase.rpc(
      "create_room_reservation",
      {
        p_team_id: currentTeamId,

        p_requester_name:
          document.getElementById("requester-name")
            .value.trim(),

        p_requester_phone:
          document.getElementById("requester-phone")
            .value.trim(),

        p_department:
          document.getElementById("department")
            .value.trim(),

        p_student_id:
          document.getElementById("student-id")
            .value.trim(),

        p_headcount:
          Number(
            document.getElementById("headcount").value
          ),

        p_purpose:
          document.getElementById("purpose")
            .value.trim(),

        p_equipment:
          document.getElementById("equipment")
            .value.trim(),

        p_start_at: startAt,
        p_end_at: endAt,

        p_rules_agreed:
          document.getElementById("rules-agreed")
            .checked
      }
    );

    if (error) {
      message.textContent = error.message;
      message.classList.add("error");
      return;
    }

    message.textContent =
      `예약이 완료되었습니다. 예약번호: ${data}`;
    message.classList.remove("error");
    message.classList.add("success");

    event.target.reset();

    await loadBookedSlots();
  });

initialize();
