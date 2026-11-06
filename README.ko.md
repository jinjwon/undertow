# Evoke

<img src="assets/logo.png" width="96" alt="Evoke 로고">

[English](README.md) | **한국어**

[Ghostty](https://ghostty.org)에서 쓰는 [Claude Code](https://claude.com/claude-code)용 수중 테마의 기울어진 게임 메뉴 인터페이스입니다. 대화 영역과 메뉴 뒤로 물결이 이어져 터미널 전체가 하나의 화면처럼 보입니다.

<img src="assets/preview.png" width="720" alt="Ghostty에서 실행한 Evoke: 왼쪽은 대화 영역, 오른쪽은 SKILL 메뉴">

## 주요 기능

- **메뉴 9개:** 메뉴마다 구도와 콘텐츠 형태가 다릅니다. 도구를 호출하면 해당 메뉴가 켜집니다.
- **AI 사용량 HUD:** 컨텍스트, 5시간, 7일 게이지와 리셋까지 남은 시간, 세션 비용을 보여 줍니다. 85%에 이르면 토스트로 알립니다.
- **스킬:** 그룹과 쪽으로 나눠 많이 쓴 순서로 보여 줍니다. `/skillbook`에서 전체를 볼 수 있습니다.
- **프로젝트 전환:** `p`나 `/projects`로 신뢰한 Claude Code 프로젝트를 최근 사용 순으로 보여 줍니다. `1`이나 Enter를 누르면 맨 위 프로젝트가 새 창으로 열립니다.
- **상태 밴드:** 프롬프트 위에 세션 상태, 프로젝트, 브랜치, 도구 호출 수를 표시합니다.

## 설치

Claude Code가 필요합니다. 플러그인은 macOS와 Windows에서 동작하고, 전체 화면 구성은 macOS와 Ghostty가 필요합니다. Ghostty는 Windows 빌드가 없습니다. 전체 화면 구성을 쓰려면 Ghostty, [Iosevka](https://github.com/be5invis/Iosevka), [Pretendard](https://github.com/orioncactus/pretendard)도 설치하세요.

### Ghostty (전체 화면 구성)

```sh
git clone https://github.com/jinjwon/undertow.git
undertow/ghostty/install.sh
```

Ghostty를 다시 시작하세요. 클론 경로에 공백은 쓸 수 있지만 따옴표, `$`, 백틱, 백슬래시는 쓸 수 없습니다. 설치 스크립트는 `~/.config/ghostty/evoke.conf`를 만들고 `~/.config/ghostty/config`에 포함 줄 하나를 추가합니다.

**이후 새 Ghostty 창은 모두 메뉴와 함께 Claude Code를 시작합니다.** 일반 셸을 유지하려면 [설정](#설정)을 참고하세요.

### 플러그인만 설치

Claude Code 프롬프트에서 아래 명령을 실행한 뒤 `/menu`를 입력하세요. 이미지를 표시할 수 없는 터미널에서는 아트 대신 일반 텍스트 행으로 나옵니다.

```
/plugin install evoke --marketplace jinjwon/undertow
```

### Windows

위의 플러그인 설치를 사용하세요. 메뉴, HUD, 스킬, 명령어가 물결과 아트 없이 일반 텍스트 행으로 나옵니다. `/projects`는 Windows Terminal(`wt`)로 프로젝트를 엽니다.

Windows 지원은 Windows 환경을 시뮬레이션한 자동 테스트로 확인했습니다. 실제 Windows 기기에서는 아직 실행해 보지 않았으니, 문제가 있으면 알려 주세요.

### macOS 터미널

```sh
undertow/terminal/install.sh            # 기본 프로필로 쓰려면 --default 추가
```

터미널 앱에는 물결 애니메이션과 아트가 없어 메뉴가 일반 텍스트 행으로 나옵니다. 이 프로필도 Claude Code를 시작합니다.

## 설정

| 바꿀 내용 | 방법 |
| --- | --- |
| Ghostty에서 일반 셸 유지 | `~/.config/ghostty/evoke.conf`에서 `command` 줄 삭제 |
| 창 크기 | `evoke.conf`의 `window-width`, `window-height`. 메뉴를 옆에 고정하려면 110열 이상이 필요합니다 |
| 글꼴 | `evoke.conf`의 `font-family`, `font-size`. 아트는 Iosevka 14 기준으로 맞춰져 있습니다 |
| 내 이미지 추가 | 권리를 가진 투명 PNG를 `plugins/evoke/hero.png`에 넣고 `plugins/evoke/tools/render.sh` 실행 (Google Chrome 필요). `hero.png`는 git에서 제외됩니다 |

## 명령어와 단축키

| 명령어 | 동작 |
| --- | --- |
| `/menu` | 메뉴 Pane 열기 |
| `/projects` | 프로젝트 선택 |
| `/skillbook` | 그룹별로 스킬을 보고 선택 |

클릭이나 `ctrl+x tab`으로 Pane에 키보드를 넘긴 뒤 사용합니다.

| 키 | 동작 |
| --- | --- |
| `1`-`9` | 메뉴를 고르고 프롬프트에 해당 명령어 입력 |
| `j` / `k` | 다음 / 이전 메뉴 |
| `e` | 현재 메뉴의 명령어를 프롬프트에 입력 |
| `n` / `b` | 스킬 다음 / 이전 쪽 |
| `p` | 프로젝트 선택 창 열기 |
| `s` | 프롬프트에 `/skillbook` 입력 |

메뉴를 클릭하려면 오른쪽 끝의 번호를 누르세요. 기울어진 메뉴 이름은 이미지의 일부입니다.

## 제거 및 복구

**Ghostty:** `~/.config/ghostty/config`에서 `config-file = evoke.conf` 줄을 지우고, `~/.config/ghostty/evoke.conf`를 삭제한 뒤 Ghostty를 다시 시작하세요.

**플러그인:** `/plugin uninstall evoke`를 실행하거나, 셸에서 `claude plugin uninstall evoke`를 실행하세요.

**터미널:** 터미널 > 설정 > 프로파일에서 Evoke 프로필을 삭제하세요. `--default`를 썼다면 먼저 다른 기본 프로필을 고르세요.

클론한 폴더는 마지막에 삭제하세요. Ghostty와 터미널 설정이 이 폴더의 파일을 읽습니다.

## 크레딧 사용 구조

Evoke는 자체적으로 AI 요청을 보내지 않습니다. 코드에 모델, 에이전트, 네트워크 호출이 없고, HUD는 Claude Code가 이미 가진 사용량 수치를 그리기만 합니다. Claude Code 2.1.319, macOS에서 측정한 결과입니다.

| 환경 | AI 요청 | 결과 |
| --- | --- | --- |
| Evoke 외관을 적용한 Ghostty + 일반 셸 (`command` 줄 없음) | 없음 | 12초 샘플에서 Claude 프로세스와 TCP 연결 없음 |
| zsh | 없음 | Evoke는 셸에 아무것도 추가하지 않습니다. Claude Code 안에서만 로드됩니다 |
| Claude Code + Evoke, `/menu`로 시작, 프롬프트 전송 안 함 | 모델 응답 없음, 세션 비용 $0 | 시작 시 `quota_check` 요청 1회. Evoke가 없을 때와 같습니다 |
| Claude Code + Evoke, 프롬프트 1회 | 내 프롬프트만 | 첫 요청 컨텍스트 29,175토큰. Evoke 유무와 관계없이 3쌍 모두 동일 |

`quota_check` 요청은 Claude Code의 동작으로, 시작할 때마다 발생합니다. 이 요청이 요금제 사용량에 포함되는지는 확인하지 못했습니다.

- **Claude Code를 쓰면 요금제 사용량은 그대로 소모됩니다.** Ghostty의 `command` 줄이 Claude Code를 시작하지만, 프롬프트를 보내기 전에는 모델로 아무것도 전송되지 않습니다.
- **측정하지 못한 항목:** `/menu` 확인 문구입니다. 대화 기록에 남는 짧은 텍스트로, Claude Code가 이후 요청에 포함할 수 있습니다.
- **다른 스킬은 별개입니다.** 스킬은 설치와 실행이 다릅니다. 예를 들어 Ponytail 스킬을 호출하면 그 요청의 컨텍스트가 1,557토큰 늘었습니다.

## 라이선스 및 안내

[MIT](LICENSE). 아트의 서체는 [Barlow](https://github.com/jpt/barlow)([OFL](plugins/evoke/tools/fonts/OFL.txt))입니다.

Evoke는 Persona 3 Reload의 메뉴 디자인에서 영감을 받은 비공식 팬 프로젝트입니다. ATLUS 또는 SEGA와 관련이 없고 이들의 승인을 받지 않았으며, 게임 에셋을 포함하지 않습니다. 취약점 제보는 [SECURITY.md](SECURITY.md)를, 변경 내역은 [CHANGELOG.md](CHANGELOG.md)를 참고하세요.
