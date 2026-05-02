import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Temporal } from "temporal-polyfill";

import type { DevicePlatform, RegisterDeviceResponse } from "@content-relay/shared";

const PROFILES_FILE_NAME = "profiles.json";

type PersistedProfiles = {
  activeProfileId: string | null;
  profiles: LocalDeviceProfile[];
};

export type LocalDeviceProfile = {
  profileId: string;
  serverBaseUrl: string;
  deviceId: string;
  nickname: string;
  platform: DevicePlatform;
  lastUsedTargetDeviceIds: string[];
  handledDeliveryIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateLocalProfileInput = RegisterDeviceResponse & {
  profileId?: string;
};

export class LocalDeviceProfileStore {
  readonly #configDirectory: string;

  constructor(configDirectory?: string) {
    this.#configDirectory = configDirectory ?? path.join(os.homedir(), ".content-relay");
  }

  get configDirectory(): string {
    return this.#configDirectory;
  }

  async listProfiles(): Promise<LocalDeviceProfile[]> {
    const state = await this.#readState();

    return [...state.profiles].sort((left, right) => left.nickname.localeCompare(right.nickname));
  }

  async getProfileByIdOrName(profileIdOrName: string): Promise<LocalDeviceProfile | null> {
    const state = await this.#readState();

    return (
      state.profiles.find((profile) => profile.profileId === profileIdOrName) ??
      state.profiles.find((profile) => profile.deviceId === profileIdOrName) ??
      state.profiles.find((profile) => profile.nickname === profileIdOrName) ??
      null
    );
  }

  async getActiveProfile(): Promise<LocalDeviceProfile | null> {
    const state = await this.#readState();

    if (state.activeProfileId === null) {
      return null;
    }

    return state.profiles.find((profile) => profile.profileId === state.activeProfileId) ?? null;
  }

  async requireActiveProfile(): Promise<LocalDeviceProfile> {
    const profile = await this.getActiveProfile();

    if (profile === null) {
      throw new Error(
        "No active device profile configured. Use `relay device register ...` or `relay device use <device>`.",
      );
    }

    return profile;
  }

  async createProfile(
    input: CreateLocalProfileInput,
    options?: { makeActive?: boolean },
  ): Promise<LocalDeviceProfile> {
    const state = await this.#readState();
    const now = Temporal.Now.instant().toString();
    const nextProfile: LocalDeviceProfile = {
      profileId: input.profileId ?? input.deviceId,
      serverBaseUrl: normalizeServerBaseUrl(input.serverBaseUrl),
      deviceId: input.deviceId,
      nickname: input.nickname,
      platform: input.platform,
      lastUsedTargetDeviceIds: [],
      handledDeliveryIds: [],
      createdAt: now,
      updatedAt: now,
    };

    const nextProfiles = state.profiles.filter(
      (profile) => profile.profileId !== nextProfile.profileId,
    );
    nextProfiles.push(nextProfile);

    const nextState: PersistedProfiles = {
      activeProfileId:
        (options?.makeActive ?? true) ? nextProfile.profileId : state.activeProfileId,
      profiles: nextProfiles,
    };

    await this.#writeState(nextState);

    return nextProfile;
  }

  async updateProfile(
    profileId: string,
    mutate: (profile: LocalDeviceProfile) => LocalDeviceProfile,
  ): Promise<LocalDeviceProfile> {
    const state = await this.#readState();
    const index = state.profiles.findIndex((profile) => profile.profileId === profileId);

    if (index === -1) {
      throw new Error(`Unknown local device profile: ${profileId}`);
    }

    const currentProfile = state.profiles[index];
    if (currentProfile === undefined) {
      throw new Error(`Profile index resolved but no profile exists: ${profileId}`);
    }

    const updatedProfile = {
      ...mutate(currentProfile),
      updatedAt: Temporal.Now.instant().toString(),
    };

    state.profiles[index] = updatedProfile;
    await this.#writeState(state);

    return updatedProfile;
  }

  async setActiveProfile(profileId: string): Promise<void> {
    const state = await this.#readState();
    const profile = state.profiles.find((entry) => entry.profileId === profileId);

    if (profile === undefined) {
      throw new Error(`Unknown local device profile: ${profileId}`);
    }

    state.activeProfileId = profile.profileId;
    await this.#writeState(state);
  }

  async removeProfile(profileId: string): Promise<void> {
    const state = await this.#readState();
    const nextProfiles = state.profiles.filter((profile) => profile.profileId !== profileId);

    if (nextProfiles.length === state.profiles.length) {
      throw new Error(`Unknown local device profile: ${profileId}`);
    }

    state.profiles = nextProfiles;
    if (state.activeProfileId === profileId) {
      state.activeProfileId = nextProfiles[0]?.profileId ?? null;
    }

    await this.#writeState(state);
  }

  async clear(): Promise<void> {
    await fs.promises.rm(this.#profilesFilePath(), { force: true });
  }

  async rememberTargets(profileId: string, targetDeviceIds: string[]): Promise<void> {
    await this.updateProfile(profileId, (profile) => ({
      ...profile,
      lastUsedTargetDeviceIds: [...new Set(targetDeviceIds)],
    }));
  }

  async recordHandledDelivery(profileId: string, deliveryId: string): Promise<LocalDeviceProfile> {
    return await this.updateProfile(profileId, (profile) => ({
      ...profile,
      handledDeliveryIds: appendUniqueWithCap(profile.handledDeliveryIds, deliveryId, 5000),
    }));
  }

  async hasHandledDelivery(profileId: string, deliveryId: string): Promise<boolean> {
    const profile = await this.getProfileByIdOrName(profileId);

    if (profile === null) {
      throw new Error(`Unknown local device profile: ${profileId}`);
    }

    return profile.handledDeliveryIds.includes(deliveryId);
  }

  async renameProfile(profileId: string, nickname: string): Promise<LocalDeviceProfile> {
    return await this.updateProfile(profileId, (profile) => ({
      ...profile,
      nickname,
    }));
  }

  async resolveProfile(profileIdOrName: string | undefined): Promise<LocalDeviceProfile> {
    if (profileIdOrName === undefined) {
      return await this.requireActiveProfile();
    }

    const profile = await this.getProfileByIdOrName(profileIdOrName);

    if (profile === null) {
      throw new Error(
        `Unknown local device profile: ${profileIdOrName}. Use \`relay device list\` to inspect configured profiles.`,
      );
    }

    return profile;
  }

  async resolveTargetDeviceIds(
    profileId: string,
    explicitTargetDeviceIds: string[] | undefined,
  ): Promise<string[]> {
    if (explicitTargetDeviceIds !== undefined && explicitTargetDeviceIds.length > 0) {
      return [...new Set(explicitTargetDeviceIds)];
    }

    const profile = await this.getProfileByIdOrName(profileId);

    if (profile === null) {
      throw new Error(`Unknown local device profile: ${profileId}`);
    }

    if (profile.lastUsedTargetDeviceIds.length === 0) {
      throw new Error(
        "No target devices provided and this profile has no last-used targets. Use `--to <device>...`.",
      );
    }

    return profile.lastUsedTargetDeviceIds;
  }

  async replaceProfileFromRegistration(
    profileId: string,
    registration: RegisterDeviceResponse,
  ): Promise<LocalDeviceProfile> {
    return await this.updateProfile(profileId, (profile) => ({
      ...profile,
      serverBaseUrl: normalizeServerBaseUrl(registration.serverBaseUrl),
      deviceId: registration.deviceId,
      nickname: registration.nickname,
      platform: registration.platform,
    }));
  }

  async #readState(): Promise<PersistedProfiles> {
    await fs.promises.mkdir(this.#configDirectory, { recursive: true });

    try {
      const content = await fs.promises.readFile(this.#profilesFilePath(), "utf8");
      const parsed = JSON.parse(content) as PersistedProfiles;

      return {
        activeProfileId: parsed.activeProfileId ?? null,
        profiles: parsed.profiles ?? [],
      };
    } catch (error) {
      if (isMissingFileError(error)) {
        return { activeProfileId: null, profiles: [] };
      }

      throw error;
    }
  }

  async #writeState(state: PersistedProfiles): Promise<void> {
    await fs.promises.mkdir(this.#configDirectory, { recursive: true });
    await fs.promises.writeFile(
      this.#profilesFilePath(),
      `${JSON.stringify(state, null, 2)}\n`,
      "utf8",
    );
  }

  #profilesFilePath(): string {
    return path.join(this.#configDirectory, PROFILES_FILE_NAME);
  }
}

function appendUniqueWithCap(values: string[], nextValue: string, cap: number): string[] {
  const withoutNextValue = values.filter((value) => value !== nextValue);
  withoutNextValue.push(nextValue);

  if (withoutNextValue.length <= cap) {
    return withoutNextValue;
  }

  return withoutNextValue.slice(withoutNextValue.length - cap);
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function normalizeServerBaseUrl(serverBaseUrl: string): string {
  return serverBaseUrl.replace(/\/$/, "");
}
