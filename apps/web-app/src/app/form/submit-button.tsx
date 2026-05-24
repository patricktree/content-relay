import { Button } from "@base-ui/react/button";
import { styled } from "@linaria/react";

import { useFormContext } from "#pkg/app/form/create-form-hook.ts";

type SubmitButtonProps = {
  label: string;
};

export function SubmitButton({ label }: SubmitButtonProps) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <SubmitButtonRoot type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sending…" : label}
        </SubmitButtonRoot>
      )}
    </form.Subscribe>
  );
}

const SubmitButtonRoot = styled(Button)`
  min-width: 128px;
  min-height: 58px;
  padding: 0 24px;
  border: 1px solid oklch(22% 0.012 255);
  border-radius: 2px;
  font-size: 1.2rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: oklch(98% 0.004 255);
  background: oklch(20% 0.014 255);
  cursor: pointer;
  transition:
    transform 160ms ease,
    background-color 160ms ease,
    box-shadow 160ms ease;

  &:hover {
    background: oklch(27% 0.018 255);
  }

  &:focus-visible {
    outline: 2px solid oklch(56% 0.14 250);
    outline-offset: 3px;
  }

  &:active {
    transform: translateY(1px);
  }

  &:disabled {
    color: oklch(58% 0.012 255);
    background: oklch(88% 0.01 255);
    cursor: not-allowed;
    transform: none;
  }
`;
