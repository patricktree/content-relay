import { Button as BaseUIButton } from "@base-ui/react/button";
import { styled } from "@linaria/react";

import type { MapPropsToRequiredDataAttributeProps } from "#src/app/styling.utils.js";

type DSButtonProps = React.ComponentProps<"button"> & DSButtonCustomProps;
type DSButtonCustomProps = {
  variant?: "outlined" | "contained" | "text";
};

export const DSButton: React.FC<DSButtonProps> = ({
  variant = "outlined",
  children,
  style,
  ...delegated
}) => {
  return (
    <StyledButton data-variant={variant} style={style ?? {}} {...delegated}>
      {children}
    </StyledButton>
  );
};

type StyledButtonProps = React.ComponentProps<"button"> &
  MapPropsToRequiredDataAttributeProps<DSButtonCustomProps>;

const StyledButton = styled(BaseUIButton)<StyledButtonProps>`
  padding-block: calc(1 * var(--spacing-base));
  padding-inline: calc(1.5 * var(--spacing-base));

  color: inherit;
  background-color: transparent;
  border: 0px;
  border-radius: var(--border-radius);

  &:hover {
    cursor: pointer;
  }

  &[data-variant="outlined"] {
    border: 1px solid currentColor;
    background-color: var(--color-bg);
  }

  &[data-variant="contained"] {
    color: var(--color-bg);
    background-color: var(--color-fg);
  }
`;
