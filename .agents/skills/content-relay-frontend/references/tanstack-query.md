# TanStack Query

## Query Factories

- Keep query factories and query-specific hooks in the frontend data-fetching layer.
- Name factories `create<Thing>Query` and return an object suitable for `useQuery`, `useSuspenseQuery`, or `useSuspenseQueries`.
- Include every input that affects data in the query key.
- Keep query keys stable, serializable, and specific enough to avoid cross-settings cache leaks.
- Use shared client helpers at the data-fetching boundary for Relay Hub calls.

## Mutations

- Use `useMutation` for writes and platform side effects.
- On success or settlement, update or invalidate the precise affected query data.
- Prefer `queryClient.setQueryData` for small local synchronization.
- Avoid broad invalidation unless the affected data set is genuinely unclear.

## Defaults

- Keep global defaults centralized in the app provider layer.
- Override defaults per query only when that query has a specific reason.
- Preserve `retry: false` for user-action-oriented flows unless product behavior explicitly requires retry.
- Use infinite `gcTime`/`staleTime` only for state that should remain stable until explicitly changed.

## UI Integration

- Keep query creation outside JSX-heavy code when it improves readability.
- Gate query creation on required inputs; do not call Relay Hub queries before settings are available.
- Avoid rendering stale data from a previous Relay Hub URL, Device nickname, Device ID, or other identity input; make those inputs part of the key.
- For parallel queries, use `useSuspenseQueries` when both results are required before rendering.

## Anti-Patterns

- Query keys missing Relay Hub URL, Device nickname, Device ID, or other identity inputs.
- Direct `fetch` calls in React components for Relay Hub data.
- Mutations that change server/platform state without updating affected cached client state.
- Retrying native platform calls that should fail fast for unsupported platforms.
