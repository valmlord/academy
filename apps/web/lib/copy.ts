import type { Lesson } from "@academy/lesson-schema/schema";

// Every Russian UI string of apps/web lives here; nowhere else.
// The copy is closed: each string is quoted from design/flows/ia.md or from the Copy table of a ready
// page's acceptance notes, never invented. Tests import these constants instead of repeating the text.

// design/flows/ia.md, navigation model: the product name in the top bar.
export const brandName = "Академия";

// design/flows/ia.md, page inventory: the dashboard's title and h1.
export const homeTitle = "Главная";

// design/flows/ia.md, table "Action labels", R4: the skip link.
export const skipLinkLabel = "К содержимому";

// design/flows/ia.md, copy register "sign-in (F1, F3)"; design/pages/sign-in/acceptance.md, Copy.
export const signInTitle = "Вход";
export const emailLabel = "Почта";
export const passwordLabel = "Пароль";
export const signInBusyLabel = "Входим...";
export const emptyEmailError = "Введите почту";
export const emptyPasswordError = "Введите пароль";
export const wrongCredentialsMessage = "Неверная почта или пароль";
export const noUserHint = "Пользователя создаёт скрипт seed, см. README";
export const serverUnreachableMessage =
  "Не удалось связаться с сервером. Проверьте, что платформа запущена (docker compose up), и попробуйте снова.";
export const tooManyAttemptsMessage = "Слишком много попыток входа. Подождите и попробуйте снова.";
export const signedOutNote = "Вы вышли";

// design/flows/ia.md, table "Action labels": "sign in", "retry a failed load or start".
export const signInLabel = "Войти";
export const retryLabel = "Повторить";

// design/flows/ia.md, table "Action labels": "sign out", "sign in again after expiry".
export const signOutLabel = "Выйти";
export const signInAgainLabel = "Войти снова";

// design/flows/ia.md, "page region" and R2: the visually hidden heading of the notifications region.
export const notificationsHeading = "Уведомления";

// design/flows/ia.md, copy register "page alert (region Уведомления)", F2.1.
export const sessionExpiredMessage = "Сессия закончилась. Файлы в рабочей папке сохранены.";

// design/pages/lesson/acceptance.md, Copy "idle alert" and "idle action" (F10.1, F10.2); `minutes` is the
// service's ENVIRONMENT_IDLE_WARNING_MINUTES.
export function idleWarningMessage(minutes: number): string {
  return `Окружение остановится через ${minutes} мин без активности. Файлы сохранятся.`;
}
export const continueWorkLabel = "Продолжить работу";

// design/flows/ia.md, copy register "dashboard (F4, F18)": the empty state (dashboard AC7).
export const noReadyLessonsMessage = "В курсе пока нет готовых уроков";

// design/flows/ia.md, table "Action labels": "copy a code block"; design/pages/lesson/acceptance.md, Copy
// ("copy denied", AC14).
export const copyLabel = "Копировать";
export const copyDeniedLabel = "Не скопировано, выделите текст вручную";

// design/flows/ia.md, table "Action labels": the two "open the catalog" labels, "Курс" in the top bar and
// the lesson breadcrumb, "Открыть курс" on the dashboard and the not-found page.
export const courseLinkLabel = "Курс";
export const openCourseLabel = "Открыть курс";

// design/flows/ia.md, copy register "catalog (F5, F6)" and "dashboard (F4, F18)": the course read error
// (catalog AC8, dashboard AC8).
export const courseErrorTitle = "Не удалось загрузить курс";

// design/flows/ia.md, copy register "not-found (F5, F7)": the title and h1, and the one sentence under the h1 in
// every state.
export const notFoundTitle = "Страница не найдена";
export const notFoundSentence = "Возможно, в адресе опечатка или ссылка устарела.";

// design/flows/ia.md, vocabulary "outcomes"; design/pages/catalog/acceptance.md, Copy "outcomes heading".
export const outcomesHeading = "Чему научитесь";

// design/flows/ia.md, copy register "dashboard (F4, F18)" and "lesson (F6-F13, F19)": "около N мин".
export function durationLabel(minutes: number): string {
  return `около ${minutes} мин`;
}

// design/flows/ia.md, closed set "lesson type": the schema `type` values, in schema order.
export const lessonTypeLabels: Record<Lesson["type"], string> = {
  theory: "теория",
  quiz: "квиз",
  artifact: "артефакт",
  "agent-eval": "оценка агента",
  "bug-hunt": "поиск багов",
  project: "проект",
};

// design/flows/ia.md, closed set "module status".
export const moduleAvailableLabel = "Доступен";
export const modulePreparingLabel = "Готовится";

// design/flows/ia.md, copy register "catalog (F5, F6)": a module without ready lessons (catalog AC4).
export const noModuleLessonsMessage = "Уроки модуля готовятся";

// design/pages/catalog/acceptance.md, Copy "lesson row meta": "<lesson type>, около N мин".
export function lessonRowMeta(typeLabel: string, minutes: number): string {
  return `${typeLabel}, ${durationLabel(minutes)}`;
}

// design/flows/ia.md, closed set "lesson status": every lesson is "not started" until #35 reads progress.
export const lessonNotStartedLabel = "Не начат";

// design/pages/catalog/acceptance.md, Copy "prerequisite note": the prefix before the lesson links.
export const prerequisiteNotePrefix = "Сначала пройдите: ";

// design/flows/ia.md, vocabulary "page region": the visually hidden heading of the lesson region.
export const lessonRegionHeading = "Урок";

// design/pages/lesson/acceptance.md, Copy: the breadcrumb's and the tab list's accessible names.
export const breadcrumbLabel = "Навигация";
export const lessonTabsLabel = "Разделы урока";

// design/flows/ia.md, vocabulary "theory", "task"; design/pages/lesson/acceptance.md, Copy "left tabs".
export const theoryTabLabel = "Теория";
export const taskTabLabel = "Задание";

// design/pages/lesson/acceptance.md, Copy "one-pane switch label", "one-pane switch tabs" and "switch suffix
// (hidden)": the switch shown in each pane below 64rem, and the hidden word after "Окружение".
export const paneSwitchLabel = "Область";
export const lessonPaneTabLabel = "Урок";
export const environmentPaneTabLabel = "Окружение";
export const environmentStoppedSuffix = "остановлено";
export const environmentErrorSuffix = "ошибка";

// design/pages/lesson/acceptance.md, Copy "split handle name" and "split handle tooltip".
export const splitHandleLabel = "Граница панелей";
export const splitHandleTooltip = "Перетащите или щёлкните, чтобы сменить ширину";

// design/flows/ia.md, copy register "lesson (F6-F13, F19)": the M0 line under the lesson header.
export const m0LessonNote = "Окружение и проверки появятся в следующей версии платформы";

// design/flows/ia.md, copy register "lesson (F6-F13, F19)": table of contents and sources.
export const tableOfContentsHeading = "Содержание";
export const sourcesHeading = "Источники";
export function sourceCheckedLabel(date: string): string {
  return `проверено ${date}`;
}

// design/flows/ia.md, copy register "lesson (F6-F13, F19)": a tab whose text cannot be read.
export const lessonTextErrorTitle = "Не удалось загрузить текст урока";

// design/pages/lesson/acceptance.md, Copy "outcomes toggle".
export const showAllOutcomesLabel = "Показать все";
export const collapseOutcomesLabel = "Свернуть";

// design/flows/ia.md, copy register "dashboard (F4, F18)": the Card, its button and the first-run course
// line; "N из M уроков" for a module row and "N из M" as the course bar's value text.
export const nextLessonHeading = "Следующий урок";
export const startLessonLabel = "Начать";
export const noPassedLessonsMessage = "Пока нет пройденных уроков";
export function moduleProgressLabel(passed: number, total: number): string {
  return `${passed} из ${total} уроков`;
}
export function progressValueText(passed: number, total: number): string {
  return `${passed} из ${total}`;
}

// design/pages/lesson/acceptance.md, Copy: the environment region's hidden heading, its tab list label, the
// tab and the terminal's accessible name.
export const environmentRegionHeading = "Окружение";
export const environmentTabsLabel = "Окружение";
export const terminalTabLabel = "Терминал";
export const terminalName = "Терминал";

// design/pages/lesson/acceptance.md, Copy "key hint" and "key hint, macOS".
export const regionKeyHint = "F6 или Ctrl+Shift+. (клавиша Ю): следующая область";
export const regionKeyHintMac = "F6 (Fn+F6) или Ctrl+Shift+. (клавиша Ю): следующая область";

/** A piece of a key hint: a key name, drawn as a Kbd, or the text between keys. */
export interface KeyHintPart {
  kind: "key" | "text";
  text: string;
}

// The same two hints split into keys and text, as the prototype marks them up (`<kbd>` per key,
// prototype.html F9.4). Joined, each equals its string above (copy.test.ts).
export const regionKeyHintParts: readonly KeyHintPart[] = [
  { kind: "key", text: "F6" },
  { kind: "text", text: " или " },
  { kind: "key", text: "Ctrl" },
  { kind: "text", text: "+" },
  { kind: "key", text: "Shift" },
  { kind: "text", text: "+" },
  { kind: "key", text: "." },
  { kind: "text", text: " (клавиша Ю): следующая область" },
];
export const regionKeyHintMacParts: readonly KeyHintPart[] = [
  { kind: "key", text: "F6" },
  { kind: "text", text: " (" },
  { kind: "key", text: "Fn" },
  { kind: "text", text: "+" },
  { kind: "key", text: "F6" },
  { kind: "text", text: ") или " },
  { kind: "key", text: "Ctrl" },
  { kind: "text", text: "+" },
  { kind: "key", text: "Shift" },
  { kind: "text", text: "+" },
  { kind: "key", text: "." },
  { kind: "text", text: " (клавиша Ю): следующая область" },
];

// design/pages/lesson/acceptance.md, Copy "environment status", "environment notes" (the slow start) and
// "environment errors".
export const environmentCreatingStatus = "Создаём окружение";
export const environmentStartingStatus = "Запускаем окружение";
export const environmentSlowNote = "Запуск идёт дольше обычного";
export const environmentRunningStatus = "Окружение работает";
export const environmentStoppedStatus =
  "Окружение остановлено. Файлы в рабочей папке сохранены. Запущенные процессы завершены.";
export const environmentMemoryLimitStatus =
  "Окружение остановлено: превышен лимит памяти. Файлы сохранены.";
export const dockerDownStatus =
  'Docker не запущен. Запустите Docker Desktop и нажмите "Повторить".';
export function imageMissingStatus(image: string): string {
  return `Нет образа окружения ${image}. Соберите его (см. README) и нажмите "Повторить".`;
}
export const environmentRejectedStatus = "Нет доступа к этому окружению.";

// design/pages/lesson/acceptance.md, Copy "environment notes": the note after a reset (F11.4).
export const workspaceResetNote = "Рабочая папка сброшена";
// design/pages/lesson/acceptance.md, Copy "environment notes": the note after a start found the working folder
// gone (F10 error states).
export const volumeRecreatedNote =
  "Рабочая папка не найдена, создано новое окружение из исходных файлов урока.";

// design/pages/lesson/acceptance.md, Copy "status actions": the disclosure of the error code (D3).
export const detailsLabel = "Подробности";

// design/pages/lesson/acceptance.md, Copy "actions menu" and "disabled reasons" (F11.1, F11.2).
export const actionsMenuLabel = "Действия";
export const restartEnvironmentLabel = "Перезапустить окружение";
export const resetWorkspaceLabel = "Сбросить рабочую папку";
export const screenReaderModeLabel = "Режим для экранного диктора";
export const environmentNotRunningReason = "Доступно, когда окружение работает";

// design/pages/lesson/acceptance.md, Copy "reset dialog" (F11.3).
export const resetDialogTitle = "Сбросить рабочую папку?";
export const resetDialogDescription =
  "Файлы урока вернутся к исходным, ваши изменения пропадут. Счётчики попыток не обнулятся.";
export const cancelLabel = "Отмена";
export const resetConfirmLabel = "Сбросить";

// design/pages/lesson/acceptance.md, Copy "terminal connection" and "status actions".
export const connectionLostStatus = "Соединение с терминалом потеряно. Переподключаемся...";
export const reconnectFailedStatus = "Не удалось переподключиться";
export const shellExitedStatus = "Сеанс терминала завершён";
export const reconnectLabel = "Переподключиться";
export const openNewSessionLabel = "Открыть новый сеанс";
export const startAgainLabel = "Запустить снова";

// Stepan's copy for #32 (D8), not yet in the design flows or the lesson Copy table: follow-up 7.4 adds it
// there. The taken-over state and its action, and the generic start failure (its action is retryLabel).
export const takenOverStatus = "Терминал открыт в другой вкладке.";
export const openHereLabel = "Открыть здесь";
export const startFailedStatus = "Не удалось запустить окружение.";
