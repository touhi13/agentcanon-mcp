# Contributing to AgentCanon MCP

1. Fork and clone https://github.com/touhi13/agentcanon-mcp.
2. Run `npm install` and `npm test`.
3. If you update canonical rules in `.agentcanon/rules.yaml`, run `npm run build && npm run dogfood` so generated instruction files stay in sync.
4. Ensure `npm run check:drift` passes before opening a Pull Request.
