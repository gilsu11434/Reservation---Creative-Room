# 창의융합프로젝트실 예약

창의융합프로젝트실 이용 안내, 학번 로그인, 호실 예약, 내 예약 관리 및 관리자 기능을 제공하는 웹앱입니다.

## 적용된 화면

- `index.html`: 이용 안내
- `login.html`: 학번 로그인 및 회원가입
- `reservation.html`: 팀 생성과 예약 신청
- `my-reservation.html`: 내 예약, 수료증, 연장 신청, 이용확인서
- `admin.html`: 사용자와 전체 예약 관리

## 최초 설정

1. Supabase의 `Authentication > Providers > Email`에서 `Confirm email`을 끕니다.
2. Supabase의 `SQL Editor`에서 `supabase-auto-approve.sql` 전체를 한 번 실행합니다.
3. `JS/config.js`의 Supabase URL과 Publishable Key가 현재 프로젝트 값인지 확인합니다.
4. VS Code에서 `index.html`을 열고 Live Server를 실행합니다.

회원가입용 실제 연락 이메일은 `profiles.email`에 저장됩니다. 로그인은 입력한 학번을 내부 인증용 주소로 변환하여 처리합니다.

## GitHub Pages 반영

수정 파일을 저장한 뒤 GitHub Desktop 또는 터미널에서 커밋하고 `main` 브랜치에 Push합니다. GitHub Pages가 갱신된 후 브라우저에서 강력 새로고침하세요.
