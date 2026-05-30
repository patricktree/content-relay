# Linaria And Styling

## Styling Model

- Use Linaria `styled` components for component-local styles.
- Keep global CSS in `app/global-styles.ts` limited to reset, base document styles, and design tokens.
- Prefer existing CSS custom properties before adding new tokens.
- Add new design tokens only when they represent reusable design language, not a one-off layout tweak.

## Visual Language

- Preserve the already existing design direction.

## Styled Components

- Co-locate styled components with the component that owns them unless they are reusable design-system primitives.
- Name styled components by role: `PageShell`, `TargetDeviceName`, `ToastContent`.
- Use semantic HTML first, then style it.
- Use comments only for non-obvious CSS reasons, such as stacking context or position `relative`-`absolute` relationships.

## Layout And Tokens

- Use `var(--spacing-base)` and app padding tokens for spacing.
- Use `var(--border-radius)`, `var(--selected-outline)`, and color tokens instead of hard-coded repeat values.
- Prefer logical properties (`padding-inline`, `margin-block`) when direction-neutral layout is intended.
- Avoid absolute positioning unless it is required for overlays, invisible inputs, or native-like control composition.

## Linaria Constraints

- Keep styled blocks statically analyzable.
- Do not put runtime-only dynamic style logic into Linaria templates.
- Use typed `data-*` attributes for styling variants when static CSS selectors are enough.

Use `MapPropsToRequiredDataAttributeProps` from `#pkg/app/styling.utils.js` to derive typed required `data-*` props from public variant props.

Example from `apps/web-app/src/app/design-system/button.tsx`:

```tsx
import type { MapPropsToRequiredDataAttributeProps } from "#pkg/app/styling.utils.js";

type DSButtonProps = React.ComponentProps<"button"> & DSButtonCustomProps;
type DSButtonCustomProps = {
  variant?: "outlined" | "contained" | "text";
};

export const DSButton: React.FC<DSButtonProps> = ({
  variant = "outlined",
  children,
  ...delegated
}) => {
  return (
    <StyledButton data-variant={variant} {...delegated}>
      {children}
    </StyledButton>
  );
};

type StyledButtonProps = React.ComponentProps<"button"> &
  MapPropsToRequiredDataAttributeProps<DSButtonCustomProps>;

const StyledButton = styled(BaseUIButton)<StyledButtonProps>`
  color: inherit;
  background-color: transparent;

  &[data-variant="outlined"] {
    border: 1px solid currentColor;
    background-color: var(--color-bg);
  }

  &[data-variant="contained"] {
    color: var(--color-bg);
    background-color: var(--color-fg);
  }
`;
```

## Anti-Patterns

- Component-specific selectors in global CSS.
- New raw colors where an existing token fits.
- Hiding native controls without restoring accessible labels and focus visibility.
- Styling that breaks existing Playwright screenshot stability without an intentional snapshot update.
