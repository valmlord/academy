---
title: "learn(workspace): browser terminal (xterm.js + WebSocket)"
labels: [type:feature, team:dev, tier:learn, area:workspace, area:web]
milestone: "M1 Workspace"
---
I write this myself. A WebSocket endpoint in the workspace service: `docker exec` with a TTY, resize, reconnect. A "Terminal" tab on xterm.js on the lesson page.

What I want to learn: WebSocket, streams and backpressure, TTY, WS authorization.

Acceptance criteria:
- [ ] bash and the agent CLI work in the terminal inside the container
- [ ] someone else's workspace id is rejected
- [ ] network drop: the terminal reconnects to the same session
- [ ] e2e: open a lesson, run `echo ok`, see the output
