import { styled } from "@linaria/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import React from "react";

import { isParseResponseError, parseOkResponse, rpcClient } from "@content-relay/client";
import type { DeviceSummary } from "@content-relay/contracts";

import {
  addAndroidShareListener,
  closeAndroidShareOverlay,
  completeAndroidShareOverlay,
  consumePendingAndroidShare,
} from "#pkg/android-share.ts";
import type { ShareDraft } from "#pkg/share-draft.ts";
import {
  getUnavailableSelectedTargetDeviceIds,
  mergeTargetDeviceIds,
  removeIds,
  toggleId,
} from "#pkg/target-devices.ts";
import {
  formatSendSuccessMessage,
  sendItem,
  type RegisteredDeviceProfile,
  type SendItemType,
} from "#pkg/use-cases/send-item.ts";

type StoredDraft = {
  deviceId: string;
  manualTargetDeviceIds: string;
  selectedTargetDeviceIds: string[];
  relayHubBaseUrl: string;
  title: string;
  value: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "loading"; message: string }
  | { kind: "error"; message: string }
  | { kind: "success"; message: string };

const STORAGE_KEY = "content-relay.mobile-app.send-draft";
const SHARE_SUCCESS_MESSAGE = "Sent successfully";

const DEFAULT_DRAFT: StoredDraft = {
  deviceId: "",
  manualTargetDeviceIds: "",
  selectedTargetDeviceIds: [],
  relayHubBaseUrl: "",
  title: "",
  value: "",
};

const mobileAppQueryKeys = {
  availableDevices: (profile: RegisteredDeviceProfile) =>
    ["devices", "available", profile] as const,
};

export function App(): React.JSX.Element {
  const [draft, setDraft] = React.useState<StoredDraft>(readStoredDraft);
  const [itemType, setItemType] = React.useState<SendItemType>("text");
  const [shareOverlayDraft, setShareOverlayDraft] = React.useState<ShareDraft | null>(null);
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });
  const lastHandledShareDraftKey = React.useRef<string | null>(null);

  const targetDeviceIds = mergeTargetDeviceIds(
    draft.selectedTargetDeviceIds,
    draft.manualTargetDeviceIds,
  );
  const profile: RegisteredDeviceProfile = {
    deviceId: draft.deviceId.trim(),
    relayHubBaseUrl: trimTrailingSlash(draft.relayHubBaseUrl),
  };

  const devicesQuery = useQuery({
    enabled: false,
    queryFn: async () => fetchAvailableDevices(profile),
    queryKey: mobileAppQueryKeys.availableDevices(profile),
  });
  const sendItemMutation = useMutation({ mutationFn: sendItem });
  const devices = devicesQuery.data ?? [];

  React.useEffect(() => {
    let isDisposed = false;
    let listenerHandle: { remove: () => Promise<void> } | null = null;

    function applyShareDraft(nextShareDraft: ShareDraft): void {
      if (lastHandledShareDraftKey.current === nextShareDraft.dedupeKey) {
        return;
      }

      lastHandledShareDraftKey.current = nextShareDraft.dedupeKey;
      setShareOverlayDraft(nextShareDraft);
      setItemType(nextShareDraft.itemType);
      updateDraft(setDraft, {
        title: nextShareDraft.title,
        value: nextShareDraft.value,
      });
      setStatus({ kind: "idle" });
    }

    async function initializeAndroidShare(): Promise<void> {
      listenerHandle = await addAndroidShareListener((nextShareDraft) => {
        if (isDisposed) {
          return;
        }

        applyShareDraft(nextShareDraft);
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

  React.useEffect(() => {
    if (
      shareOverlayDraft === null ||
      !hasCompleteProfile(profile) ||
      devicesQuery.data !== undefined
    ) {
      return;
    }

    void handleRefreshDevices();
  }, [shareOverlayDraft, profile.deviceId, profile.relayHubBaseUrl, devicesQuery.data]);

  React.useEffect(() => {
    if (shareOverlayDraft === null || typeof document === "undefined") {
      return;
    }

    const rootElement = document.getElementById("root");
    const previousDocumentBackground = document.documentElement.style.background;
    const previousBodyBackground = document.body.style.background;
    const previousRootBackground = rootElement?.style.background;

    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";

    if (rootElement !== null) {
      rootElement.style.background = "transparent";
    }

    return () => {
      document.documentElement.style.background = previousDocumentBackground;
      document.body.style.background = previousBodyBackground;

      if (rootElement !== null && previousRootBackground !== undefined) {
        rootElement.style.background = previousRootBackground;
      }
    };
  }, [shareOverlayDraft]);

  async function handleRefreshDevices(): Promise<void> {
    try {
      setStatus({ kind: "loading", message: "Loading devices…" });

      const result = await devicesQuery.refetch();

      if (result.error !== null) {
        throw result.error;
      }

      const availableDevices = result.data ?? [];
      const removedSelectedDeviceIds = getUnavailableSelectedTargetDeviceIds(
        draft.selectedTargetDeviceIds,
        availableDevices,
      );

      if (removedSelectedDeviceIds.length > 0) {
        updateDraft(setDraft, {
          selectedTargetDeviceIds: removeIds(
            draft.selectedTargetDeviceIds,
            removedSelectedDeviceIds,
          ),
        });
      }

      setStatus({ kind: "success", message: `Loaded ${availableDevices.length} devices.` });
    } catch (error) {
      setStatus({ kind: "error", message: formatErrorMessage(error) });
    }
  }

  async function handleSend(input: {
    targetDeviceIds: string[];
    isShareOverlay: boolean;
  }): Promise<void> {
    try {
      setStatus({
        kind: "loading",
        message: itemType === "text" ? "Sending text…" : "Sending URL…",
      });

      const response = await sendItemMutation.mutateAsync({
        itemType,
        profile,
        targetDeviceIds: input.targetDeviceIds,
        title: draft.title,
        value: draft.value,
      });

      if (input.isShareOverlay) {
        setStatus({ kind: "success", message: SHARE_SUCCESS_MESSAGE });
        await completeAndroidShareOverlay({ message: SHARE_SUCCESS_MESSAGE });
        return;
      }

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

  if (shareOverlayDraft !== null) {
    return (
      <ShareOverlay
        devices={devices}
        draft={draft}
        isLoadingDevices={devicesQuery.isFetching}
        isSending={sendItemMutation.isPending}
        itemType={itemType}
        onClose={() => void closeAndroidShareOverlay()}
        onOpenSetup={() => setShareOverlayDraft(null)}
        onRefreshDevices={() => void handleRefreshDevices()}
        onSend={() =>
          void handleSend({ targetDeviceIds: draft.selectedTargetDeviceIds, isShareOverlay: true })
        }
        onToggleDevice={(deviceId, shouldInclude) =>
          updateDraft(setDraft, {
            selectedTargetDeviceIds: toggleId(
              draft.selectedTargetDeviceIds,
              deviceId,
              shouldInclude,
            ),
          })
        }
        profile={profile}
        status={status}
      />
    );
  }

  return (
    <SendPage
      devices={devices}
      draft={draft}
      isLoadingDevices={devicesQuery.isFetching}
      isSending={sendItemMutation.isPending}
      itemType={itemType}
      onRefreshDevices={() => void handleRefreshDevices()}
      onSend={() => void handleSend({ targetDeviceIds, isShareOverlay: false })}
      onSetItemType={setItemType}
      onUpdateDraft={(patch) => updateDraft(setDraft, patch)}
      status={status}
      targetDeviceCount={targetDeviceIds.length}
    />
  );
}

function SendPage(props: {
  devices: DeviceSummary[];
  draft: StoredDraft;
  isLoadingDevices: boolean;
  isSending: boolean;
  itemType: SendItemType;
  onRefreshDevices: () => void;
  onSend: () => void;
  onSetItemType: (itemType: SendItemType) => void;
  onUpdateDraft: (patch: Partial<StoredDraft>) => void;
  status: Status;
  targetDeviceCount: number;
}): React.JSX.Element {
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
          <SectionTitle>Device setup</SectionTitle>
          <Field>
            <Label htmlFor="relay-hub-base-url">Relay Hub URL</Label>
            <Input
              id="relay-hub-base-url"
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="url"
              onChange={(event) => props.onUpdateDraft({ relayHubBaseUrl: event.target.value })}
              placeholder="https://relay.example.com"
              spellCheck={false}
              value={props.draft.relayHubBaseUrl}
            />
          </Field>
          <Field>
            <Label htmlFor="device-id">Device ID</Label>
            <Input
              id="device-id"
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(event) => props.onUpdateDraft({ deviceId: event.target.value })}
              placeholder="device_123"
              spellCheck={false}
              value={props.draft.deviceId}
            />
          </Field>
          <Row>
            <SecondaryButton disabled={props.isLoadingDevices} onClick={props.onRefreshDevices}>
              {props.isLoadingDevices ? "Loading…" : "Load devices"}
            </SecondaryButton>
          </Row>
        </Card>

        <Card>
          <SectionTitle>Targets</SectionTitle>
          {props.devices.length > 0 ? (
            <DeviceList>
              {props.devices.map((device) => {
                const isSelected = props.draft.selectedTargetDeviceIds.includes(device.deviceId);

                return (
                  <DeviceRow key={device.deviceId}>
                    <Checkbox
                      checked={isSelected}
                      onChange={(event) => {
                        props.onUpdateDraft({
                          selectedTargetDeviceIds: toggleId(
                            props.draft.selectedTargetDeviceIds,
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
                props.onUpdateDraft({ manualTargetDeviceIds: event.target.value })
              }
              placeholder="One device ID per line, or separate them with commas"
              rows={4}
              spellCheck={false}
              value={props.draft.manualTargetDeviceIds}
            />
          </Field>
          <Hint>{props.targetDeviceCount} target device(s) selected.</Hint>
        </Card>

        <ComposeCard
          draft={props.draft}
          isSending={props.isSending}
          itemType={props.itemType}
          onSend={props.onSend}
          onSetItemType={props.onSetItemType}
          onUpdateDraft={props.onUpdateDraft}
        />

        <StatusCard $kind={props.status.kind}>
          {props.status.kind === "idle" ? "Ready." : props.status.message}
        </StatusCard>
      </Shell>
    </Page>
  );
}

function ComposeCard(props: {
  draft: StoredDraft;
  isSending: boolean;
  itemType: SendItemType;
  onSend: () => void;
  onSetItemType: (itemType: SendItemType) => void;
  onUpdateDraft: (patch: Partial<StoredDraft>) => void;
}): React.JSX.Element {
  return (
    <Card>
      <SectionTitle>Compose</SectionTitle>
      <Tabs>
        <TabButton
          $active={props.itemType === "text"}
          onClick={() => props.onSetItemType("text")}
          type="button"
        >
          Text
        </TabButton>
        <TabButton
          $active={props.itemType === "url"}
          onClick={() => props.onSetItemType("url")}
          type="button"
        >
          URL
        </TabButton>
      </Tabs>
      <Field>
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          onChange={(event) => props.onUpdateDraft({ title: event.target.value })}
          placeholder="Optional title"
          value={props.draft.title}
        />
      </Field>
      <Field>
        <Label htmlFor="value">{props.itemType === "text" ? "Text" : "URL"}</Label>
        <TextArea
          id="value"
          autoCapitalize={props.itemType === "url" ? "none" : "sentences"}
          autoCorrect={props.itemType === "url" ? "off" : "on"}
          inputMode={props.itemType === "url" ? "url" : "text"}
          onChange={(event) => props.onUpdateDraft({ value: event.target.value })}
          placeholder={
            props.itemType === "text" ? "What do you want to send?" : "https://example.com"
          }
          rows={6}
          spellCheck={props.itemType === "text"}
          value={props.draft.value}
        />
      </Field>
      <PrimaryButton disabled={props.isSending} onClick={props.onSend}>
        {props.isSending ? "Sending…" : `Send ${props.itemType}`}
      </PrimaryButton>
    </Card>
  );
}

function ShareOverlay(props: {
  devices: DeviceSummary[];
  draft: StoredDraft;
  isLoadingDevices: boolean;
  isSending: boolean;
  itemType: SendItemType;
  onClose: () => void;
  onOpenSetup: () => void;
  onRefreshDevices: () => void;
  onSend: () => void;
  onToggleDevice: (deviceId: string, shouldInclude: boolean) => void;
  profile: RegisteredDeviceProfile;
  status: Status;
}): React.JSX.Element {
  const hasSetup = hasCompleteProfile(props.profile);
  const selectedCount = props.draft.selectedTargetDeviceIds.length;

  return (
    <OverlayPage>
      <OverlayPanel>
        <OverlayHeader>
          <CloseButton aria-label="Close share overlay" onClick={props.onClose} type="button">
            ×
          </CloseButton>
          <OverlayTitle>Share</OverlayTitle>
        </OverlayHeader>

        <OverlayBody>
          {!hasSetup ? (
            <OverlayState>
              <SectionTitle>Setup needed</SectionTitle>
              <Hint>Add a Relay Hub URL and Device ID before sending shared content.</Hint>
              <PrimaryButton onClick={props.onOpenSetup}>Open app setup</PrimaryButton>
            </OverlayState>
          ) : (
            <>
              <OverlaySection>
                <OverlaySectionHeader>
                  <SectionTitle>Send to</SectionTitle>
                  <SmallButton disabled={props.isLoadingDevices} onClick={props.onRefreshDevices}>
                    {props.isLoadingDevices ? "Loading…" : "Refresh"}
                  </SmallButton>
                </OverlaySectionHeader>
                {props.devices.length > 0 ? (
                  <TargetPicker>
                    {props.devices.map((device) => {
                      const isSelected = props.draft.selectedTargetDeviceIds.includes(
                        device.deviceId,
                      );

                      return (
                        <TargetChip key={device.deviceId} $selected={isSelected}>
                          <TargetCheckbox
                            aria-label={`Select ${device.nickname}`}
                            checked={isSelected}
                            onChange={(event) =>
                              props.onToggleDevice(device.deviceId, event.target.checked)
                            }
                            type="checkbox"
                          />
                          <TargetAvatar>{device.nickname.slice(0, 1).toUpperCase()}</TargetAvatar>
                          <TargetName>{device.nickname}</TargetName>
                        </TargetChip>
                      );
                    })}
                  </TargetPicker>
                ) : (
                  <Hint>
                    {props.isLoadingDevices
                      ? "Loading target devices…"
                      : "No target devices are available. Open the full app to finish setup."}
                  </Hint>
                )}
              </OverlaySection>

              <OverlaySection>
                <SectionTitle>
                  {props.itemType === "url" ? "URL preview" : "Text preview"}
                </SectionTitle>
                <PreviewCard>
                  {props.draft.title.trim().length > 0 ? (
                    <PreviewTitle>{props.draft.title}</PreviewTitle>
                  ) : null}
                  <PreviewValue>{props.draft.value}</PreviewValue>
                </PreviewCard>
              </OverlaySection>

              <PrimaryButton
                disabled={props.isSending || selectedCount === 0}
                onClick={props.onSend}
              >
                {props.isSending ? "Sending…" : "Send"}
              </PrimaryButton>
              <Hint>{selectedCount} target device(s) selected.</Hint>
            </>
          )}

          <StatusCard $kind={props.status.kind}>
            {props.status.kind === "idle" ? "Ready." : props.status.message}
          </StatusCard>
        </OverlayBody>
      </OverlayPanel>
    </OverlayPage>
  );
}

async function fetchAvailableDevices(profile: RegisteredDeviceProfile): Promise<DeviceSummary[]> {
  const devices = await parseOkResponse(rpcClient.listDevices(profile));

  return devices.filter((device) => device.deviceId !== profile.deviceId);
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
      deviceId: parsed.deviceId ?? DEFAULT_DRAFT.deviceId,
      manualTargetDeviceIds: parsed.manualTargetDeviceIds ?? DEFAULT_DRAFT.manualTargetDeviceIds,
      selectedTargetDeviceIds:
        parsed.selectedTargetDeviceIds ?? DEFAULT_DRAFT.selectedTargetDeviceIds,
      relayHubBaseUrl: parsed.relayHubBaseUrl ?? DEFAULT_DRAFT.relayHubBaseUrl,
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

function hasCompleteProfile(profile: RegisteredDeviceProfile): boolean {
  return profile.deviceId.trim().length > 0 && profile.relayHubBaseUrl.trim().length > 0;
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/$/, "");
}

function formatErrorMessage(error: unknown): string {
  if (isParseResponseError(error)) {
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

  &:disabled {
    opacity: 0.55;
  }
`;

const SecondaryButton = styled.button`
  ${buttonStyles}
  background: #ffffff;
  color: #111111;
`;

const SmallButton = styled.button`
  min-height: 36px;
  padding: 8px 12px;
  border: 1px solid #111111;
  border-radius: 999px;
  background: #ffffff;
  color: #111111;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
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

const OverlayPage = styled.main`
  box-sizing: border-box;
  display: grid;
  place-items: center;
  padding: 0;
  background: #f7f7f0;
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

const OverlayPanel = styled.section`
  width: min(100%, 430px);
  overflow: hidden;
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.38);
`;

const OverlayHeader = styled.header`
  display: grid;
  grid-template-columns: 48px 1fr 48px;
  align-items: center;
  min-height: 62px;
  padding: 0 10px;
  background: #111111;
  color: #ffffff;
`;

const CloseButton = styled.button`
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 34px;
  line-height: 1;
`;

const OverlayTitle = styled.h1`
  margin: 0;
  text-align: center;
  font-size: 20px;
  line-height: 1.2;
`;

const OverlayBody = styled.div`
  display: grid;
  gap: 18px;
  padding: 20px;
`;

const OverlaySection = styled.section`
  display: grid;
  gap: 12px;
`;

const OverlaySectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const OverlayState = styled.div`
  display: grid;
  gap: 14px;
  padding: 12px 0;
`;

const TargetPicker = styled.div`
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
`;

const TargetChip = styled.label<{ $selected: boolean }>`
  min-width: 92px;
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 12px 10px;
  border: 2px solid ${(props) => (props.$selected ? "#111111" : "#767676")};
  border-radius: 18px;
  background: ${(props) => (props.$selected ? "#eeeeee" : "#ffffff")};
`;

const TargetCheckbox = styled.input`
  position: absolute;
  opacity: 0;
  pointer-events: none;
`;

const TargetAvatar = styled.span`
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 1px solid #111111;
  background: #ffffff;
  color: #111111;
  font-weight: 800;
`;

const TargetName = styled.span`
  max-width: 76px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 700;
`;

const PreviewCard = styled.article`
  display: grid;
  gap: 8px;
  padding: 14px;
  border: 1px solid #deded3;
  border-radius: 18px;
  background: #ffffff;
`;

const PreviewTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  line-height: 1.3;
`;

const PreviewValue = styled.p`
  margin: 0;
  max-height: 130px;
  overflow: hidden;
  color: #444444;
  line-height: 1.45;
  overflow-wrap: anywhere;
`;
