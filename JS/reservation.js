import {
  supabase,
  getCurrentUser,
  logout
} from "./config.js";

let currentUser = null;

const teamSelect =
  document.getElementById("team-select");

document
  .getElementById("logout-button")
  .addEventListener("click", logout);

async function initialize() {
  currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  await loadProfile();
  await loadTeams();
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
    return;
  }

  document.getElementById("requester-name").value =
    data.full_name;

  document.getElementById("requester-phone").value =
    data.phone ?? "";

  document.getElementById("department").value =
    data.department;

  document.getElementById("student-id").value =
    data.student_id;
}

async function loadTeams() {
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .order("created_at");

  if (error) {
    alert(error.message);
    return;
  }

  teamSelect.innerHTML = "";

  if (data.length === 0) {
    const option = document.createElement("option");
    option.textContent = "먼저 팀을 만들어주세요.";
    option.value = "";
    teamSelect.appendChild(option);
    return;
  }

  data.forEach((team) => {
    const option = document.createElement("option");
    option.value = team.id;
    option.textContent = team.team_name;
    teamSelect.appendChild(option);
  });
}

document
  .getElementById("team-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();

    const teamName =
      document.getElementById("team-name").value.trim();

    const { error } = await supabase
      .from("teams")
      .insert({
        team_name: teamName,
        leader_id: currentUser.id
      });

    const message =
      document.getElementById("team-message");

    if (error) {
      message.textContent = error.message;
      return;
    }

    message.textContent = "팀을 만들었습니다.";
    event.target.reset();

    await loadTeams();
  });

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
        p_team_id: teamSelect.value,

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

    const message =
      document.getElementById("reservation-message");

    if (error) {
      message.textContent = error.message;
      return;
    }

    message.textContent =
      `예약이 완료되었습니다. 예약번호: ${data}`;

    event.target.reset();

    await loadBookedSlots();
  });

initialize();
