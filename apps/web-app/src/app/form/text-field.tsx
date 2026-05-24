import { Input } from "@base-ui/react/input";
import { styled } from "@linaria/react";

import { useFieldContext } from "#pkg/app/form/create-form-hook.ts";

type TextFieldProps = {
  label: string;
};

export function TextField({ label }: TextFieldProps) {
  const field = useFieldContext<string>();

  return (
    <FieldLabel>
      <FieldLabelText>{label}</FieldLabelText>
      <FieldInput
        value={field.state.value}
        onBlur={() => field.handleBlur()}
        onChange={(event) => field.handleChange(event.target.value)}
      />
      {!field.state.meta.isValid && (
        <FieldError>{field.state.meta.errors.map((error) => error.message).join(", ")}</FieldError>
      )}
    </FieldLabel>
  );
}

const FieldLabel = styled.label`
  display: grid;
  gap: 10px;
`;

const FieldLabelText = styled.span`
  font-size: 1.45rem;
  line-height: 1;
  font-weight: 700;
  letter-spacing: -0.04em;
  color: oklch(18% 0.012 255);
`;

const FieldInput = styled(Input)`
  width: 100%;
  min-height: 66px;
  padding: 14px 16px;
  border: 1px solid oklch(24% 0.012 255);
  border-radius: 2px;
  color: oklch(18% 0.012 255);
  background: oklch(99% 0.004 255);
  outline: none;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    box-shadow 160ms ease;

  &:hover {
    background: oklch(97% 0.008 255);
  }

  &:focus-visible {
    border-color: oklch(20% 0.014 255);
    box-shadow:
      0 0 0 3px oklch(56% 0.14 250 / 18%),
      inset 0 0 0 1px oklch(20% 0.014 255);
  }
`;

const FieldError = styled.em`
  font-size: 0.88rem;
  font-style: normal;
  color: oklch(48% 0.18 28);
`;
