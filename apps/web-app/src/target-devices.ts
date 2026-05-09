import type { DeviceSummary } from "@content-relay/shared";

export function parseManualTargetDeviceIds(value: string): string[] {
  return value
    .split(/[\n,]/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function mergeTargetDeviceIds(
  selectedTargetDeviceIds: string[],
  manualTargetDeviceIds: string,
): string[] {
  return Array.from(
    new Set([...selectedTargetDeviceIds, ...parseManualTargetDeviceIds(manualTargetDeviceIds)]),
  );
}

export function toggleId(values: string[], value: string, shouldInclude: boolean): string[] {
  if (shouldInclude) {
    return Array.from(new Set([...values, value]));
  }

  return values.filter((entry) => entry !== value);
}

export function getUnavailableSelectedTargetDeviceIds(
  selectedTargetDeviceIds: string[],
  availableDevices: DeviceSummary[],
): string[] {
  const availableDeviceIds = new Set(availableDevices.map((device) => device.deviceId));

  return selectedTargetDeviceIds.filter((deviceId) => !availableDeviceIds.has(deviceId));
}

export function removeIds(values: string[], valuesToRemove: string[]): string[] {
  const valuesToRemoveSet = new Set(valuesToRemove);

  return values.filter((value) => !valuesToRemoveSet.has(value));
}
