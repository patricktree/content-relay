import type { ComponentPropsWithoutRef, CSSProperties } from "react";

export type IconProps = Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  name: "android" | "ios" | "laptop_mac";
  isFilled?: boolean;
};

export const Icon: React.FC<IconProps> = ({ name, isFilled = false, style, ...spanProps }) => {
  const iconStyle = {
    ...style,
    fontVariationSettings: `"FILL" ${isFilled ? 1 : 0}, "wght" 400, "GRAD" 0, "opsz" 24`,
  } satisfies CSSProperties;

  return (
    <span
      {...spanProps}
      aria-hidden={true}
      className={joinClassNames("material-symbols-rounded", spanProps.className)}
      style={iconStyle}
    >
      {name}
    </span>
  );
};

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter((className) => className !== undefined && className !== "").join(" ");
}
