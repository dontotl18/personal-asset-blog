---
title: "Personal Asset Manager로 정리하는 인증과 권한 — Authentication부터 RLS까지"
description: "Personal Asset Manager의 인증과 데이터 접근 구조를 기준으로 Authentication, Authorization, Ownership, RLS와 Policy의 관계를 정리합니다."
pubDate: 2026-08-16
category: "개념 정리"
tags: ["Supabase", "PostgreSQL", "Authentication", "Authorization", "RLS"]
draft: false
---

Personal Asset Manager에서 로그인 세션을 만들었다고 해도 DB의 모든 행을 읽거나 바꿀 수 있다는 뜻은 아니다. Supabase Auth와 Next.js 서버가 사용자를 확인한 뒤에도 소유권 관계, RLS 정책과 DB 권한이 데이터 접근을 별도로 제한한다. 정책 SQL의 존재뿐 아니라 실제 `anon`과 `authenticated` 역할의 허용·거부도 검증했다.

**로그인 성공은 신원을 확인한 결과다. 어떤 데이터에 무엇을 할 수 있는지는 그다음 권한 경계에서 별도로 결정된다.**

## Authentication — 이 요청은 누구의 것인가

Authentication은 요청을 보내는 사용자가 누구인지 확인하는 영역이다. 로그인은 그 확인을 시작하는 대표 동작이지만, Authentication 전체를 로그인 폼 하나와 같다고 볼 수는 없다. 로그인 뒤의 요청에서도 인증 상태를 이어받고 서버가 그 상태를 다시 확인할 수 있어야 하기 때문이다.

Personal Asset Manager는 Supabase Auth의 이메일·비밀번호 인증을 사용한다. 공개 회원가입 UI나 `signUp()` 경로는 만들지 않았고, Supabase 관리 화면에서 직접 생성·확인한 사용자만 로그인 대상으로 삼았다. 로그인에 성공하면 Supabase가 세션을 만들고, 이후 서버 요청은 그 세션의 claims에서 사용자 식별 정보와 이메일을 확인한다.

여기에 서버 allowlist가 한 겹 더 있다. Supabase Auth가 “유효한 계정의 자격정보가 맞다”고 확인하는 것과, 그 계정이 “이 개인용 앱에 들어와도 되는 사용자다”라는 판단은 서로 다르다. 서버는 인증된 이메일을 정규화한 뒤 환경에 설정된 허용 이메일과 정확히 비교한다. 허용되지 않은 세션은 로컬 로그아웃하고, 로그인 실패와 같은 일반 오류를 보여 allowlist 포함 여부를 노출하지 않는다.

정리하면 Authentication은 누구인지 확인하고, allowlist는 확인된 사용자 가운데 이 앱에 들어올 대상을 추가로 제한한다. allowlist가 데이터 소유권이나 RLS를 대신하지는 않는다.

## Session과 보호 route — 확인된 사용자를 요청에 이어 붙이기

브라우저 로그인과 보호 화면 사이에는 Session과 SSR 인증 경계가 있다. 요청 Proxy는 애플리케이션 요청에서 Supabase claims를 확인하고 필요한 경우 응답 쿠키를 갱신한다. 로그인 이외의 경로는 인증 상태와 allowlist 결과에 따라 로그인 화면으로 보내거나 요청을 계속한다.

보호된 App Shell의 서버 layout도 현재 인증 상태를 다시 확인한다. 즉, 메뉴에서 링크를 숨기는 수준이 아니라 보호 route를 직접 요청해도 서버에서 막는다. 로그아웃한 뒤 보호 URL에 다시 접근할 수 없는지도 PC와 모바일에서 수동 검증했다.

중요한 점은 한 번의 로그인 결과가 Session을 통해 다음 요청에 연결되고, 서버가 그 상태를 다시 검증한다는 것이다.

## Authorization — 확인된 사용자가 무엇을 할 수 있는가

Authorization은 인증된 사용자가 어떤 작업과 데이터에 접근할 수 있는지를 결정한다. 두 개념을 가장 짧게 나누면 다음과 같다.

```text
Authentication: 이 요청을 하는 사용자는 누구인가
Authorization: 그 사용자는 무엇을 할 수 있는가
```

이 프로젝트는 로그인 성공과 데이터 접근 허용을 분리했다. 인증 사용자라도 다른 사용자의 Profile, 기관, 계좌, 자산이나 원장 행을 다룰 수 없다. 자기 데이터에도 모든 동작을 열지 않았다. 여러 기준정보는 자기 행 조회·생성·수정만 허용하고 삭제는 닫았으며, 원장 쓰기는 목적이 정해진 DB 함수로 제한했다.

Authorization은 UI의 버튼 표시 여부만을 뜻하지 않는다. 서버 Action의 사용자 제한과 PostgreSQL의 table 권한·RLS Policy·함수 실행 권한도 같은 질문에 서로 다른 층에서 답한다.

## Ownership — 어느 데이터가 누구에게 속하는가

이 글에서 Ownership은 PostgreSQL 객체의 owner가 아니라 **앱 데이터가 어느 사용자에게 속하는지를 나타내는 도메인 관계**를 뜻한다.

Profile은 인증 사용자 ID를 기본 식별자로 사용한다. 기관, 계좌, 자산, 금융 사건과 원장 항목 같은 사용자 데이터는 각각 사용자 소유 식별자를 가진다. 서버는 브라우저가 보낸 임의 소유자 값을 믿지 않고 인증 claims의 사용자 식별자를 사용한다.

계좌는 같은 사용자에게 속한 기관을 참조하고, 원장 항목은 같은 사용자의 금융 사건·계좌·자산을 참조하도록 복합 Foreign Key가 연결돼 있다. 다른 사용자의 기관을 자기 계좌에 붙이거나 자기 원장 항목에서 다른 사용자의 대상을 가리키는 관계도 DB가 거부한다.

여기서 [개념 정리 #1](/personal-asset-blog/blog/personal-asset-manager-concept-01-database-basics/)의 Constraint·Foreign Key와 권한 개념이 만난다. Foreign Key는 참조 관계 자체가 유효하고 같은 사용자 범위에 있는지를 보장한다. RLS는 지금 요청한 사용자가 그 행을 볼 수 있고 바꿀 수 있는지를 판단한다. Ownership은 두 판단이 공통으로 사용하는 “누구의 데이터인가”라는 기준이다.

## RLS — 같은 Table 안에서 접근 가능한 행을 제한하기

RLS는 Row Level Security다. 이 프로젝트에서는 같은 Table 안에서도 현재 사용자의 소유 행만 조회하거나 변경할 수 있게 하는 PostgreSQL의 행 단위 접근 경계로 사용한다.

앱 화면이 현재 사용자 ID로 조회하면 다른 행이 보이지 않을 수 있다. 하지만 조회 조건을 빼먹은 코드나 다른 요청 경로까지 안전하다는 뜻은 아니다. RLS는 요청이 DB에 도달했을 때 현재 역할과 사용자 식별 정보를 기준으로 행 접근을 다시 판단한다.

따라서 다음 둘은 같지 않다.

```text
UI에서 다른 사용자의 데이터가 보이지 않는다
        ≠
DB가 다른 사용자의 행 접근을 거부한다
```

초기 Profile Migration은 RLS만 켜고 Policy를 두지 않은 기본 거부 상태로 시작했다. 다음 단계에서 인증 사용자의 자기 행에 한해 `SELECT`, `INSERT`, `UPDATE`를 허용했고 `DELETE`는 열지 않았다. 이후 기관·계좌·자산에도 같은 소유자 원칙을 적용했으며, 금융 사건과 원장 항목은 직접 쓰기까지 닫아 더 제한된 경계를 사용했다.

## Policy — RLS가 적용할 구체적인 규칙

RLS와 Policy는 같은 말이 아니다. RLS가 PostgreSQL의 행 단위 접근 제어 기능이라면, Policy는 어떤 역할이 어떤 작업에서 어떤 행을 사용할 수 있는지 적은 규칙이다.

Profile의 조회 Policy는 현재 인증 사용자와 행의 소유자가 같은지 확인한다. 생성은 다른 사용자의 소유권 주입을 막고, 수정은 기존 행을 다룰 자격과 수정 결과의 소유권을 모두 검사한다. 삭제는 Policy와 table 권한 모두 열지 않았다.

RLS 활성화만으로 원하는 접근이 자동 설계되지는 않는다. 작업별 Policy와 table 권한을 함께 봐야 하며, Policy 문장이 Migration에 있다는 사실만으로 실제 실행 결과까지 증명할 수도 없다.

## 앱에서 막는 것과 DB에서 막는 것은 역할이 다르다

Personal Asset Manager의 접근 제어는 한 지점에만 의존하지 않는다.

```text
로그인
  ↓
Supabase Auth가 사용자 확인
  ↓
Session을 요청에 연결하고 서버에서 보호 route·allowlist 확인
  ↓
서버가 claims의 사용자 식별자로 데이터 작업
  ↓
PostgreSQL 권한과 RLS Policy가 행 접근 재검사
  ↓
Foreign Key·Constraint가 소유 관계와 데이터 구조 검증
```

보호 route는 미인증 사용자의 앱 진입을 일찍 막고, 서버 데이터 계층은 요청 대상을 현재 사용자로 좁힌다. RLS는 DB에서 행 접근을 다시 검사하고, 복합 Foreign Key는 교차 사용자 참조를 막는다. 여러 층이 함께 경계를 지키지만 역할은 다르다. allowlist는 앱 진입 대상을, RLS는 행 접근을, Constraint는 저장 가능한 관계와 상태를 제한한다.

## PostgreSQL Role — Policy가 실제 요청 주체에서 동작하는가

Supabase의 DB 요청은 인증 상태에 따라 PostgreSQL 역할과 사용자 claims를 사용한다. 이 프로젝트의 테스트에서는 `anon`을 인증되지 않은 요청 역할로, `authenticated`를 인증된 세션의 요청 역할로 사용했다. `authenticated`라는 역할만으로 특정 사용자가 정해지는 것은 아니어서, synthetic 사용자 A와 B의 claims를 바꿔 자기 행과 다른 사용자 행의 경계도 재현했다.

Vitest는 Migration을 읽어 RLS 활성화, Policy, `GRANT`·`REVOKE`와 삭제 권한 부재 같은 정적 계약을 검사했다. 필요한 SQL의 존재는 확인하지만 실제 역할과 claims로 쿼리를 실행하지는 않는다.

그래서 로컬 Supabase DB를 빈 상태에서 Migration으로 재구성한 뒤 pgTAP을 실제 역할로 실행했다. `anon`의 Profile·감사행 접근 거부, `authenticated` 사용자의 자기 Profile 생성·조회·수정, 다른 사용자 행과 소유권 변경 거부를 확인했다. 일반 사용자의 감사행 변경, 원장 테이블 직접 쓰기와 private 게시 함수 실행도 거부되는지 검사했다.

여기서 핵심은 테스트 개수보다 검증 층의 차이다.

```text
정적 계약 검사: 필요한 Policy와 권한 SQL이 존재하는가
실제 역할 검사: 그 역할로 실행했을 때 허용·거부가 의도대로 동작하는가
```

“RLS SQL이 있다”와 “실제 사용자 역할에서 다른 행이 차단된다”를 구분해야 했던 이유가 여기에 있다. 구체적인 pgTAP 구성과 역할 전환 방법은 별도의 기술 문제 해결 글에서 다룰 범위다.

## Audit과 RPC는 어디에 놓이는가

Audit과 RPC도 권한 구조에 연결되지만 이 글에서는 경계만 확인한다. Audit은 Profile·기관·계좌·자산·Opening·과거 거래 Draft의 일부 변경에 작업 종류와 변경 필드 같은 최소 메타데이터를 남기며 금융 원문은 복제하지 않는다.

RPC는 금융 데이터의 쓰기 경로를 제한한다. 인증 사용자는 원장 Table에 직접 INSERT하지 않고 의미가 고정된 public writer만 실행할 수 있으며, private 게시 kernel의 실행 권한은 없다. 원자성, `SECURITY DEFINER`, `GRANT`·`REVOKE`의 상세는 별도 기술 글에 더 적합하다.

## 프로젝트에서 개념이 연결되는 순서

Personal Asset Manager의 인증·권한 구조를 하나의 흐름으로 정리하면 다음과 같다.

```text
Authentication으로 사용자를 확인한다
        ↓
Session이 인증 상태를 서버 요청에 연결한다
        ↓
보호 route와 allowlist가 앱 진입 대상을 확인한다
        ↓
Authorization이 허용할 작업을 정한다
        ↓
Ownership이 데이터의 사용자 범위를 표현한다
        ↓
RLS와 Policy가 현재 역할의 행 접근을 제한한다
        ↓
PostgreSQL Role 테스트로 허용과 거부를 실행 검증한다
```

로그인은 이 흐름의 끝이 아니라 시작이다. 누군지 확인한 뒤에도 무엇을 할 수 있는지, 어떤 데이터가 그 사용자에게 속하는지, DB가 그 경계를 실제로 강제하는지를 각각 확인해야 한다.

[개발기 #3](/personal-asset-blog/blog/personal-asset-manager-03-auth-and-rls/)이 공개 가입 없는 인증과 Profile RLS를 만들고 실제 역할 테스트까지 확장한 과정을 시간 순서로 기록했다면, 이 글은 Authentication, Authorization, Ownership, RLS, Policy와 PostgreSQL Role이 서로 어떤 질문에 답하며 연결되는지를 구조 중심으로 정리했다.
