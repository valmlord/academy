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

// design/flows/ia.md, copy register "dashboard (F4, F18)": the empty state (dashboard AC7).
export const noReadyLessonsMessage = "В курсе пока нет готовых уроков";

// design/flows/ia.md, table "Action labels": "copy a code block"; design/pages/lesson/acceptance.md, Copy
// ("copy denied", AC14).
export const copyLabel = "Копировать";
export const copyDeniedLabel = "Не скопировано, выделите текст вручную";
