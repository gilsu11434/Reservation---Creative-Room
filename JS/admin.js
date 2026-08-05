import {
  supabase,
  getCurrentUser,
  checkApproved,
  logout
} from "./config.js";

let allReservations = [];

const userList =
  document.getElementById("user-list");

const reservationList =
  document.getElementById(
    "admin-reservation-list"
  );

const adminMessage =
  document.getElementById("admin-message");

const statusFilter =
  document.getElementById("status-filter");


document
  .getElementById("logout-button")
  .addEventListener("click", logout);


document
  .getElementById("refresh-button")
  .addEventListener("click", async () => {
    await refreshAll();
  });


statusFilter.addEventListener("change", () => {
  renderReservations();
});


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatSeoulDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString(
    "ko-KR",
    {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }
  );
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


function showMessage(message, isError = false) {
  adminMessage.textContent = message;

  adminMessage.classList.toggle(
    "error-message",
    isError
  );
}


async function initialize() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return;
    }

    const permission =
      await checkApproved(user.id);

    if (
      permission.role !== "admin"
      || permission.is_approved !== true
    ) {
      alert("관리자만 접근할 수 있습니다.");

      window.location.href =
        "./reservation.html";

      return;
    }

    await refreshAll();
  } catch (error) {
    showMessage(
      `관리자 확인 오류: ${error.message}`,
      true
    );
  }
}


async function refreshAll() {
  showMessage("데이터를 불러오는 중입니다.");

  try {
    await Promise.all([
      loadUsers(),
      loadReservations()
    ]);

    showMessage(
      "관리자 데이터를 불러왔습니다."
    );
  } catch (error) {
    showMessage(error.message, true);
  }
}


async function loadUsers() {
  const {
    data: profiles,
    error: profileError
  } = await supabase
    .from("profiles")
    .select(`
      id,
      email,
      full_name,
      phone,
      department,
      student_id,
      created_at
    `)
    .order("created_at", {
      ascending: false
    });

  if (profileError) {
    throw profileError;
  }

  const {
    data: roles,
    error: roleError
  } = await supabase
    .from("user_roles")
    .select(`
      user_id,
      role,
      is_approved
    `);

  if (roleError) {
    throw roleError;
  }

  const roleMap = new Map(
    roles.map((role) => [
      role.user_id,
      role
    ])
  );

  if (profiles.length === 0) {
    userList.innerHTML =
      "<p>가입한 사용자가 없습니다.</p>";

    return;
  }

  userList.innerHTML = profiles
    .map((profile) => {
      const permission =
        roleMap.get(profile.id);

      const role =
        permission?.role ?? "user";

      const approved =
        permission?.is_approved === true;

      return `
        <article class="admin-user-row">
          <div>
            <strong>
              ${escapeHtml(profile.full_name)}
            </strong>

            <span class="status-badge">
              ${role === "admin"
                ? "관리자"
                : "일반 사용자"}
            </span>
          </div>

          <p>
            이메일:
            ${escapeHtml(profile.email)}
          </p>

          <p>
            학번:
            ${escapeHtml(profile.student_id)}
          </p>

          <p>
            학과:
            ${escapeHtml(profile.department)}
          </p>

          <p>
            전화번호:
            ${escapeHtml(profile.phone)}
          </p>

          <p>
            가입 승인:
            <strong>
              ${approved ? "승인 완료" : "승인 대기"}
            </strong>
          </p>

          ${
            role === "admin"
              ? `
                <p>
                  관리자 계정은 이 화면에서
                  승인 해제할 수 없습니다.
                </p>
              `
              : `
                <button
                  type="button"
                  data-action="${
                    approved
                      ? "revoke-user"
                      : "approve-user"
                  }"
                  data-user-id="${profile.id}"
                >
                  ${
                    approved
                      ? "승인 해제"
                      : "사용자 승인"
                  }
                </button>
              `
          }
        </article>
      `;
    })
    .join("");
}


async function loadReservations() {
  const {
    data,
    error
  } = await supabase
    .from("reservations")
    .select(`
      *,
      teams(team_name),
      reservation_members(*),
      extension_requests(*),
      usage_reports(*)
    `)
    .order("start_at", {
      ascending: false
    });

  if (error) {
    throw error;
  }

  allReservations = data;
  renderReservations();
}


function renderReservations() {
  const selectedStatus =
    statusFilter.value;

  const filtered =
    selectedStatus === "all"
      ? allReservations
      : allReservations.filter(
          (reservation) =>
            reservation.status === selectedStatus
        );

  if (filtered.length === 0) {
    reservationList.innerHTML =
      "<p>조건에 맞는 예약이 없습니다.</p>";

    return;
  }

  reservationList.innerHTML = filtered
    .map((reservation) => {
      const members =
        reservation.reservation_members ?? [];

      const extensionRequests =
        reservation.extension_requests ?? [];

      const usageReports =
        reservation.usage_reports ?? [];

      const verifiedCount =
        members.filter(
          (member) =>
            member.certificate_verified === true
        ).length;

      return `
        <article class="admin-reservation-card">
          <div class="reservation-heading">
            <h3>
              ${escapeHtml(
                reservation.teams?.team_name
                  ?? "팀 이름 없음"
              )}
            </h3>

            <span class="status-badge">
              ${escapeHtml(
                getStatusLabel(
                  reservation.status
                )
              )}
            </span>
          </div>

          <p>
            예약자:
            ${escapeHtml(
              reservation.requester_name
            )}
          </p>

          <p>
            전화번호:
            ${escapeHtml(
              reservation.requester_phone
            )}
          </p>

          <p>
            학과:
            ${escapeHtml(
              reservation.department
            )}
          </p>

          <p>
            학번:
            ${escapeHtml(
              reservation.student_id
            )}
          </p>

          <p>
            이용시간:
            ${formatSeoulDate(
              reservation.start_at
            )}
            ~
            ${formatSeoulDate(
              reservation.effective_end_at
            )}
          </p>

          <p>
            기본 종료시간:
            ${formatSeoulDate(
              reservation.end_at
            )}
          </p>

          <p>
            승인된 연장:
            ${reservation.approved_extension_minutes}
            분
          </p>

          <p>
            사용 인원:
            ${reservation.headcount}명
          </p>

          <p>
            사용 목적:
            ${escapeHtml(
              reservation.purpose
            )}
          </p>

          <p>
            사용 장비:
            ${escapeHtml(
              reservation.equipment || "없음"
            )}
          </p>

          <section class="admin-subsection">
            <h4>
              안전교육 수료증
              (${verifiedCount}/${reservation.headcount}
              확인)
            </h4>

            ${
              members.length === 0
                ? `
                  <p>
                    제출된 수료증이 없습니다.
                  </p>
                `
                : members.map((member) => `
                    <div class="document-row">
                      <span>
                        ${escapeHtml(
                          member.member_name
                        )}
                        /
                        ${escapeHtml(
                          member.student_id
                        )}
                      </span>

                      ${
                        member.safety_certificate_path
                          ? `
                            <button
                              type="button"
                              data-action="open-certificate"
                              data-file-path="${escapeHtml(
                                member.safety_certificate_path
                              )}"
                            >
                              수료증 보기
                            </button>
                          `
                          : `
                            <span>파일 없음</span>
                          `
                      }

                      <button
                        type="button"
                        data-action="${
                          member.certificate_verified
                            ? "unverify-certificate"
                            : "verify-certificate"
                        }"
                        data-member-id="${member.id}"
                      >
                        ${
                          member.certificate_verified
                            ? "확인 취소"
                            : "확인 완료"
                        }
                      </button>
                    </div>
                  `).join("")
            }
          </section>

          <section class="admin-subsection">
            <h4>연장 신청</h4>

            ${
              extensionRequests.length === 0
                ? "<p>연장 신청이 없습니다.</p>"
                : extensionRequests.map((request) => `
                    <div class="document-row">
                      <span>
                        요청:
                        ${request.requested_minutes}분
                      </span>

                      <span>
                        사유:
                        ${escapeHtml(
                          request.reason
                        )}
                      </span>

                      <span>
                        상태:
                        ${escapeHtml(
                          request.status
                        )}
                      </span>

                      ${
                        request.status === "pending"
                          ? `
                            <button
                              type="button"
                              data-action="approve-extension"
                              data-extension-id="${request.id}"
                            >
                              연장 승인
                            </button>

                            <button
                              type="button"
                              data-action="reject-extension"
                              data-extension-id="${request.id}"
                            >
                              연장 거절
                            </button>
                          `
                          : ""
                      }
                    </div>
                  `).join("")
            }
          </section>

          <section class="admin-subsection">
            <h4>이용확인서</h4>

            ${
              usageReports.length === 0
                ? `
                  <p>
                    이용확인서가 제출되지 않았습니다.
                  </p>
                `
                : usageReports.map((report) => `
                    <div class="document-row">
                      <span>
                        제출:
                        ${formatSeoulDate(
                          report.submitted_at
                        )}
                      </span>

                      <span>
                        특이사항:
                        ${escapeHtml(
                          report.notes || "없음"
                        )}
                      </span>

                      <button
                        type="button"
                        data-action="open-report"
                        data-file-path="${escapeHtml(
                          report.file_path
                        )}"
                      >
                        확인서 보기
                      </button>
                    </div>
                  `).join("")
            }
          </section>

          <div class="admin-actions">
            ${
              ![
                "completed",
                "cancelled"
              ].includes(reservation.status)
                ? `
                  <button
                    type="button"
                    data-action="complete-reservation"
                    data-reservation-id="${reservation.id}"
                  >
                    이용완료 처리
                  </button>

                  <button
                    type="button"
                    class="danger-button"
                    data-action="cancel-reservation"
                    data-reservation-id="${reservation.id}"
                  >
                    관리자 예약 취소
                  </button>
                `
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");
}


userList.addEventListener("click", async (event) => {
  const button =
    event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const userId = button.dataset.userId;

  try {
    if (action === "approve-user") {
      await setUserApproval(userId, true);
    }

    if (action === "revoke-user") {
      if (
        !confirm(
          "이 사용자의 승인을 해제하시겠습니까?"
        )
      ) {
        return;
      }

      await setUserApproval(userId, false);
    }

    await loadUsers();
  } catch (error) {
    showMessage(error.message, true);
  }
});


async function setUserApproval(
  userId,
  approved
) {
  const { error } = await supabase.rpc(
    "admin_set_user_approval",
    {
      p_user_id: userId,
      p_approved: approved
    }
  );

  if (error) {
    throw error;
  }

  showMessage(
    approved
      ? "사용자를 승인했습니다."
      : "사용자 승인을 해제했습니다."
  );
}


reservationList.addEventListener(
  "click",
  async (event) => {
    const button =
      event.target.closest(
        "button[data-action]"
      );

    if (!button) {
      return;
    }

    const action = button.dataset.action;

    try {
      button.disabled = true;

      if (action === "open-certificate") {
        await openPrivateFile(
          "safety-certificates",
          button.dataset.filePath
        );
      }

      if (action === "open-report") {
        await openPrivateFile(
          "usage-reports",
          button.dataset.filePath
        );
      }

      if (action === "verify-certificate") {
        await verifyCertificate(
          button.dataset.memberId,
          true
        );
      }

      if (action === "unverify-certificate") {
        await verifyCertificate(
          button.dataset.memberId,
          false
        );
      }

      if (action === "approve-extension") {
        if (
          confirm(
            "예약 연장을 승인하시겠습니까?"
          )
        ) {
          await approveExtension(
            button.dataset.extensionId
          );
        }
      }

      if (action === "reject-extension") {
        if (
          confirm(
            "예약 연장을 거절하시겠습니까?"
          )
        ) {
          await rejectExtension(
            button.dataset.extensionId
          );
        }
      }

      if (action === "complete-reservation") {
        if (
          confirm(
            "이 예약을 이용완료로 처리하시겠습니까?"
          )
        ) {
          await completeReservation(
            button.dataset.reservationId
          );
        }
      }

      if (action === "cancel-reservation") {
        if (
          confirm(
            "이 예약을 취소하시겠습니까?"
          )
        ) {
          await cancelReservation(
            button.dataset.reservationId
          );
        }
      }

      if (
        action !== "open-certificate"
        && action !== "open-report"
      ) {
        await loadReservations();
      }
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      button.disabled = false;
    }
  }
);


async function openPrivateFile(
  bucket,
  path
) {
  if (!path) {
    throw new Error("파일 경로가 없습니다.");
  }

  const { data, error } =
    await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60);

  if (error) {
    throw error;
  }

  window.open(
    data.signedUrl,
    "_blank",
    "noopener,noreferrer"
  );
}


async function verifyCertificate(
  memberId,
  verified
) {
  const { error } = await supabase.rpc(
    "admin_verify_certificate",
    {
      p_member_id: memberId,
      p_verified: verified
    }
  );

  if (error) {
    throw error;
  }

  showMessage(
    verified
      ? "수료증을 확인했습니다."
      : "수료증 확인을 취소했습니다."
  );
}


async function approveExtension(
  extensionId
) {
  const { error } = await supabase.rpc(
    "admin_approve_extension",
    {
      p_extension_request_id:
        extensionId
    }
  );

  if (error) {
    throw error;
  }

  showMessage("연장을 승인했습니다.");
}


async function rejectExtension(
  extensionId
) {
  const { error } = await supabase.rpc(
    "admin_reject_extension",
    {
      p_extension_request_id:
        extensionId
    }
  );

  if (error) {
    throw error;
  }

  showMessage("연장을 거절했습니다.");
}


async function completeReservation(
  reservationId
) {
  const { error } = await supabase.rpc(
    "admin_complete_reservation",
    {
      p_reservation_id:
        reservationId
    }
  );

  if (error) {
    throw error;
  }

  showMessage("이용완료로 처리했습니다.");
}


async function cancelReservation(
  reservationId
) {
  const { error } = await supabase.rpc(
    "admin_cancel_reservation",
    {
      p_reservation_id:
        reservationId
    }
  );

  if (error) {
    throw error;
  }

  showMessage("예약을 취소했습니다.");
}


initialize();