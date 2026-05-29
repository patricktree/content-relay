import z from "zod";

export const settingsSchema = z.object({
  relayHubUrl: z.url().trim(),
  deviceNickname: z.string(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const settingsStorage = { load, store };

const LOCAL_STORAGE_KEY = "settings";

function load(): Settings | null {
  const keyValue = localStorage.getItem(LOCAL_STORAGE_KEY);

  if (!keyValue) {
    return null;
  }

  const parsed = settingsSchema.parse(JSON.parse(keyValue));
  return parsed;
}

function store(settings: Settings) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
}
