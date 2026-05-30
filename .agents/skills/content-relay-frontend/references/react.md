# React Rules

## Components

- Use function components.
- Keep components focused on one rendering or interaction responsibility.
- Extract a component when it names a real responsibility, not just to shorten a file.
- Prefer domain-oriented or UI-role-oriented names over vague names like `Manager` or `Handler`.
- Preserve accessible labels, roles, and user-facing text that tests or users rely on.

## State

- Prefer derived values over duplicated state.
- Keep state as local as possible.
- Use React context only for app-wide or subtree-wide state.
- Do not use context for state that belongs to one component or one form.

## Effects

- Avoid `useEffect` for data fetching; use TanStack Query instead.
- Use effects for synchronization with systems outside React, not for derived state.
- Effects that subscribe to native, browser, or platform events must clean up listeners.
- Keep effect dependencies honest; change the code shape instead of suppressing dependency problems.

## Suspense And Async UI

- Use Suspense intentionally, with a clear loading and error boundary strategy.
- Do not leave unreachable `isPending` branches after switching to suspense APIs.
- Keep async failure states visible to users when the UI can recover or continue.

## Anti-Patterns

- Components that mix parsing external payloads, network orchestration, form state, and presentation.
- Context providers that only avoid prop drilling across one or two nearby components.
- Effects that copy props or query results into local state without a synchronization reason.
