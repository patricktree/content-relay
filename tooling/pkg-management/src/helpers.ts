const REGEX_CONTENT_RELAY_PROJECT_NAME = /^@content-relay\/.+/;

export const monorepoPackagePrefix = "@content-relay";

/** A Template Literal Type representing content-relay project names (e.g. "@content-relay/web-app"). */
export type ContentRelayProjectName = `${typeof monorepoPackagePrefix}/${string}`;

export function isContentRelayProjectName(input: unknown): input is ContentRelayProjectName {
  return typeof input === "string" && REGEX_CONTENT_RELAY_PROJECT_NAME.test(input);
}
