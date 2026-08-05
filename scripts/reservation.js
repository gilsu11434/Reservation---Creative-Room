import {
  supabase,
  getCurrentUser,
  logout
} from "./config.js";

let currentUser = null;
let currentTeamId = null;
let currentProfile = null;

const headcountInput = document.getElementById("headcount");
const headcountButtons = document.querySelectorAll("[data-headcount]");
const participantsSection = document.getElementById("participants-section");
const participantFields = document.getElementById("participant-fields");
const participantSummary = document.getElementById("participant-summary");
const startTimeSelect = document.getElementById("start-time");
const endTimeSelect = document.getElementById("end-time");

document
  .getElementById("logout-button")
  .addEventListener("click", logout);

headcountButtons.forEach((button) => {
  button.setAttribute("aria-pressed", "false");

  button.addEventListener("click", () => {
    selectHeadcount(Number(button.dataset.headcount));
  });
});

document
  .getElementById("requester-name")
  .addEventListener("input", updatePrimaryParticipant);

document
  .getElementById("student-id")
  .addEventListener("input", updatePrimaryParticipant);

startTimeSelect.addEventListener("change", updateEndTimeOptions);

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

  currentProfile = data;
  fillProfile(data);

  return data;
}

function fillProfile(profile) {
  document.getElementById("requester-name").value =
    profile.full_name ?? "";

  document.getElementById("requester-phone").value =
    profile.phone ?? "";

  document.getElementById("department").value =
    profile.department ?? "";

  document.getElementById("student-id").value =
    profile.student_id ?? "";

  updatePrimaryParticipant();
}

function getSavedParticipantValues() {
  const saved = new Map();

  participantFields
    .querySelectorAll(".participant-card[data-participant-index]")
    .forEach((card) => {
      const index = Number(card.dataset.participantIndex);
      const nameInput = card.querySelector(".participant-name");
      const studentIdInput = card.querySelector(".participant-student-id");

      if (nameInput && studentIdInput) {
        saved.set(index, {
          name: nameInput.value,
          studentId: studentIdInput.value
        });
      }
    });

  return saved;
}

function selectHeadcount(count) {
  const savedValues = getSavedParticipantValues();

  headcountInput.value = String(count);
  participantSummary.textContent = `${count}명 선택`;
  participantsSection.hidden = false;

  headcountButtons.forEach((button) => {
    const selected = Number(button.dataset.headcount) === count;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });

  renderParticipantFields(count, savedValues);
}

function renderParticipantFields(count, savedValues = new Map()) {
  participantFields.innerHTML = "";

  const primaryCard = document.createElement("div");
  primaryCard.className = "participant-card participant-primary";
  primaryCard.dataset.participantIndex = "0";
  primaryCard.innerHTML = `
    <span class="participant-number">1</span>
    <div class="participant-primary-info">
      <div>
        <span>예약자 이름</span>
        <strong data-primary-name></strong>
      </div>
      <div>
        <span>학번</span>
        <strong data-primary-student-id></strong>
      </div>
    </div>
  `;
  participantFields.appendChild(primaryCard);

  for (let index = 1; index < count; index += 1) {
    const saved = savedValues.get(index) ?? {};
    const card = document.createElement("div");
    card.className = "participant-card";
    card.dataset.participantIndex = String(index);
    card.innerHTML = `
      <span class="participant-number">${index + 1}</span>
      <div class="participant-inputs">
        <label>
          참여자 이름
          <input
            class="participant-name"
            autocomplete="off"
            placeholder="이름을 입력하세요"
            required
          >
        </label>
        <label>
          학번
          <input
            class="participant-student-id"
            inputmode="numeric"
            autocomplete="off"
            placeholder="학번을 입력하세요"
            required
          >
        </label>
      </div>
    `;

    card.querySelector(".participant-name").value = saved.name ?? "";
    card.querySelector(".participant-student-id").value =
      saved.studentId ?? "";
    participantFields.appendChild(card);
  }

  updatePrimaryParticipant();
}

function updatePrimaryParticipant() {
  const nameElement = participantFields.querySelector("[data-primary-name]");
  const studentIdElement = participantFields.querySelector(
    "[data-primary-student-id]"
  );

  if (nameElement) {
    nameElement.textContent =
      document.getElementById("requester-name").value.trim() || "-";
  }

  if (studentIdElement) {
    studentIdElement.textContent =
      document.getElementById("student-id").value.trim() || "-";
  }
}

function collectParticipants() {
  const headcount = Number(headcountInput.value);

  if (!headcount) {
    throw new Error("사용 인원을 선택해 주세요.");
  }

  const participants = [
    {
      member_name: document.getElementById("requester-name").value.trim(),
      student_id: document.getElementById("student-id").value.trim()
    }
  ];

  participantFields
    .querySelectorAll(".participant-card[data-participant-index]")
    .forEach((card) => {
      const index = Number(card.dataset.participantIndex);

      if (index === 0) {
        return;
      }

      const memberName = card.querySelector(".participant-name").value.trim();
      const studentId = card
        .querySelector(".participant-student-id")
        .value.trim();

      if (!memberName || !studentId) {
        throw new Error(`${index + 1}번 참여자의 이름과 학번을 입력해 주세요.`);
      }

      participants.push({
        member_name: memberName,
        student_id: studentId
      });
    });

  const studentIds = participants.map((participant) => participant.student_id);

  if (new Set(studentIds).size !== studentIds.length) {
    throw new Error("같은 학번을 두 번 입력할 수 없습니다.");
  }

  return participants;
}

function resetHeadcountPicker() {
  headcountInput.value = "";
  participantsSection.hidden = true;
  participantFields.innerHTML = "";
  participantSummary.textContent = "";

  headcountButtons.forEach((button) => {
    button.classList.remove("selected");
    button.setAttribute("aria-pressed", "false");
  });
}

function formatHour(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function updateEndTimeOptions() {
  const startHour = Number(startTimeSelect.value.slice(0, 2));

  endTimeSelect.innerHTML = "";

  if (!startTimeSelect.value) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "시작시간을 먼저 선택하세요";
    endTimeSelect.appendChild(option);
    endTimeSelect.disabled = true;
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "종료시간을 선택하세요";
  endTimeSelect.appendChild(placeholder);

  [startHour + 1, startHour + 2]
    .filter((hour) => hour <= 18)
    .forEach((hour) => {
      const value = formatHour(hour);
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      endTimeSelect.appendChild(option);
    });

  endTimeSelect.disabled = false;
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

    let participants;

    try {
      participants = collectParticipants();
    } catch (error) {
      message.textContent = error.message;
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

        p_headcount: participants.length,

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

    const reservationResult = Array.isArray(data) ? data[0] : data;
    const reservationId =
      reservationResult?.reservation_id ??
      reservationResult?.id ??
      reservationResult;

    if (!reservationId) {
      message.textContent =
        "예약은 생성됐지만 예약번호를 확인하지 못했습니다. 관리자에게 문의해 주세요.";
      message.classList.add("error");
      return;
    }

    const memberRows = participants.map((participant) => ({
      reservation_id: reservationId,
      member_name: participant.member_name,
      student_id: participant.student_id
    }));

    const { error: memberError } = await supabase
      .from("reservation_members")
      .insert(memberRows);

    if (memberError) {
      await supabase.rpc("cancel_my_reservation", {
        p_reservation_id: reservationId
      });

      message.textContent =
        `참여자 정보 저장 오류: ${memberError.message}`;
      message.classList.add("error");
      return;
    }

    message.textContent =
      `예약이 완료되었습니다. 예약번호: ${reservationId}`;
    message.classList.remove("error");
    message.classList.add("success");

    event.target.reset();
    resetHeadcountPicker();
    updateEndTimeOptions();

    if (currentProfile) {
      fillProfile(currentProfile);
    }

    setDateLimits();

    await loadBookedSlots();
  });

initialize();
