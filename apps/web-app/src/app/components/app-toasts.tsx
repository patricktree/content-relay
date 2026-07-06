import { Toast } from "@base-ui/react/toast";
import { styled } from "@linaria/react";
import React from "react";

import { DSButton } from "#src/app/design-system/button.js";

export const AppToasts: React.FC = () => {
  return (
    <Toast.Portal>
      <FloatingToastRegion>
        <ToastList />
      </FloatingToastRegion>
    </Toast.Portal>
  );
};

const ToastList: React.FC = () => {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => (
    <Toast.Root key={toast.id} toast={toast}>
      <ToastContent>
        <Toast.Title render={<ToastTitle />} />
        <Toast.Description />
        <Toast.Close aria-label="Close" render={<DSButton variant="text">X</DSButton>} />
      </ToastContent>
    </Toast.Root>
  ));
};

const FloatingToastRegion = styled(Toast.Viewport)`
  position: fixed;
  bottom: var(--app-padding-block);
  right: var(--app-padding-inline);
`;

const ToastContent = styled(Toast.Content)`
  display: flex;
  align-items: center;
  gap: calc(2 * var(--spacing-base));
  padding-block: calc(0.5 * var(--spacing-base));
  padding-inline: calc(1 * var(--spacing-base));

  color: var(--color-bg);
  background-color: var(--color-fg);
  box-shadow: var(--paper-shadow);
`;

const ToastTitle = styled.h2`
  font-size: var(--font-size-sm);
`;
