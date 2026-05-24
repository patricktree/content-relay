import { Toast } from "@base-ui/react/toast";
import React from "react";

export const AppToasts: React.FC = () => {
  return (
    <Toast.Portal>
      <Toast.Viewport>
        <ToastList />
      </Toast.Viewport>
    </Toast.Portal>
  );
};

const ToastList: React.FC = () => {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => (
    <Toast.Root key={toast.id} toast={toast}>
      <Toast.Content>
        <Toast.Title />
        <Toast.Description />
        <Toast.Close aria-label="Close">X</Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
};
