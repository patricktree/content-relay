import { styled } from "@linaria/react";
import {
  QueryErrorResetBoundary,
  useQueryClient,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import React from "react";
import { Temporal } from "temporal-polyfill";

import type { DeliveryResource, ItemResource } from "@content-relay/contracts";

import { useSettingsContext } from "#pkg/app/components/settings-context.js";
import { DSButton } from "#pkg/app/design-system/button.js";
import { createAvailableDevicesQuery } from "#pkg/data-fetching/available-devices.js";
import {
  createDeliveriesQuery,
  refreshFirstDeliveryPage,
  useMarkDeliveryViewedMutation,
  useRefreshDeliveriesOnAndroidResume,
} from "#pkg/data-fetching/deliveries.js";
import { createRegisteredDeviceQuery } from "#pkg/data-fetching/register-device.js";

export const DeliveryList: React.FC = () => {
  const { settings } = useSettingsContext();

  if (!settings) {
    return (
      <DeliverySection aria-labelledby="deliveries-heading">
        <SectionHeader>
          <h2 id="deliveries-heading">Deliveries</h2>
        </SectionHeader>
        <EmptyState>Save settings to load deliveries for this device.</EmptyState>
      </DeliverySection>
    );
  }

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <DeliveryListErrorBoundary onReset={reset} resetKey={settings}>
          {() => (
            <React.Suspense fallback={<DeliveryListLoading />}>
              <DeliveryListContent
                relayHubUrl={settings.relayHubUrl}
                deviceNickname={settings.deviceNickname}
              />
            </React.Suspense>
          )}
        </DeliveryListErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
};

type DeliveryListContentProps = {
  relayHubUrl: string;
  deviceNickname: string;
};

const DeliveryListContent: React.FC<DeliveryListContentProps> = ({
  relayHubUrl,
  deviceNickname,
}) => {
  const queryClient = useQueryClient();
  const registeredDeviceQuery = useSuspenseQuery(
    createRegisteredDeviceQuery({ relayHubUrl, deviceNickname }),
  );
  const availableDevicesQuery = useSuspenseQuery(createAvailableDevicesQuery({ relayHubUrl }));
  const { deviceId } = registeredDeviceQuery.data;
  const deliveriesQuery = useSuspenseInfiniteQuery(
    createDeliveriesQuery({ relayHubUrl, deviceId }),
  );
  const markDeliveryViewedMutation = useMarkDeliveryViewedMutation({ relayHubUrl, deviceId });
  const [selectedDelivery, setSelectedDelivery] = React.useState<DeliveryResource | null>(null);
  const [isRefreshingNewestPage, setIsRefreshingNewestPage] = React.useState(false);
  const [refreshError, setRefreshError] = React.useState<unknown>(null);

  useRefreshDeliveriesOnAndroidResume({ relayHubUrl, deviceId });

  const deliveries = dedupeDeliveries(
    deliveriesQuery.data.pages.flatMap((page) => page.deliveries),
  );
  const deviceNicknamesById = new Map(
    availableDevicesQuery.data.map((device) => [device.deviceId, device.nickname]),
  );

  async function refreshNewestDeliveries(): Promise<void> {
    setIsRefreshingNewestPage(true);
    setRefreshError(null);

    try {
      await refreshFirstDeliveryPage(queryClient, { relayHubUrl, deviceId });
    } catch (error) {
      setRefreshError(error);
    } finally {
      setIsRefreshingNewestPage(false);
    }
  }

  return (
    <DeliverySection aria-labelledby="deliveries-heading">
      <SectionHeader>
        <h2 id="deliveries-heading">Deliveries</h2>
        <DSButton
          type="button"
          variant="text"
          disabled={
            isRefreshingNewestPage ||
            deliveriesQuery.isFetching ||
            deliveriesQuery.isFetchingNextPage
          }
          onClick={() => {
            void refreshNewestDeliveries();
          }}
        >
          {isRefreshingNewestPage ? "Refreshing…" : "Refresh"}
        </DSButton>
      </SectionHeader>

      {refreshError !== null && (
        <ErrorMessage>
          Could not refresh deliveries. <RetryButton onRetry={refreshNewestDeliveries} />
        </ErrorMessage>
      )}

      {deliveries.length === 0 ? (
        <EmptyState>No deliveries for this device yet.</EmptyState>
      ) : (
        <DeliveryRows aria-label="Deliveries">
          {deliveries.map((delivery) => (
            <DeliveryRow
              key={delivery.deliveryId}
              delivery={delivery}
              sourceDeviceLabel={
                deviceNicknamesById.get(delivery.item.sourceDeviceId) ??
                delivery.item.sourceDeviceId
              }
              onOpen={() => setSelectedDelivery(delivery)}
            />
          ))}
        </DeliveryRows>
      )}

      {deliveriesQuery.hasNextPage && (
        <LoadMoreWrapper>
          <DSButton
            type="button"
            disabled={deliveriesQuery.isFetchingNextPage}
            onClick={() => {
              if (deliveriesQuery.isFetchingNextPage) {
                return;
              }

              void deliveriesQuery.fetchNextPage();
            }}
          >
            {deliveriesQuery.isFetchingNextPage ? "Loading more…" : "Load more"}
          </DSButton>
        </LoadMoreWrapper>
      )}

      {deliveriesQuery.isFetchNextPageError && (
        <ErrorMessage>
          Could not load more deliveries. <RetryButton onRetry={deliveriesQuery.fetchNextPage} />
        </ErrorMessage>
      )}

      {selectedDelivery !== null && (
        <DeliveryDetailDialog
          delivery={selectedDelivery}
          markViewedError={markDeliveryViewedMutation.error}
          isMarkingViewed={markDeliveryViewedMutation.isPending}
          onClose={() => {
            markDeliveryViewedMutation.reset();
            setSelectedDelivery(null);
          }}
          onOpened={() => {
            markDeliveryViewedMutation.mutate(selectedDelivery.deliveryId);
          }}
        />
      )}
    </DeliverySection>
  );
};

type DeliveryRowProps = {
  delivery: DeliveryResource;
  sourceDeviceLabel: string;
  onOpen: () => void;
};

const DeliveryRow: React.FC<DeliveryRowProps> = ({ delivery, sourceDeviceLabel, onOpen }) => {
  const isSupported = delivery.item.type === "text" || delivery.item.type === "url";

  return (
    <DeliveryRowLi>
      <DeliveryRowMain>
        <DeliveryMetaLine>
          <DeliveryType>{formatItemType(delivery.item.type)}</DeliveryType>
          <DeliveryState>{delivery.state}</DeliveryState>
          <time dateTime={delivery.createdAt}>{formatCreatedAt(delivery.createdAt)}</time>
        </DeliveryMetaLine>
        <DeliveryPrimary>{getDeliveryPrimaryText(delivery.item)}</DeliveryPrimary>
        {delivery.item.title !== null && (
          <DeliverySecondary>{getDeliveryPreview(delivery.item)}</DeliverySecondary>
        )}
        <DeliverySource>Source Device: {sourceDeviceLabel}</DeliverySource>
        {!isSupported && <UnsupportedText>File delivery not supported yet</UnsupportedText>}
      </DeliveryRowMain>
      <DeliveryRowActions>
        <DSButton type="button" disabled={!isSupported} onClick={onOpen}>
          Open
        </DSButton>
      </DeliveryRowActions>
    </DeliveryRowLi>
  );
};

type DeliveryDetailDialogProps = {
  delivery: DeliveryResource;
  markViewedError: Error | null;
  isMarkingViewed: boolean;
  onClose: () => void;
  onOpened: () => void;
};

const DeliveryDetailDialog: React.FC<DeliveryDetailDialogProps> = ({
  delivery,
  markViewedError,
  isMarkingViewed,
  onClose,
  onOpened,
}) => {
  const onOpenedRef = React.useRef(onOpened);

  React.useEffect(
    function keepOnOpenedCallbackCurrent() {
      onOpenedRef.current = onOpened;
    },
    [onOpened],
  );

  React.useEffect(
    function markDeliveryViewedOnOpen() {
      onOpenedRef.current();
    },
    [delivery.deliveryId],
  );

  return (
    <DialogBackdrop>
      <Dialog role="dialog" aria-modal="true" aria-labelledby="delivery-detail-heading">
        <DialogHeader>
          <h3 id="delivery-detail-heading">{getDeliveryPrimaryText(delivery.item)}</h3>
          <DSButton type="button" variant="text" onClick={onClose}>
            Close
          </DSButton>
        </DialogHeader>

        {delivery.item.type === "text" ? (
          <DialogText>{delivery.item.text}</DialogText>
        ) : delivery.item.type === "url" ? (
          <DialogUrlContent>
            <DialogUrl>{delivery.item.url}</DialogUrl>
            <a href={delivery.item.url ?? undefined} target="_blank" rel="noreferrer">
              Open URL
            </a>
          </DialogUrlContent>
        ) : null}

        {isMarkingViewed && <StatusText>Marking delivery viewed…</StatusText>}
        {markViewedError !== null && (
          <ErrorMessage>Could not mark delivery viewed: {markViewedError.message}</ErrorMessage>
        )}
      </Dialog>
    </DialogBackdrop>
  );
};

type DeliveryListErrorBoundaryProps = {
  children: (retry: () => void) => React.ReactNode;
  onReset: () => void;
  resetKey: unknown;
};

type DeliveryListErrorBoundaryState = {
  error: Error | null;
};

class DeliveryListErrorBoundary extends React.Component<
  DeliveryListErrorBoundaryProps,
  DeliveryListErrorBoundaryState
> {
  override state: DeliveryListErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): DeliveryListErrorBoundaryState {
    return { error };
  }

  override componentDidUpdate(previousProps: DeliveryListErrorBoundaryProps): void {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error !== null) {
      this.setState({ error: null });
    }
  }

  override render(): React.ReactNode {
    if (this.state.error !== null) {
      const retry = () => {
        this.props.onReset();
        this.setState({ error: null });
      };

      return (
        <DeliverySection aria-labelledby="deliveries-heading">
          <SectionHeader>
            <h2 id="deliveries-heading">Deliveries</h2>
          </SectionHeader>
          <ErrorMessage>
            Could not load deliveries. <RetryButton onRetry={retry} />
          </ErrorMessage>
        </DeliverySection>
      );
    }

    return this.props.children(() => {
      this.props.onReset();
      this.setState({ error: null });
    });
  }
}

const DeliveryListLoading: React.FC = () => (
  <DeliverySection aria-labelledby="deliveries-heading">
    <SectionHeader>
      <h2 id="deliveries-heading">Deliveries</h2>
    </SectionHeader>
    <StatusText>Loading deliveries…</StatusText>
  </DeliverySection>
);

type RetryButtonProps = {
  onRetry: () => void | Promise<unknown>;
};

const RetryButton: React.FC<RetryButtonProps> = ({ onRetry }) => (
  <InlineButton
    type="button"
    onClick={() => {
      void onRetry();
    }}
  >
    Retry
  </InlineButton>
);

function dedupeDeliveries(deliveries: DeliveryResource[]): DeliveryResource[] {
  const deliveriesById = new Map<string, DeliveryResource>();

  for (const delivery of deliveries) {
    if (!deliveriesById.has(delivery.deliveryId)) {
      deliveriesById.set(delivery.deliveryId, delivery);
    }
  }

  return [...deliveriesById.values()].sort((left, right) => {
    return (
      Temporal.Instant.from(right.createdAt).epochMilliseconds -
      Temporal.Instant.from(left.createdAt).epochMilliseconds
    );
  });
}

function getDeliveryPrimaryText(item: ItemResource): string {
  return item.title ?? getDeliveryPreview(item);
}

function getDeliveryPreview(item: ItemResource): string {
  switch (item.type) {
    case "text":
      return item.text ?? "";
    case "url":
      return item.url ?? "";
    case "file":
      return formatFilePreview(item);
    default:
      return assertUnreachable(item.type);
  }
}

function formatFilePreview(item: ItemResource): string {
  const firstFile = item.files[0];

  if (item.files.length === 1 && firstFile !== undefined) {
    return firstFile.fileName;
  }

  return `${item.files.length} files`;
}

function formatItemType(itemType: ItemResource["type"]): string {
  switch (itemType) {
    case "text":
      return "Text";
    case "url":
      return "URL";
    case "file":
      return "File";
    default:
      return assertUnreachable(itemType);
  }
}

function formatCreatedAt(createdAt: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(Temporal.Instant.from(createdAt).epochMilliseconds);
}

function assertUnreachable(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}

const DeliverySection = styled.section`
  margin-block: calc(4 * var(--spacing-base));
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-base);
`;

const DeliveryRows = styled.ul`
  display: grid;
  gap: var(--spacing-base);
  padding: 0;
  list-style: none;
`;

const DeliveryRowLi = styled.li`
  display: flex;
  justify-content: space-between;
  gap: calc(2 * var(--spacing-base));
  border: 1px solid var(--color-fg);
  border-radius: var(--border-radius);
  padding: calc(1.5 * var(--spacing-base));
`;

const DeliveryRowMain = styled.div`
  min-width: 0;
`;

const DeliveryRowActions = styled.div`
  flex-shrink: 0;
`;

const DeliveryMetaLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-base);
  font-size: var(--font-size-sm);
`;

const DeliveryType = styled.span`
  font-weight: var(--font-weight-bold);
`;

const DeliveryState = styled.span`
  font-style: italic;
  text-transform: capitalize;
`;

const DeliveryPrimary = styled.div`
  margin-block-start: var(--spacing-base);
  font-weight: var(--font-weight-bold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const DeliverySecondary = styled.div`
  margin-block-start: calc(0.5 * var(--spacing-base));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const DeliverySource = styled.div`
  margin-block-start: calc(0.5 * var(--spacing-base));
  color: var(--color-muted-fg);
  font-size: var(--font-size-sm);
  overflow-wrap: anywhere;
`;

const UnsupportedText = styled.div`
  margin-block-start: calc(0.5 * var(--spacing-base));
  font-size: var(--font-size-sm);
`;

const EmptyState = styled.p``;

const StatusText = styled.p``;

const ErrorMessage = styled.p`
  color: var(--color-danger-fg, currentColor);
`;

const InlineButton = styled.button`
  padding: 0;
  color: inherit;
  background: transparent;
  border: 0;
  text-decoration: underline;

  &:hover {
    cursor: pointer;
  }
`;

const LoadMoreWrapper = styled.div`
  margin-block-start: calc(2 * var(--spacing-base));
`;

const DialogBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  padding: var(--app-padding-inline);
  background: rgb(0 0 0 / 0.4);
`;

const Dialog = styled.div`
  max-width: min(640px, 100%);
  width: 100%;
  border: 1px solid var(--color-fg);
  border-radius: var(--border-radius);
  padding: calc(2 * var(--spacing-base));
  color: var(--color-fg);
  background: var(--color-bg);
`;

const DialogHeader = styled.div`
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--spacing-base);
`;

const DialogText = styled.pre`
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: inherit;
`;

const DialogUrlContent = styled.div`
  display: grid;
  gap: var(--spacing-base);
`;

const DialogUrl = styled.p`
  overflow-wrap: anywhere;
`;
