export type MapPropsToRequiredDataAttributeProps<Props extends object> = {
  [PropName in keyof Props as `data-${Extract<PropName, string>}`]-?: NonNullable<Props[PropName]>;
};
