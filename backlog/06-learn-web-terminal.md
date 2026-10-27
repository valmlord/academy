---
title: "learn(workspace): терминал в браузере (xterm.js + WebSocket)"
labels: [type:feature, team:dev, tier:learn, area:workspace, area:web]
milestone: "M1 Рабочее место"
---
Пишу сам. WebSocket-эндпоинт в workspace-сервисе: `docker exec` с TTY, ресайз, переподключение. На странице урока вкладка "Терминал" на xterm.js.

Чему хочу научиться: WebSocket, потоки и backpressure, TTY, авторизация WS.

Критерии приёмки:
- [ ] в терминале работает bash и агентский CLI внутри контейнера
- [ ] чужой workspace id отклоняется
- [ ] обрыв сети: терминал переподключается к той же сессии
- [ ] e2e: открыть урок, выполнить `echo ok`, увидеть вывод
