# Changelog

## Unreleased

- `ClientConfig.host_tool` is narrowed from `string` to `HostTool` (type-level change for TypeScript consumers). An invalid value now fails at startup with the list of valid values instead of being sent to the server.
- Protocol types re-synced from server `e22e374` (`HostTool` adds `jetbrains` and `cli`).
