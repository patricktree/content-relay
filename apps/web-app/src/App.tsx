import { styled } from "@linaria/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import React from "react";

import { rpcClient, parseOkResponse } from "@content-relay/client";
import type { DeviceSummary } from "@content-relay/shared";
import { isValidAbsoluteUrl } from "@content-relay/shared";

import { addAndroidShareListener, consumePendingAndroidShare } from "#pkg/android-share.ts";
import type { ShareDraft } from "#pkg/share-draft.ts";

type SendItemType = "text" | "url";

type AuthenticatedProfile = {
  authToken: string;
  deviceId: string;
  serverBaseUrl: string;
};

type SendItemInput = {
  itemType: SendItemType;
  profile: AuthenticatedProfile;
  targetDeviceIds: string[];
  title: string;
  value: string;
};

type StoredDraft = {
  authToken: string;
  deviceId: string;
  manualTargetDeviceIds: string;
  selectedTargetDeviceIds: string[];
  serverBaseUrl: string;
  title: string;
  value: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "loading"; message: string }
  | { kind: "error"; message: string }
  | { kind: "success"; message: string };

const STORAGE_KEY = "content-relay.mobile-app.send-draft";

const DEFAULT_DRAFT: StoredDraft = {
  authToken: "",
  deviceId: "",
  manualTargetDeviceIds: "",
  selectedTargetDeviceIds: [],
  serverBaseUrl: "",
  title: "",
  value: "",
};

const mobileAppQueryKeys = {
  availableDevices: (profile: AuthenticatedProfile) => ["devices", "available", profile] as const,
};

export function App(): React.JSX.Element {
  const [draft, setDraft] = React.useState<StoredDraft>(readStoredDraft);
  const [itemType, setItemType] = React.useState<SendItemType>("text");
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });
  const lastHandledShareDraftKey = React.useRef<string | null>(null);

  const targetDeviceIds = Array.from(
    new Set([
      ...draft.selectedTargetDeviceIds,
      ...parseManualTargetDeviceIds(draft.manualTargetDeviceIds),
    ]),
  );

  const profile: AuthenticatedProfile = {
    authToken: draft.authToken.trim(),
    deviceId: draft.deviceId.trim(),
    serverBaseUrl: trimTrailingSlash(draft.serverBaseUrl),
  };

  const devicesQuery = useQuery({
    enabled: false,
    queryFn: async () => fetchAvailableDevices(profile),
    queryKey: mobileAppQueryKeys.availableDevices(profile),
  });
  const sendItemMutation = useMutation({
    mutationFn: sendItem,
  });
  const devices = devicesQuery.data ?? [];

  React.useEffect(() => {
    let isDisposed = false;
    let listenerHandle: { remove: () => Promise<void> } | null = null;

    function applyShareDraft(shareDraft: ShareDraft): void {
      if (lastHandledShareDraftKey.current === shareDraft.dedupeKey) {
        return;
      }

      lastHandledShareDraftKey.current = shareDraft.dedupeKey;
      setItemType(shareDraft.itemType);
      updateDraft(setDraft, {
        title: shareDraft.title,
        value: shareDraft.value,
      });
      setStatus({
        kind: "success",
        message:
          shareDraft.itemType === "url"
            ? "Imported shared URL from Android."
            : "Imported shared text from Android.",
      });
    }

    async function initializeAndroidShare(): Promise<void> {
      listenerHandle = await addAndroidShareListener((shareDraft) => {
        if (isDisposed) {
          return;
        }

        applyShareDraft(shareDraft);
      });

      const pendingShareDraft = await consumePendingAndroidShare();

      if (isDisposed || pendingShareDraft === null) {
        return;
      }

      applyShareDraft(pendingShareDraft);
    }

    void initializeAndroidShare().catch((error: unknown) => {
      console.error("Failed to initialize Android share bridge.", error);
    });

    return () => {
      isDisposed = true;

      if (listenerHandle !== null) {
        void listenerHandle.remove();
      }
    };
  }, []);

  async function handleRefreshDevices(): Promise<void> {
    try {
      setStatus({ kind: "loading", message: "Loading devices…" });

      const result = await devicesQuery.refetch();

      if (result.error !== null) {
        throw result.error;
      }

      const availableDevices = result.data ?? [];

      setStatus({ kind: "success", message: `Loaded ${availableDevices.length} devices.` });
    } catch (error) {
      setStatus({ kind: "error", message: formatErrorMessage(error) });
    }
  }

  async function handleSend(): Promise<void> {
    try {
      if (targetDeviceIds.length === 0) {
        throw new Error("Choose at least one target device.");
      }

      const trimmedValue = draft.value.trim();

      if (itemType === "text" && trimmedValue.length === 0) {
        throw new Error("Enter the text to send.");
      }

      if (itemType === "url" && !isValidAbsoluteUrl(trimmedValue)) {
        throw new Error("Enter a valid absolute URL.");
      }

      setStatus({
        kind: "loading",
        message: itemType === "text" ? "Sending text…" : "Sending URL…",
      });

      const response = await sendItemMutation.mutateAsync({
        itemType,
        profile,
        targetDeviceIds,
        title: draft.title,
        value: draft.value,
      });

      setStatus({
        kind: "success",
        message: formatSendSuccessMessage(
          itemType,
          response.item.itemId,
          response.deliveries.length,
        ),
      });
    } catch (error) {
      setStatus({ kind: "error", message: formatErrorMessage(error) });
    }
  }

  return (
    <Page>
      <Shell>
        <Header>
          <Eyebrow>Content Relay</Eyebrow>
          <Title>Send</Title>
          <Subtitle>
            Configure this device, confirm targets, and send text or URLs from the app or the
            Android share sheet.
          </Subtitle>
        </Header>

        <Card>
          <SectionTitle>Authentication</SectionTitle>
          <Field>
            <Label htmlFor="server-base-url">Server URL</Label>
            <Input
              id="server-base-url"
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="url"
              onChange={(event) => updateDraft(setDraft, { serverBaseUrl: event.target.value })}
              placeholder="https://relay.example.com"
              spellCheck={false}
              value={draft.serverBaseUrl}
            />
          </Field>
          <Field>
            <Label htmlFor="device-id">Device ID</Label>
            <Input
              id="device-id"
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(event) => updateDraft(setDraft, { deviceId: event.target.value })}
              placeholder="device_123"
              spellCheck={false}
              value={draft.deviceId}
            />
          </Field>
          <Field>
            <Label htmlFor="auth-token">Auth token</Label>
            <TextArea
              id="auth-token"
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(event) => updateDraft(setDraft, { authToken: event.target.value })}
              placeholder="Paste the auth token for this device"
              rows={3}
              spellCheck={false}
              value={draft.authToken}
            />
          </Field>
          <Row>
            <SecondaryButton
              disabled={devicesQuery.isFetching}
              onClick={() => void handleRefreshDevices()}
            >
              {devicesQuery.isFetching ? "Loading…" : "Load devices"}
            </SecondaryButton>
          </Row>
        </Card>

        <Card>
          <SectionTitle>Targets</SectionTitle>
          {devices.length > 0 ? (
            <DeviceList>
              {devices.map((device) => {
                const isSelected = draft.selectedTargetDeviceIds.includes(device.deviceId);

                return (
                  <DeviceRow key={device.deviceId}>
                    <Checkbox
                      checked={isSelected}
                      onChange={(event) => {
                        updateDraft(setDraft, {
                          selectedTargetDeviceIds: toggleId(
                            draft.selectedTargetDeviceIds,
                            device.deviceId,
                            event.target.checked,
                          ),
                        });
                      }}
                      type="checkbox"
                    />
                    <DeviceMeta>
                      <DeviceName>{device.nickname}</DeviceName>
                      <DeviceDetails>
                        {device.platform} · {device.deviceId}
                      </DeviceDetails>
                    </DeviceMeta>
                  </DeviceRow>
                );
              })}
            </DeviceList>
          ) : (
            <Hint>No device list loaded yet. You can still paste target IDs manually.</Hint>
          )}
          <Field>
            <Label htmlFor="manual-target-device-ids">Manual target IDs</Label>
            <TextArea
              id="manual-target-device-ids"
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(event) =>
                updateDraft(setDraft, { manualTargetDeviceIds: event.target.value })
              }
              placeholder="One device ID per line, or separate them with commas"
              rows={4}
              spellCheck={false}
              value={draft.manualTargetDeviceIds}
            />
          </Field>
          <Hint>{targetDeviceIds.length} target device(s) selected.</Hint>
        </Card>

        <Card>
          <SectionTitle>Compose</SectionTitle>
          <Tabs>
            <TabButton
              $active={itemType === "text"}
              onClick={() => setItemType("text")}
              type="button"
            >
              Text
            </TabButton>
            <TabButton
              $active={itemType === "url"}
              onClick={() => setItemType("url")}
              type="button"
            >
              URL
            </TabButton>
          </Tabs>
          <Field>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              onChange={(event) => updateDraft(setDraft, { title: event.target.value })}
              placeholder="Optional title"
              value={draft.title}
            />
          </Field>
          <Field>
            <Label htmlFor="value">{itemType === "text" ? "Text" : "URL"}</Label>
            <TextArea
              id="value"
              autoCapitalize={itemType === "url" ? "none" : "sentences"}
              autoCorrect={itemType === "url" ? "off" : "on"}
              inputMode={itemType === "url" ? "url" : "text"}
              onChange={(event) => updateDraft(setDraft, { value: event.target.value })}
              placeholder={
                itemType === "text" ? "What do you want to send?" : "https://example.com"
              }
              rows={6}
              spellCheck={itemType === "text"}
              value={draft.value}
            />
          </Field>
          <PrimaryButton disabled={sendItemMutation.isPending} onClick={() => void handleSend()}>
            {sendItemMutation.isPending ? "Sending…" : `Send ${itemType}`}
          </PrimaryButton>
        </Card>

        <StatusCard $kind={status.kind}>
          {status.kind === "idle" ? "Ready." : status.message}
        </StatusCard>
      </Shell>
    </Page>
  );
}

async function fetchAvailableDevices(profile: AuthenticatedProfile): Promise<DeviceSummary[]> {
  const devices = await parseOkResponse(rpcClient.listDevices(profile));

  return devices.filter((device) => device.deviceId !== profile.deviceId);
}

async function sendItem(input: SendItemInput) {
  if (input.targetDeviceIds.length === 0) {
    throw new Error("Choose at least one target device.");
  }

  const trimmedTitle = input.title.trim();
  const trimmedValue = input.value.trim();

  if (input.itemType === "text") {
    if (trimmedValue.length === 0) {
      throw new Error("Enter the text to send.");
    }

    return parseOkResponse(
      rpcClient.sendText(input.profile, {
        text: trimmedValue,
        targetDeviceIds: input.targetDeviceIds,
        ...(trimmedTitle.length > 0 ? { title: trimmedTitle } : {}),
      }),
    );
  }

  if (!isValidAbsoluteUrl(trimmedValue)) {
    throw new Error("Enter a valid absolute URL.");
  }

  return parseOkResponse(
    rpcClient.sendUrl(input.profile, {
      url: trimmedValue,
      targetDeviceIds: input.targetDeviceIds,
      ...(trimmedTitle.length > 0 ? { title: trimmedTitle } : {}),
    }),
  );
}

function formatSendSuccessMessage(
  itemType: SendItemType,
  itemId: string,
  deliveryCount: number,
): string {
  if (itemType === "text") {
    return `Sent text item ${itemId} to ${deliveryCount} device(s).`;
  }

  return `Sent URL item ${itemId} to ${deliveryCount} device(s).`;
}

function readStoredDraft(): StoredDraft {
  if (typeof window === "undefined") {
    return DEFAULT_DRAFT;
  }

  const savedDraft = window.localStorage.getItem(STORAGE_KEY);

  if (savedDraft === null) {
    return DEFAULT_DRAFT;
  }

  try {
    const parsed = JSON.parse(savedDraft) as Partial<StoredDraft>;

    return {
      authToken: parsed.authToken ?? DEFAULT_DRAFT.authToken,
      deviceId: parsed.deviceId ?? DEFAULT_DRAFT.deviceId,
      manualTargetDeviceIds: parsed.manualTargetDeviceIds ?? DEFAULT_DRAFT.manualTargetDeviceIds,
      selectedTargetDeviceIds:
        parsed.selectedTargetDeviceIds ?? DEFAULT_DRAFT.selectedTargetDeviceIds,
      serverBaseUrl: parsed.serverBaseUrl ?? DEFAULT_DRAFT.serverBaseUrl,
      title: parsed.title ?? DEFAULT_DRAFT.title,
      value: parsed.value ?? DEFAULT_DRAFT.value,
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

function updateDraft(
  setDraft: React.Dispatch<React.SetStateAction<StoredDraft>>,
  patch: Partial<StoredDraft>,
): void {
  setDraft((currentDraft) => {
    const nextDraft = { ...currentDraft, ...patch };
    persistDraft(nextDraft);

    return nextDraft;
  });
}

function persistDraft(draft: StoredDraft): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

function parseManualTargetDeviceIds(value: string): string[] {
  return value
    .split(/[\n,]/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function toggleId(values: string[], value: string, shouldInclude: boolean): string[] {
  if (shouldInclude) {
    return Array.from(new Set([...values, value]));
  }

  return values.filter((entry) => entry !== value);
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/$/, "");
}

function formatErrorMessage(error: unknown): string {
  if (isDetailedError(error)) {
    const detailData =
      typeof error.detail === "object" && error.detail !== null && "data" in error.detail
        ? error.detail.data
        : undefined;

    if (typeof detailData === "string") {
      return detailData;
    }

    if (
      detailData !== null &&
      typeof detailData === "object" &&
      "error" in detailData &&
      typeof detailData.error === "string"
    ) {
      return detailData.error;
    }

    return `Request failed with status ${error.statusCode}.`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return `Unexpected error: ${String(error)}`;
}

function isDetailedError(error: unknown): error is {
  detail?: unknown;
  statusCode: number;
} {
  return (
    error !== null &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  );
}

const Page = styled.main`
  min-height: 100vh;
  padding: 24px 20px 40px;
  background: #f5f5f2;
  color: #111111;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
`;

const Shell = styled.div`
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  display: grid;
  gap: 24px;
`;

const Header = styled.header`
  display: grid;
  gap: 6px;
  padding: 0 2px;
`;

const Eyebrow = styled.p`
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #555555;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 32px;
  line-height: 1.05;
  letter-spacing: -0.03em;
`;

const Subtitle = styled.p`
  margin: 0;
  max-width: 34ch;
  color: #444444;
  line-height: 1.5;
`;

const Card = styled.section`
  display: grid;
  gap: 16px;
  padding: 0 0 20px;
  border-bottom: 1px solid #1a1a1a;
`;

const SectionTitle = styled.h2`
  margin: 0;
  font-size: 18px;
  line-height: 1.2;
`;

const Field = styled.div`
  display: grid;
  gap: 8px;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 600;
`;

const Input = styled.input`
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #1a1a1a;
  border-radius: 0;
  background: #ffffff;
  color: inherit;
  font: inherit;
  box-sizing: border-box;

  &::placeholder {
    color: #767676;
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #1a1a1a;
  border-radius: 0;
  background: #ffffff;
  color: inherit;
  font: inherit;
  box-sizing: border-box;
  resize: vertical;

  &::placeholder {
    color: #767676;
  }
`;

const Row = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
`;

const buttonStyles = `
  min-height: 44px;
  padding: 12px 16px;
  border: 1px solid #111111;
  border-radius: 0;
  font: inherit;
  font-weight: 700;
`;

const PrimaryButton = styled.button`
  ${buttonStyles}
  background: #111111;
  color: #ffffff;
`;

const SecondaryButton = styled.button`
  ${buttonStyles}
  background: #ffffff;
  color: #111111;
`;

const Tabs = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
`;

type TabButtonProps = {
  $active: boolean;
};

const TabButton = styled.button<TabButtonProps>`
  ${buttonStyles}
  background: ${(props) => (props.$active ? "#111111" : "#ffffff")};
  color: ${(props) => (props.$active ? "#ffffff" : "#111111")};
`;

const DeviceList = styled.div`
  display: grid;
  gap: 8px;
`;

const DeviceRow = styled.label`
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 14px;
  border: 1px solid #1a1a1a;
  background: #ffffff;
`;

const Checkbox = styled.input`
  width: 18px;
  height: 18px;
  margin-top: 2px;
  accent-color: #111111;
`;

const DeviceMeta = styled.span`
  display: grid;
  gap: 4px;
`;

const DeviceName = styled.span`
  font-weight: 600;
`;

const DeviceDetails = styled.span`
  font-size: 14px;
  color: #555555;
  word-break: break-all;
`;

const Hint = styled.p`
  margin: 0;
  font-size: 14px;
  color: #555555;
  line-height: 1.5;
`;

const StatusCard = styled.output<{ $kind: Status["kind"] }>`
  display: block;
  padding: 14px 16px;
  border: 1px solid #111111;
  background: ${(props) => (props.$kind === "idle" ? "#ffffff" : "#111111")};
  color: ${(props) => (props.$kind === "idle" ? "#111111" : "#ffffff")};
  line-height: 1.5;
  word-break: break-word;
`;
