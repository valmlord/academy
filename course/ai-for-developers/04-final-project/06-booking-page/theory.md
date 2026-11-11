# Итоговый проект: страница бронирования на Nuxt

**Твой шаг.** В эталонном плане урока 1 это страничная часть срезов 1 и 4: приглашённый видит
свободные слоты на свою дату в своём поясе (REQ-20; номер из спецификации стартера, в своей
нумерации он может быть другим), выбирает слот, заполняет форму и видит
подтверждение или "этот слот уже заняли". Вертикальная команда делала бы список слотов в срезе 1, а
форму с 409 в срезе 4, вместе с API. Здесь API уже готов (уроки 4-5), и урок добавляет страницу.

## Проблема

Страница пишется за час и работает в `nuxt dev`. Потом её собирают (`nuxt build`) и запускают
собранный сервер, и начинается:

- Клиент `openapi-fetch` с `baseUrl: '/api'` в браузере работает, а при отрисовке на сервере
  падает: на Nuxt 4.6.4 курс видел "Failed to parse URL from /api/...". У сервера нет адреса
  страницы, к которому можно привязать относительный путь. В браузере `Request` разрешает его
  относительно `baseURI` документа, а если URL "cannot be parsed", бросает `TypeError`.
- Адрес бэкенда для прокси задан переменной при запуске, а прокси всё равно ходит на адрес, который
  был при сборке.
- Слоты подписаны временем в поясе сервера или браузера, а не приглашённого.
- Слот 00:30 по Берлину в UTC лежит на предыдущей дате: при фильтре по дате в UTC он пропадает со
  страницы, а слот соседней даты попадает на неё.

## Идея

1. **Два пути к бэкенду.** Браузер ходит на свой же сервер по `/api/...`, а Nuxt проксирует это на
   бэкенд: один источник, CORS не нужен. Сервер Nuxt при отрисовке ходит на бэкенд напрямую, по
   абсолютному адресу из приватного ключа `runtimeConfig`.
2. **Что решается при сборке, а что при запуске.** `nuxt.config.ts` выполняется при сборке.
   Документация runtime config предупреждает: значения по умолчанию из переменных с другими именами
   "will only work during build-time and will break on runtime". При запуске переменные окружения
   меняют только объявленные ключи `runtimeConfig`: "Runtime config values are automatically
   replaced by matching environment variables at runtime", а имя переменной это "an uppercase
   environment variable starting with `NUXT_` which uses `_` to separate keys and case changes"
   (`apiBase` меняет `NUXT_API_BASE`). Правила маршрутов `routeRules`, включая `proxy`, к ним не
   относятся: на Nuxt 4.6.4 курс видел, что цель прокси записывается в собранный `.output`. Значит,
   адрес для `proxy` нужен уже при сборке. Переменная `NUXT_NITRO_ROUTE_RULES` не документирована,
   не полагайтесь на неё.
3. **Время в поясе приглашённого считается явно.** Слот принадлежит той местной дате, на которую
   приходится его начало в поясе `tz`, и подписан `HH:MM` в этом поясе.
4. **Типы из контракта, а не руками.** `openapi-typescript` делает из OpenAPI урока 2 файл типов,
   `openapi-fetch` проверяет по нему пути, параметры и тела при компиляции. Файл генерируется
   командой и не правится.

## Как это выглядит в Nuxt

Конфигурация с прокси по правилу маршрута. Адрес читается при сборке:

```ts
const backend = process.env.CALENDAR_API_URL ?? 'http://127.0.0.1:8080'

export default defineNuxtConfig({
  runtimeConfig: { apiBase: backend },
  routeRules: { '/api/**': { proxy: `${backend}/**` } },
})
```

`proxy` по документации: "Proxy requests to another URL using a string target or an object with
`to` and H3 proxy options". Запрос `/api/event-types` уходит на `<backend>/event-types` (так курс
проверил на Nuxt 4.6.4).

Вторая честная форма: обработчик `server/api/[...].ts`. Файлы в `server/api` "are automatically
prefixed with `/api` in their route", а `[...].ts` "will register a catch-all route". Обработчик
читает адрес через `useRuntimeConfig(event)` уже при запуске и пересылает запрос функцией h3
`proxyRequest` ("Proxy the incoming request to a target URL"), убрав префикс `/api`.

Клиент выбирает адрес по стороне, где выполняется код (`import.meta.server` "True when evaluated
on the server side"):

```ts
import createClient from 'openapi-fetch'
import type { paths } from './schema'

export function useApiClient() {
  const config = useRuntimeConfig()
  return createClient<paths>({ baseUrl: import.meta.server ? config.apiBase : '/api' })
}
```

Данные для отрисовки на сервере берите через `useAsyncData`. Про запрос прямо в компоненте, без
обёртки, документация пишет: "this may cause data to be fetched twice, once on the server (to
render the HTML) and once again on the client". С `useAsyncData` "the data is forwarded to the
client in the payload".

Время в поясе. Это можно запустить в Node (`node -e '...'`):

```js
const hhmm = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
console.log(hhmm.format(new Date('2026-03-29T00:30:00Z'))) // 01:30
console.log(hhmm.format(new Date('2026-03-29T01:00:00Z'))) // 03:00, 02:xx в этот день нет
```

`timeZone` "Can be any IANA time zone name", а по умолчанию это пояс среды выполнения, то есть
сервера или браузера. Местную дату слота считайте так же, с `timeZone`. Вопрос до практики: какой
диапазон `from`/`to` в UTC запросить у API, чтобы в него точно попали все слоты одной местной даты
в любом из восьми поясов?

## Тесты страницы

**Компонентный тест** (vitest и `@nuxt/test-utils`): `mountSuspended` "allows you to mount any Vue
component within the Nuxt environment". Клиент в тесте подменяется: `vi.mock` модуля клиента или
`registerEndpoint`, который "allows you create Nitro endpoint that returns mocked data". Тест
подаёт слоты через перевод часов или через полночь в поясе и проверяет, что нарисовано и что
запрошено. Среду Nuxt выбирают глобы проекта vitest: "Use your projects' `include` globs to choose
the environment for a test file".

**E2E на Playwright** проверка не запускает: в образе нет браузера. Вы запускаете их у себя:
`npx playwright install chromium` (браузер ставится отдельно, "You can also install specific
browsers by providing an argument"), потом `npx playwright test`. Бэкенд для них запускается с
тестовыми переменными, например `CALENDAR_NOW=2026-03-01T08:00:00Z`, чтобы весенний перевод часов
попал в окно бронирования.

> **Nuxt для Vue-разработчика.**
> - **Страницы из файлов.** `app/pages/book/[eventTypeId].vue` это маршрут `/book/:eventTypeId`:
>   "If you place anything within square brackets, it will be turned into a dynamic route
>   parameter". Параметр и query читаются через `useRoute()`.
> - **Автоимпорт.** "Nuxt auto-imports components, composables and Vue.js APIs": `useRoute`,
>   `useRuntimeConfig`, `useAsyncData` и ваши компоненты без `import`.
> - **Код страницы выполняется дважды.** "Middlewares and pages run in the server and on the client
>   during hydration": сначала на сервере для HTML, потом в браузере. Всё, что зависит от стороны,
>   проверяйте через `import.meta.server`.
> - **Собранный сервер это Node.** `node .output/server/index.mjs` слушает `PORT` и `HOST`:
>   "`NITRO_PORT` or `PORT` (defaults to `3000`)", "`NITRO_HOST` or `HOST` (defaults to
>   `'0.0.0.0'`)".
> - **`npm ci` вместо `npm install`.** `npm ci` ставит ровно то, что в `package-lock.json`, и
>   "will never write to `package.json` or any of the package-locks".

## Частые ошибки

- Относительный `baseUrl` клиента на сервере: страница пустая или 500 только в собранном виде.
- Адрес прокси читается при запуске: `routeRules` уже собраны со старым адресом.
- `CALENDAR_API_URL` в `runtimeConfig` по умолчанию, без своего `NUXT_...` при запуске: работает,
  только если адрес при сборке и при запуске один.
- Время через `toLocaleTimeString()` без `timeZone`: пояс сервера или браузера.
- Слоты фильтруются по дате в UTC, а не в `tz`.
- Слоты рисуются только в браузере (`onMounted`, `ssr: false`): в HTML от сервера их нет.
- `schema.d.ts` поправлен руками или сгенерирован другой версией `openapi-typescript`.
- Компонентный тест ходит в настоящий бэкенд: без него он падает или пропускается.

## Что делать в практике

`npm ci` в `frontend/`, потом `make gen` и клиент, потом страница со слотами и её проверка на
собранном сервере, потом прокси, форма с 409, компонентный тест и E2E у себя. Правила проверок,
адрес страницы и окружение описаны в задании.
