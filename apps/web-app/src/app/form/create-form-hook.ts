import { createFormHook } from "@tanstack/react-form";
import { createFormHookContexts } from "@tanstack/react-form";

import { SubmitButton } from "#pkg/app/form/submit-button.tsx";
import { TextField } from "#pkg/app/form/text-field.tsx";

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

const { useAppForm } = createFormHook({
  fieldComponents: {
    TextField,
  },
  formComponents: {
    SubmitButton,
  },
  fieldContext,
  formContext,
});

export { useAppForm };
