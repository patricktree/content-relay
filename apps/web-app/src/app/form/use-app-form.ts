import { createFormHook } from "@tanstack/react-form";
import { createFormHookContexts } from "@tanstack/react-form";

import {
  FieldError,
  Form,
  FormActions,
  SubmitButton,
  TextField,
} from "#pkg/app/form/form-components.js";

const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();

export { useFieldContext, useFormContext };

const { useAppForm } = createFormHook({
  fieldComponents: {
    TextField,
  },
  formComponents: {
    Form,
    SubmitButton,
    Actions: FormActions,
    FieldError,
  },
  fieldContext,
  formContext,
});

export { useAppForm };
