---
title: "Personal Asset Manager로 정리하는 DB 용어 — Schema부터 Migration까지"
description: "Personal Asset Manager의 실제 데이터 구조를 기준으로 Entity, Schema, Constraint, Migration과 Local·Remote DB의 관계를 정리합니다."
pubDate: 2026-08-14
category: "개념 정리"
tags: ["Database", "PostgreSQL", "Supabase", "Migration", "Schema"]
draft: false
---

Personal Asset Manager에서는 금융기관, 계좌, 자산 같은 기준정보부터 Opening, 과거 거래 Draft, 실제 금융거래까지 기능이 확장되면서 DB 구조도 함께 변경됐다. 이 과정에서 Entity, Schema, Constraint, Migration은 각각 떨어진 용어가 아니라 하나의 데이터 구조를 설계하고 변경해 나가는 흐름으로 연결된다.

이 글은 기본 DB 용어를 다시 강의하기보다, 프로젝트에 실제 사용된 개념이 데이터 구조와 변경 과정에서 어떤 역할을 맡았는지 정리한다. 특히 코드와 Local DB에는 필요한 구조가 있지만 연결된 Remote DB에는 관련 Migration이 아직 적용되지 않아 화면이 실패했던 사례는 구조의 정의와 적용 상태를 함께 확인해야 하는 이유를 보여줬다.

**코드가 최신이라고 DB도 최신인 것은 아니다. 앱 코드와 DB 구조는 따로 움직일 수 있기 때문에, DB의 현재 구조와 변경 이력, 각 환경의 적용 상태를 함께 봐야 한다.**

## Entity — 무엇을 따로 관리할 것인가

이 글에서 Entity는 앱에서 독립적인 의미를 가진 관리 대상을 뜻한다. 특정 ORM의 `Entity` 클래스만을 가리키는 말로 사용하지 않는다.

이 프로젝트에는 금융기관, 계좌, 자산이라는 대상이 있다. 은행 계좌는 그 자체가 하나의 자산처럼 보일 수도 있지만, 프로젝트에서는 금융기관을 계좌를 제공하는 곳, 계좌를 자산을 담는 위치, 자산을 현금 통화나 금융상품처럼 가치나 수량을 추적하는 대상으로 구분한다. 같은 자산을 여러 계좌에서 보유할 수 있는 구조까지 고려해 세 대상을 분리했고, 계좌와 자산의 관계는 별도의 원장 기록에서 표현한다.

이후에는 금융 사건과 원장 항목도 별도 Entity로 다뤘다. 입금이 발생했다는 사실과 그 입금이 어느 계좌·자산의 금액을 늘렸는지는 서로 연결되지만 같은 정보는 아니기 때문이다. 무엇을 하나의 대상으로 볼지 정하면, 그다음에는 이 대상들을 DB에 어떤 구조로 담을지 결정해야 한다.

## Schema — 데이터의 전체 구조

이 글에서 Schema는 **Table, Column, Data Type, 관계와 Constraint를 포함한 DB 전체 구조와 설계**를 뜻한다. 기관·계좌·자산을 별도 Table로 나누고 각각 UUID Primary Key를 두는 것, 계좌에 금융기관 참조를 두는 것, 금융값에 적절한 Data Type과 Constraint를 두는 것이 모두 Schema에 포함된다.

중요했던 것은 Table을 만드는 일 자체보다 도메인에서 나눈 Entity를 어떤 구조와 관계로 보장할지였다. 예를 들어 계좌는 금융기관을 참조하지만 자산을 직접 소유하지 않고, 실제 계좌·자산 관계는 원장 항목에서 표현한다. 이런 선택이 쌓여 앱이 전제하는 데이터 구조가 구체화됐다.

PostgreSQL에서는 `public`처럼 객체를 묶는 namespace도 schema라고 부른다. 이 글에서는 특정 namespace를 가리킬 때를 제외하고, Schema를 위와 같은 DB 전체 구조라는 의미로 사용한다.

## Constraint — 잘못된 상태를 DB에서 막는 규칙

Constraint는 Schema가 허용하는 상태를 DB 자체에서 강제하는 규칙이다. 애플리케이션 입력 검증이 있더라도 다른 쓰기 경로나 이후 코드 변경만으로 데이터 불변조건이 무너지지 않게 하는 마지막 경계이기도 하다.

이 프로젝트에서는 `NOT NULL`, `UNIQUE`, `CHECK`를 이용해 필수값과 사용자 범위의 중복, 통화 형식, 양수 금융값을 검사한다. 계좌의 폐쇄일이 개설일보다 빠르지 않게 하고, 원장 항목에는 금액과 수량 중 하나만 들어가게 하는 것도 같은 맥락이다. Constraint의 종류를 나열하는 것보다, 앱이 전제하는 올바른 금융 상태가 DB에서도 유지된다는 점이 중요했다.

## Foreign Key — Constraint로 관계를 지키기

Foreign Key는 Constraint의 한 종류다. 한 Table의 값이 다른 Table에 실제로 존재하는 행을 가리키는지 DB가 확인한다. 이 관계가 깨지지 않는 성질을 참조 무결성이라고 한다.

계좌에 금융기관 ID가 들어 있다고 해도 아무 값이나 허용하면 존재하지 않는 기관을 가리키는 계좌가 생길 수 있다. 그래서 계좌는 실제 금융기관을 참조한다. 이 프로젝트는 한 단계 더 나아가 계좌의 사용자와 금융기관의 사용자도 함께 맞는지 확인하는 복합 Foreign Key를 사용한다. 로그인한 사용자의 행만 보이게 하는 권한 규칙과 별개로, 다른 사용자 소유의 기관을 자기 계좌에 연결하는 잘못된 관계도 DB 구조에서 막기 위해서다.

원장이 확장된 뒤에는 원장 항목이 같은 사용자의 금융 사건, 계좌, 자산을 각각 참조하도록 만들었다. Foreign Key는 단순히 두 Table을 연결해 주는 선이 아니라, 그 연결이 실제로 유효한지 지키는 Constraint였다.

## Migration — DB 구조 변경을 순서 있는 기록으로 남기기

이 프로젝트에서 Migration은 **Schema를 어떻게 변경했는지 순서대로 남긴 SQL 파일**을 뜻한다.

코드 변경을 Git history로 관리하듯 DB 구조 변경도 기록으로 남긴다고 비유할 수 있다. 다만 Migration과 Git commit은 같은 개념은 아니다. Git은 코드와 문서 등 저장소의 변경을 관리하고, Migration은 DB가 이전 구조에서 다음 구조로 이동하는 절차를 담는다.

Personal Asset Manager의 DB도 한 번에 완성되지 않았다. 프로필 기반을 만든 뒤 금융기관과 계좌, 자산, Opening 원장, Historical Transaction Draft를 차례로 추가했다. 이후 기존 Opening 데이터를 보존하면서 일반 금융거래와 여러 원장 항목을 수용할 수 있도록 구조를 확장했고, 금융 사건 게시 기반과 입금·출금·수수료·세금 writer를 더했다.

Migration 파일 이름 앞의 timestamp는 적용 순서를 구분하는 기준이 된다. 이 Migration ordering이 중요한 이유는 뒤의 변경이 앞에서 만들어진 Table이나 Column을 전제로 할 수 있기 때문이다. 이미 적용하거나 공유한 Migration을 고쳐 과거를 바꾸기보다, 새로운 Migration으로 다음 변경을 추가해야 빈 DB도 같은 순서로 현재 구조를 재현할 수 있다.

## Migration History — 파일이 있다고 적용된 것은 아니다

저장소에 Migration 파일이 있다는 사실과 특정 DB가 그 Migration을 실제로 적용했다는 사실은 다르다. Migration History는 각 DB가 어디까지 변경을 적용했는지를 보여주는 이력이다.

예를 들어 저장소에 A, B, C Migration이 모두 있어도 Local DB는 C까지, Remote DB는 B까지만 적용된 순간이 생길 수 있다. 파일 목록만 보면 최신 구조가 준비된 것처럼 보이지만 Remote DB의 현재 구조에는 C에서 만든 Table이나 Column이 없다.

이 프로젝트에서도 원격 개발 DB에 Migration을 적용한 뒤 history와 catalog 구조를 확인했고, Local PostgreSQL에서는 빈 DB에 Migration을 순서대로 다시 적용하며 구조와 생성 타입의 차이를 검사했다. 여기서 중요한 것은 “Migration 파일이 존재하는가”, “그 DB의 history에 적용됐는가”, “실제 DB 구조가 기대와 같은가”를 서로 다른 질문으로 보는 일이었다.

## Local DB와 Remote DB — 역할이 다른 두 환경

이 프로젝트에서 Local DB와 Remote DB는 목적과 적용 시점이 다른 두 환경으로 사용했다.

이 프로젝트의 Local Supabase DB는 빈 상태부터 Migration을 재현하고 DB 테스트와 권한 검사를 수행하는 개발·검증 환경이었다. 연결된 Remote Supabase DB는 실제 앱을 PC와 모바일에서 확인하며 개발 데이터를 저장하는 원격 환경이었다. Local에서 먼저 구조와 테스트를 확인하고, 대상과 변경 범위를 확인한 뒤 Remote에 적용하는 흐름을 사용했다.

두 환경은 자동으로 항상 같은 상태가 되지 않는다. 코드와 Local DB가 최신이어도 Remote DB의 Migration History가 한 단계 뒤에 있을 수 있다. 이렇게 기대한 Schema와 실제 Schema가 어긋난 상태를 Schema drift라고 부를 수 있다.

실제로 `/transactions` 화면이 Historical Transaction Draft Table을 조회하던 때, 코드와 Local DB에는 필요한 구조가 있었지만 Remote DB에는 관련 Migration이 아직 적용되지 않아 조회가 실패한 경험이 있었다. 누락된 Migration을 Remote에 적용한 뒤 기능은 정상화됐다. 당시의 정확한 오류 문구와 시각은 기록에 남아 있지 않아 여기서는 단정하지 않는다.

이 사례를 코드 오류 해결기로만 보면 “Table이 없어서 실패했다”로 끝난다. 개념의 흐름으로 보면 더 많은 것이 연결된다.

1. Entity를 정하고 Schema에 새 Table과 관계를 설계했다.
2. Constraint와 Foreign Key로 허용할 값과 관계를 정했다.
3. Schema 변경을 Migration 파일로 남겼다.
4. Local DB에는 Migration이 적용됐지만 Remote DB의 Migration History는 뒤처졌다.
5. 코드가 Remote DB에 아직 없는 구조를 기대하면서 기능이 실패했다.

이 사례는 Migration 파일, Migration History, 실제 DB 상태를 서로 구분해야 하는 이유를 구체적으로 보여준다.

## 프로젝트에서 이 개념들이 연결되는 흐름

프로젝트의 데이터 구조와 변경 과정을 기준으로 보면 각 개념은 다음 순서로 연결된다.

```text
무엇을 관리할지 Entity를 정한다
        ↓
Table, Column, 관계로 Schema를 설계한다
        ↓
Constraint와 Foreign Key로 올바른 상태를 지킨다
        ↓
Schema 변경을 순서 있는 Migration으로 남긴다
        ↓
Migration History로 각 DB의 적용 지점을 확인한다
        ↓
Local DB와 Remote DB의 실제 상태를 비교한다
```

Personal Asset Manager에서는 문서에 정의한 Entity와 관계를 Schema로 옮기고, 구조 변경을 Migration으로 기록했다. Local DB에서는 Migration을 처음부터 재현하며 Constraint와 권한을 검증했고, Remote DB에서는 적용 이력과 실제 구조가 코드의 기대와 일치하는지 확인했다. Migration 파일, 적용 이력, 실제 Schema를 함께 확인하는 것이 이 프로젝트에서 각 개념을 연결하는 운영 흐름이었다.

Migration 기반을 처음 만들었던 과정은 [개발기 #2](/personal-asset-blog/blog/personal-asset-manager-02-foundation-and-verification/)에서, Remote DB의 적용 차이를 실제로 겪었던 과정은 [개발기 #4](/personal-asset-blog/blog/personal-asset-manager-04-accounts-assets-opening/)에서 더 짧게 확인할 수 있다.
