# Evoke

<img src="assets/logo-tide.png" width="96" alt="Evoke ロゴ">

[English](README.md) | [한국어](README.ko.md) | **日本語**

[Claude Code](https://claude.com/claude-code) を中心に据えたデスクトップのコードエディタです。傾いたゲームメニューのデザインをまとっています。ファイル、エディタ、git、シェル、Claude Code がひとつのウィンドウに並び、VS Code や Cursor で拡張機能を入れていた機能が最初から入っています。

<img src="assets/preview.png" width="720" alt="TIDE テーマの Evoke: 左に MENU パネル、中央にエディタ、右に Claude Code">

## ダウンロード

[Releases](https://github.com/jinjwon/undertow/releases/latest) から入手します。

| システム | ファイル | インストール |
| --- | --- | --- |
| macOS (Apple シリコン) | `Evoke-<バージョン>-arm64.dmg` | 開いて Evoke をアプリケーションフォルダへドラッグ |
| Windows (x64) | `Evoke-Setup-<バージョン>.exe` | 実行するとスタートメニューとデスクトップにショートカットができる |
| Windows (インストール不要) | `Evoke-<バージョン>-win-x64.zip` | どこかに展開して `Evoke.exe` を実行 |

[Claude Code](https://docs.claude.com/ja/docs/claude-code) か [Codex](https://developers.openai.com/codex/cli) をインストールしてログインしておく必要があります。どちらか一方で足ります。アプリがどちらを使うかは設定で選びます。

署名していないビルドです。初回だけ、macOS では Evoke を右クリックして「開く」、Windows では「詳細情報 → 実行」を選びます。

## ウィンドウの中身

- **MENU パネル (左):** ターミナル版パネルの 9 つのメニューを、アートとカットインごと収めました。傾いた名前を押します。SKILL (スキルを Claude の入力欄へ)、ITEM (ファイル)、EQUIP (MCP サーバーとプラグイン)、AGENT (過去のセッションを再開)、STATUS (変更ファイルを最後のコミットと比較)、QUEST (残りの TODO)、LINK (プロジェクト)、CALENDAR (Claude と話した日)、SYSTEM (テーマ・言語・ショートカット)。上の HUD は日付、月齢、コンテキスト、5 時間・7 日の使用量とリセットまでの時間、セッション費用を表示し、85% で通知します。
- **エディタ (中央):** Monaco。TS/JS・JSON・CSS・HTML の補完、エラー表示、整形。保存時に整形、括弧の色分け、HTML タグの対応名の同時変更、差分表示、ミニマップ。
- **プレビュータブ:** 1 回クリックでプレビュー (斜体のタブ、次のファイルで置き換わる)、ダブルクリックか編集で固定。画像は画像として開きます。
- **ファイルバッジ** (TS, JS, {}, MD, IMG…) がツリー、タブ、クイックオープンに付きます。
- **CLAUDE / CODEX / SHELL (右):** プロジェクトごとに Claude Code セッション、Codex セッション、シェルをひとつずつ。プロジェクトを切り替えても続きます。Codex とシェルはタブを初めて開いたときに始まります。
- **コーディングエージェント:** 設定 (⚙) → 一般で、Claude Code と Codex、Claude Code のみ、Codex のみから選びます。オフにしたエージェントはタブが出ず、起動もされません。Codex のみの場合は、Codex が信頼したプロジェクトがプロジェクト一覧に並びます。過去のセッション、使用量 HUD、スキル一覧は Claude Code のものです。
- **プレビュー:** PDF、動画、音声ファイルはプレビュータブで開きます。HTML か Markdown のファイルでは、タブ列の端の `LIVE` を押すとそのページが隣のタブに開き、プロジェクトのファイルが変わるたびに再読み込みされます。`↗` は同じページをブラウザで開きます。Word、Excel、PowerPoint のファイルはプレビューできません。
- **サーバー:** LINK に `~/.ssh/config` のホストが並びます。押すと `ssh` ターミナルが別のタブで開きます。サーバー上のターミナルであり、サーバーのファイルはエディタでは開きません。
- **サイズ変更と折りたたみ:** パネルの境目をドラッグするとサイズが変わり、ダブルクリックで元に戻ります。`⌘B` でサイドバー、`⌘J` でターミナルを折りたたみます。上部バーの `◧` `◨` も同じです。空いた場所はエディタが使い、折りたたんだターミナルは動き続けます。
- **VS Code のように開始:** 起動するとフォルダを開くと最近のプロジェクトが出ます。
- **テーマ 2 種類**、テーマごとにロゴが違います。**TIDE** は太い斜線の白と青のゲームメニュー。**REBEL** はブラッドレッド、ピッチブラック、スタークホワイトの 3 色だけを使うプロンプトエンジニアリング向けテーマです。パネルの角は斜めに切り取られ、境目にハーフトーンのドット、フォルダと通知には怪盗の仮面。プロンプトの `{{変数}}` は雑誌を切り貼りした脅迫状のように 1 文字ずつ強調されます。
- **UI 編集モード:** 上部バーの `UI` を押すと、パネルとウィジェットをドラッグ、リサイズ、入れ替えできます。レイアウトとプリセットは再起動後も保持されます。
- **English, 한국어, 日本語:** 設定 (右上の ⚙) で選びます。既定はシステムの言語です。

### ショートカット

Windows では `⌘` の代わりに `Ctrl`。

| キー | 動作 |
| --- | --- |
| `⌘P` | 名前でファイルを開く |
| `⌘⇧F` | プロジェクトを検索 |
| `⌘S` | 整形して保存 |
| `⌘L` | 選択範囲を `@file#Lx-y` として Claude へ。CODEX タブが出ているときは Codex へ |
| `⌘O` | プロジェクト (`1`–`9` または Enter) |
| `⌘B` | サイドバーを表示/非表示 |
| `⌘J` | ターミナルを表示/非表示 |

## 使用量 HUD

数値は CLAUDE パネル内で動く Evoke プラグインから届きます。Claude Code の入力欄で一度だけインストールします。

```
/plugin install evoke --marketplace jinjwon/undertow
```

## デザイン

### 参考にしたもの

| 出典 | 取り入れたもの | Evoke での使い方 |
| --- | --- | --- |
| Persona 5 | 赤・黒・白のコントラスト、大きく傾いた文字、切り貼りした紙のような板、選ぶと大きくなり位置が変わる名前 | 選択中のメニューひとつ: 白い板、黒い文字を切る赤い斜線、ピンクの影。隣の名前は上下によけます。赤は選択と警告だけに使います。REBEL テーマ全体 |
| Persona 3 Reload | シアン・青・白、水とガラス、斜めに切ったパネル、カーソルから内容へ伸びる線、下部の操作ガイド | パネルの地(水のシェーダーが透ける透明な背景)、選択されていない名前のシアン三段階、斜めの HUD、カーソルから内容へ降りる線、下部の `Command` 行。TIDE テーマ全体 |
| VS Code | アクティビティバー → サイドバー → エディター → パネル → ステータスバーの層、クイックオープン、プレビュータブ | 九つのメニューがアクティビティバー、その下の内容がサイドバー、HUD と入力欄の上の帯がステータスバーの役割です。アプリの `⌘P` `⌘⇧F` `⌘B` `⌘J` は VS Code と同じキーです |
| Cursor | エディター横の AI パネル、選択範囲をチャットへ送る | 右の CLAUDE / CODEX パネル、`⌘L` |

二つのゲームは混ぜず、役割を分けました。地と情報は Persona 3 Reload の冷たい色で、いま選んでいるものひとつだけを Persona 5 の赤と白い板で描きます。

### メニューとパネルの原則

- **上から下へ一方向:** HUD(状態)→ 九つのメニュー(選ぶ)→ 選んだメニューの内容 → 下部ガイド(できることとキー)。
- **アイコン:** 名前の前にひとつずつあります。火花(SKILL)、ファイル(ITEM)、プラグ(EQUIP)、仲間(AGENT)、ゲージ(STATUS)、旗(QUEST)、輪(LINK)、月(CALENDAR)、歯車(SYSTEM)。名前と同じ色で、選ぶと赤になります。
- **状態の色:** 赤は選択、80% 以上のゲージ、エラー。シアンは押せるものと補助情報。灰色は使っていないもの。ピンクはカーソルの縁と回数。
- **セクション:** パネルは VS Code のサイドバーのように、帯の見出しが付いたセクションに分かれます。MENU、選んだメニューの内容(スキルはプラグインごとに一セクション)、COMMAND の順で、見出しの右に件数が付きます。
- **絵を描けないターミナル:** Windows Terminal のように画像を描けない場所でも、同じ形を文字で描きます。名前はアートと同じずれた縦の列に並び、選んだ名前は白い板に黒い文字、ピンクの角です。
- **実データだけ:** 記録のないメニューは、記録がないことだけを表示します。
- **絵と操作を分ける:** ターミナルでは傾いた名前は一枚の絵で、クリックできません。押せるのは右端の `1`–`9` と下部のキー行です。
- **動き:** メニューが変わるときだけ、四枚の絵を 24ms 間隔で切り替えます。それ以外でタイマーは動きません。

### ターミナルパネルのキー

修飾キーがないので macOS、Windows、Linux で同じです。パネルがキーボードを持っている間だけ動き、下部の行に `KEYS ON` と出ます。そうでなければ `ctrl+x tab` を押すかパネルをクリックします。

| 分類 | キー | 動作 |
| --- | --- | --- |
| メニュー移動 | `j` / `k` | 次 / 前のメニュー |
| メニュー選択 | `1`–`9` | そのメニューを選び、コマンドを入力欄に入れる |
| 実行 | `e`、続けて Enter | 選んだメニューのコマンドを入力欄に入れて実行 |
| ページ送り | `n` / `b` | SKILL の次 / 前のページ |
| パネル切り替え | `p` / `s` | プロジェクト選択 / スキルブック |
| 戻る | `Esc` | プロジェクト選択やスキルブックを閉じる |
| コマンド | `/menu` `/projects` `/skillbook` | 入力欄からパネルを開く |

### 既知の制限

- ターミナルが 110 列より狭いと、Claude Code はパネルを入力欄の上に置きます。そのときは絵なしの行で描き、キー行を内容の上に置くので、切れても操作は残ります。
- ウィンドウが低いと、絵は比率を保ったまま全体が小さくなり、右に水が残ります。
- 絵の列数は Iosevka 14 のセル比(幅 ÷ 高さ = 0.4)で計算します。別のフォントでは `EVOKE_CELL=0.5` のように、その比率を環境変数で渡します。

### 出典

- Persona 5 Royal: <https://persona.atlus.com/p5r/>
- Persona 3 Reload: <https://persona.atlus.com/p3r/>
- VS Code, user interface: <https://code.visualstudio.com/docs/editing/getting-started/userinterface>
- VS Code, personalize: <https://code.visualstudio.com/docs/getstarted/personalize-vscode>
- VS Code, keyboard shortcuts: <https://code.visualstudio.com/docs/configure/keybindings>
- VS Code, default keybindings: <https://code.visualstudio.com/docs/reference/default-keybindings>
- Cursor, keyboard shortcuts: <https://docs.cursor.com/advanced/keyboard-shortcuts>

## 自分でビルドする

```sh
git clone https://github.com/jinjwon/undertow.git
cd undertow/desktop && npm install && npm start
npm run dist:mac        # release/Evoke-<バージョン>-arm64.dmg
npm run dist:win        # Windows インストーラー (Windows 上で)
```

## アンインストール

**アプリ:** アプリケーションフォルダから Evoke を削除するか、Windows の設定 → アプリから削除します。

**プラグイン:** `/plugin uninstall evoke` を実行します。

## クレジットとプライバシー

Evoke 自身は AI やネットワークへの要求を送りません。CLAUDE パネルの Claude Code は他の場所と同じようにプランを使います。読み書きするファイルは [SECURITY.md](SECURITY.md) を参照してください。

## ライセンスと注意

[MIT](LICENSE)。アートの書体は [Barlow](https://github.com/jpt/barlow) ([OFL](plugins/evoke/tools/fonts/OFL.txt)) です。

Evoke は Persona 3 Reload (TIDE) と Persona 5 (REBEL) のメニューデザインに着想を得た非公式のファンプロジェクトです。ATLUS や SEGA とは関係がなく、承認も受けておらず、ゲームのアセットは含みません。変更点は [CHANGELOG.md](CHANGELOG.md) にあります。
