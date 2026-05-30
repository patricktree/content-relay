import { styled } from "@linaria/react";
import React from "react";

import { DSButton } from "#pkg/app/design-system/button.js";

export const AppErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <AppErrorBoundaryClass>{children}</AppErrorBoundaryClass>;
};

type AppErrorBoundaryClassProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryClassState = {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
};

class AppErrorBoundaryClass extends React.Component<
  AppErrorBoundaryClassProps,
  AppErrorBoundaryClassState
> {
  override state: AppErrorBoundaryClassState = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryClassState> {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("Unhandled React error.", error, errorInfo);
    this.setState({ errorInfo });
  }

  override render(): React.ReactNode {
    if (this.state.error !== null) {
      return (
        <ErrorPageShell role="alert" aria-labelledby="app-error-heading">
          <ErrorCard>
            <h1 id="app-error-heading">Something went wrong</h1>
            <ErrorText>The app hit an unexpected error. Try again or reload the page.</ErrorText>
            <ErrorDetails>
              <summary>Error details</summary>
              <ErrorPre>{formatErrorDetails(this.state.error, this.state.errorInfo)}</ErrorPre>
            </ErrorDetails>
            <ErrorActions>
              <DSButton
                type="button"
                variant="contained"
                onClick={() => {
                  this.setState({ error: null, errorInfo: null });
                }}
              >
                Try again
              </DSButton>
              <DSButton
                type="button"
                variant="contained"
                onClick={() => {
                  window.location.reload();
                }}
              >
                Reload
              </DSButton>
            </ErrorActions>
          </ErrorCard>
        </ErrorPageShell>
      );
    }

    return this.props.children;
  }
}

function formatErrorDetails(error: Error, errorInfo: React.ErrorInfo | null): string {
  const details = [`${error.name}: ${error.message}`];

  if (error.stack !== undefined) {
    details.push(`Stack:\n${error.stack}`);
  }

  const componentStack = errorInfo?.componentStack;
  if (componentStack !== undefined && componentStack !== null && componentStack.trim() !== "") {
    details.push(`Component stack:\n${componentStack}`);
  }

  return details.join("\n\n");
}

const ErrorPageShell = styled.main`
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding-block: var(--app-padding-block);
  padding-inline: var(--app-padding-inline);
`;

const ErrorCard = styled.div`
  max-width: 520px;
  border: 1px solid var(--color-fg);
  border-radius: var(--border-radius);
  padding: calc(2 * var(--spacing-base));
  background: var(--color-bg);
`;

const ErrorText = styled.p`
  margin-block-start: var(--spacing-base);
`;

const ErrorDetails = styled.details`
  margin-block-start: calc(2 * var(--spacing-base));
`;

const ErrorPre = styled.pre`
  max-height: 320px;
  margin-block-start: var(--spacing-base);
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: var(--font-size-sm);
`;

const ErrorActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-base);
  margin-block-start: calc(2 * var(--spacing-base));
`;
