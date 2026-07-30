import { Input } from "@base-ui/react/input";
import { styled } from "@linaria/react";
import React from "react";

import { DSButton } from "#src/app/design-system/button.js";
import { useFieldContext } from "#src/app/form/use-app-form.js";
import { useFormContext } from "#src/app/form/use-app-form.js";

export const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: calc(2 * var(--spacing-base));
`;

export const FormActions = styled.div`
  display: flex;
  justify-content: end;
`;

export const FieldError = styled.em`
  color: var(--color-red);
`;

type SubmitButtonProps = {
  label: string;
};

export const SubmitButton: React.FC<SubmitButtonProps> = ({ label }) => {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <DSButton type="submit" variant="contained" disabled={isSubmitting}>
          {isSubmitting ? "Sending…" : label}
        </DSButton>
      )}
    </form.Subscribe>
  );
};

type TextFieldProps = {
  label: string;
};

export const TextField: React.FC<TextFieldProps> = ({ label }) => {
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
};

const FieldLabel = styled.label`
  display: flex;
  flex-direction: column;
  gap: calc(0.5 * var(--spacing-base));
`;

const FieldLabelText = styled.span``;

const FieldInput = styled(Input)``;
