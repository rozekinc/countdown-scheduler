// Admin-app-only i18n. The display site (src/) stays hardcoded Japanese
// for now -- this only covers the admin editor's own UI chrome. Language
// choice is a local, per-browser preference (like the auth token and the
// owner/repo override), never written to any file or synced via GitHub.

export type Lang = "en" | "ja";

const LANG_KEY = "countdown-scheduler-admin:lang";

type Vars = Record<string, string | number>;

const EN = {
  "nav.editor": "Editor",
  "nav.allEvents": "All events",

  "save.button": "Save changes",
  "save.none": "No unsaved changes",

  "settings.button": "Settings",
  "settings.title": "Settings",
  "settings.detected": "Repo detected from URL: {owner}/{repo}. Nothing to configure here.",
  "settings.notOnGithubIo": "Not running on a github.io URL -- set owner/repo for local testing only.",
  "settings.owner": "Owner:",
  "settings.repo": "Repo:",
  "settings.ownerPlaceholder": "owner (e.g. your-username)",
  "settings.repoPlaceholder": "repo (e.g. countdown-scheduler)",
  "settings.close": "Close",
  "settings.save": "Save",
  "settings.saved": "Settings saved.",

  "auth.signOut": "Sign out",
  "auth.signedIn": "Signed in",
  "auth.signInWithToken": "Sign in with token",
  "auth.signInTitle": "Sign in",
  "auth.tokenHelp":
    "Paste a fine-grained Personal Access Token scoped to just this repo (Contents: read and write, nothing else). See SETUP.md for exactly how to generate one. It's kept in this browser tab only, never saved to disk.",
  "auth.tokenLabel": "Token:",
  "auth.tokenPlaceholder": "github_pat_...",
  "auth.checking": "Checking…",
  "auth.signIn": "Sign in",
  "auth.cancel": "Cancel",
  "auth.signInFailed": "Sign-in failed.",
  "auth.readOnlyWarning":
    "This token looks read-only. Saving changes needs a token with Contents: read AND write. Update the token's permissions in GitHub, or you won't be able to save.",
  "auth.continueAnyway": "Continue anyway",

  "app.label": "App: ",
  "app.liveOnDisplay": "Live on display ✓",
  "app.liveOnDisplayUnsaved": "Live on display ✓ (unsaved)",
  "app.showOnDisplay": "Show this app on display",
  "app.nameLiveSuffix": "{name} (live on display)",
  "app.stagedOnDisplay": "{appId} staged to show on display -- click Save to publish.",

  "displayMode.label": "Display mode: ",
  "displayMode.staged": 'Display mode staged: "{label}" -- click Save to publish.',

  "aspectRatio.label": "TV shape: ",
  "aspectRatio.staged": 'TV shape staged: "{label}" -- click Save to publish.',

  "lang.label": "Language: ",

  "version.label": "Version: ",

  "preview.title": "Display preview",
  "preview.noApp": "No app selected",
  "preview.nextUp": "Next up: ",
  "preview.then": " then ",
  "preview.summary": "{mode} · {ratio}",
  "preview.sampleKeywordA": "Sample A",
  "preview.sampleKeywordB": "Sample B",

  "events.loading": "Loading events…",
  "events.title": "Events",
  "events.signInToLoad": "Sign in to load events.",
  "events.newDraft": "New draft event",
  "events.newIdTitle": "New draft event",
  "events.newIdCreate": "Create",
  "events.newIdPrompt": "New event id (lowercase letters, digits, dashes):",
  "events.invalidId": "Invalid event id: use only lowercase letters, digits, and dashes.",
  "events.alreadyExists": "Event {id} already exists.",
  "events.newDraftStaged": "New draft {id} staged -- click Save to publish.",
  "events.notFound": "Event {id} not found.",
  "events.loadingOne": "Loading {id}…",
  "events.loadFailed": "Failed to load {id}: {message}",
  "events.listFailed": "Failed to list data/events: {message}",
  "events.switchConfirm": "You have unsaved changes to {id}. {action} without saving?",
  "events.switchAction": "Switch events",
  "events.switchAppsAction": "Switch apps",
  "events.newDraftAction": "Create a new draft",

  "days.title": "Days",
  "days.selectEvent": "Select an event.",
  "days.addDay": "+ Add day",
  "days.noDate": "(no date)",
  "days.today": "Today",
  "days.tomorrow": "Tomorrow",
  "days.dayAfter": "Day after",

  "day.noDaySelected": 'No day selected. Use "+ Add day" on the left.',

  "signIn.toEdit": "Sign in with GitHub to edit event data.",
  "editor.selectOrCreate": "Select or create an event to begin editing.",
  "editor.setActive": "Set as active",
  "editor.closeEvent": "Close event",
  "editor.closeConfirm": "Close {id}? This moves it to the archive once you Save.",
  "editor.activeStaged": "{id} staged as active -- click Save to publish.",
  "editor.closeStaged": "{id} staged to close -- click Save to publish.",
  "editor.announcement": "Countdown-screen announcement:",

  "countdown.title": "Countdown rows",
  "countdown.addRow": "+ Add countdown row",
  "countdown.remove": "Remove",

  "day.scheduleFor": "Schedule for {date}",
  "day.date": "Date: ",
  "day.announcement": "Day announcement: ",
  "day.addRow": "+ Add row",
  "day.remove": "Remove",
  "day.timeOptional":
    "Optional: set this so the display can gray this row out once it's passed and highlight it while it's next up.",

  "import.title": "Import from Excel (.xlsx)",
  "import.parseFailed": "Failed to parse {name}: {message}",
  "import.parsed": "Parsed {count} row(s). Review before applying:",
  "import.apply": "Apply to current day",
  "import.noDay": "Select or add a day before applying the import.",
  "import.applied": "Import applied. Review the table, then click Save to publish.",
  "import.cancel": "Cancel import",

  "save.saving": "Saving…",
  "save.saved": "Saved.",
  "save.closed": "Closed {id}.",
  "save.failed": "Failed to save: {message}",

  "load.failedTitle": "Couldn't load data/apps.json",
  "load.failedHint":
    "Most likely cause: this page needs to be served from the repository's root directory (not from inside admin/), so the relative path ../data/apps.json actually resolves. If you're using \"npx serve\", run it from the repo root and open the /admin/ path, rather than running it from inside the admin folder.",
  "load.failed": "Failed to load data/apps.json: {message}",

  "overview.loading": "Loading all events…",
  "overview.empty": "No events yet.",
  "overview.app": "App",
  "overview.event": "Event",
  "overview.status": "Status",
  "overview.dates": "Dates",
  "overview.daysRows": "Days / Countdown rows",
  "overview.noDates": "(no dates set)",
  "overview.loadFailed": "Failed to load events: {message}",
  "overview.signInToSee": "Sign in to see all events.",
} as const;

export type TranslationKey = keyof typeof EN;

const JA: Record<TranslationKey, string> = {
  "nav.editor": "エディター",
  "nav.allEvents": "すべてのイベント",

  "save.button": "変更を保存",
  "save.none": "未保存の変更はありません",

  "settings.button": "設定",
  "settings.title": "設定",
  "settings.detected": "URLからリポジトリを検出しました: {owner}/{repo}。設定は不要です。",
  "settings.notOnGithubIo": "github.io のURLで実行されていません -- ローカルテスト用にオーナー/リポジトリを設定してください。",
  "settings.owner": "オーナー:",
  "settings.repo": "リポジトリ:",
  "settings.ownerPlaceholder": "オーナー (例: your-username)",
  "settings.repoPlaceholder": "リポジトリ (例: countdown-scheduler)",
  "settings.close": "閉じる",
  "settings.save": "保存",
  "settings.saved": "設定を保存しました。",

  "auth.signOut": "サインアウト",
  "auth.signedIn": "サインイン済み",
  "auth.signInWithToken": "トークンでサインイン",
  "auth.signInTitle": "サインイン",
  "auth.tokenHelp":
    "このリポジトリのみに限定したファイングレイン Personal Access Token (Contents: read/write のみ) を貼り付けてください。作成方法は SETUP.md を参照してください。このブラウザタブ内にのみ保持され、ディスクには保存されません。",
  "auth.tokenLabel": "トークン:",
  "auth.tokenPlaceholder": "github_pat_...",
  "auth.checking": "確認中…",
  "auth.signIn": "サインイン",
  "auth.cancel": "キャンセル",
  "auth.signInFailed": "サインインに失敗しました。",
  "auth.readOnlyWarning":
    "このトークンは読み取り専用のようです。変更を保存するには Contents: read/write 権限のトークンが必要です。GitHub でトークンの権限を更新してください。そうしないと保存できません。",
  "auth.continueAnyway": "このまま続行",

  "app.label": "アプリ: ",
  "app.liveOnDisplay": "表示中 ✓",
  "app.liveOnDisplayUnsaved": "表示中 ✓ (未保存)",
  "app.showOnDisplay": "このアプリを表示する",
  "app.nameLiveSuffix": "{name} (表示中)",
  "app.stagedOnDisplay": "{appId} を表示するよう設定しました -- 保存をクリックして公開してください。",

  "displayMode.label": "表示モード: ",
  "displayMode.staged": "表示モードを設定しました: “{label}” -- 保存をクリックして公開してください。",

  "aspectRatio.label": "TVの形状: ",
  "aspectRatio.staged": "TVの形状を設定しました: “{label}” -- 保存をクリックして公開してください。",

  "lang.label": "言語: ",

  "version.label": "バージョン: ",

  "preview.title": "表示プレビュー",
  "preview.noApp": "アプリが選択されていません",
  "preview.nextUp": "次は: ",
  "preview.then": " → ",
  "preview.summary": "{mode} · {ratio}",
  "preview.sampleKeywordA": "サンプルA",
  "preview.sampleKeywordB": "サンプルB",

  "events.loading": "イベントを読み込み中…",
  "events.title": "イベント",
  "events.signInToLoad": "イベントを読み込むにはサインインしてください。",
  "events.newDraft": "新規下書きイベント",
  "events.newIdTitle": "新規下書きイベント",
  "events.newIdCreate": "作成",
  "events.newIdPrompt": "新しいイベントID (小文字・数字・ハイフンのみ):",
  "events.invalidId": "無効なイベントIDです: 小文字・数字・ハイフンのみ使用できます。",
  "events.alreadyExists": "イベント {id} は既に存在します。",
  "events.newDraftStaged": "新規下書き {id} を設定しました -- 保存をクリックして公開してください。",
  "events.notFound": "イベント {id} が見つかりません。",
  "events.loadingOne": "{id} を読み込み中…",
  "events.loadFailed": "{id} の読み込みに失敗しました: {message}",
  "events.listFailed": "data/events の一覧取得に失敗しました: {message}",
  "events.switchConfirm": "{id} に未保存の変更があります。保存せずに{action}しますか？",
  "events.switchAction": "イベントを切り替える",
  "events.switchAppsAction": "アプリを切り替える",
  "events.newDraftAction": "新規下書きを作成",

  "days.title": "日程",
  "days.selectEvent": "イベントを選択してください。",
  "days.addDay": "+ 日を追加",
  "days.noDate": "(日付未設定)",
  "days.today": "今日",
  "days.tomorrow": "明日",
  "days.dayAfter": "明後日",

  "day.noDaySelected": "日が選択されていません。左の「+ 日を追加」を使用してください。",

  "signIn.toEdit": "イベントデータを編集するには GitHub でサインインしてください。",
  "editor.selectOrCreate": "編集するイベントを選択または作成してください。",
  "editor.setActive": "アクティブに設定",
  "editor.closeEvent": "イベントを終了",
  "editor.closeConfirm": "{id} を終了しますか？保存すると、アーカイブに移動します。",
  "editor.activeStaged": "{id} をアクティブに設定しました -- 保存をクリックして公開してください。",
  "editor.closeStaged": "{id} を終了するよう設定しました -- 保存をクリックして公開してください。",
  "editor.announcement": "カウントダウン画面のお知らせ:",

  "countdown.title": "カウントダウン行",
  "countdown.addRow": "+ カウントダウン行を追加",
  "countdown.remove": "削除",

  "day.scheduleFor": "{date} のスケジュール",
  "day.date": "日付: ",
  "day.announcement": "その日のお知らせ: ",
  "day.addRow": "+ 行を追加",
  "day.remove": "削除",
  "day.timeOptional":
    "任意: 設定すると、時刻が過ぎた行をグレーアウトし、次の行を強調表示します。",

  "import.title": "Excel (.xlsx) からインポート",
  "import.parseFailed": "{name} の解析に失敗しました: {message}",
  "import.parsed": "{count} 行を解析しました。適用前に確認してください:",
  "import.apply": "この日に適用",
  "import.noDay": "インポートを適用する前に日を選択または追加してください。",
  "import.applied": "インポートを適用しました。表を確認し、保存をクリックして公開してください。",
  "import.cancel": "インポートをキャンセル",

  "save.saving": "保存中…",
  "save.saved": "保存しました。",
  "save.closed": "{id} を終了しました。",
  "save.failed": "保存に失敗しました: {message}",

  "load.failedTitle": "data/apps.json を読み込めませんでした",
  "load.failedHint":
    "考えられる原因: このページはリポジトリのルートディレクトリから配信する必要があります (admin/ の中からではなく)。相対パス ../data/apps.json が解決できるようにしてください。\"npx serve\" を使う場合は、admin フォルダの中ではなくリポジトリのルートから実行し、/admin/ パスを開いてください。",
  "load.failed": "data/apps.json の読み込みに失敗しました: {message}",

  "overview.loading": "すべてのイベントを読み込み中…",
  "overview.empty": "イベントはまだありません。",
  "overview.app": "アプリ",
  "overview.event": "イベント",
  "overview.status": "ステータス",
  "overview.dates": "日付",
  "overview.daysRows": "日数 / カウントダウン行数",
  "overview.noDates": "(日付未設定)",
  "overview.loadFailed": "イベントの読み込みに失敗しました: {message}",
  "overview.signInToSee": "すべてのイベントを見るにはサインインしてください。",
};

const DICTS: Record<Lang, Record<TranslationKey, string>> = { en: EN, ja: JA };

function detectInitialLang(): Lang {
  const stored = window.localStorage.getItem(LANG_KEY);
  if (stored === "en" || stored === "ja") return stored;
  return navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
}

let currentLang: Lang = detectInitialLang();
const listeners: Array<() => void> = [];

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  if (lang === currentLang) return;
  currentLang = lang;
  window.localStorage.setItem(LANG_KEY, lang);
  listeners.forEach((listener) => listener());
}

/** Called whenever setLang() changes the language, so the app can
 * re-render its currently-visible chrome without a full page reload. */
export function onLangChange(listener: () => void): void {
  listeners.push(listener);
}

export function t(key: TranslationKey, vars?: Vars): string {
  const template = DICTS[currentLang][key] ?? EN[key] ?? key;
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (acc, [name, value]) => acc.split(`{${name}}`).join(String(value)),
    template,
  );
}
