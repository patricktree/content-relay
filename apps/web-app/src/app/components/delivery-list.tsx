import { styled } from "@linaria/react";
import { QueryErrorResetBoundary, useSuspenseQuery } from "@tanstack/react-query";
import React from "react";
import { Temporal } from "temporal-polyfill";

import type { DeliveryResource, ItemResource } from "@content-relay/contracts";

import { useSettingsContext } from "#src/app/components/settings-context.js";
import { DSButton } from "#src/app/design-system/button.js";
import { createCurrentDeviceQuery } from "#src/data-fetching/current-device.js";
import { useDeliveryHistory } from "#src/data-fetching/deliveries.js";
import { openExternalUrl } from "#src/platform/open-url.js";

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
  const currentDeviceQuery = useSuspenseQuery(
    createCurrentDeviceQuery({ relayHubUrl, deviceNickname }),
  );
  const { deviceId } = currentDeviceQuery.data.currentDevice;
  const deliveryHistory = useDeliveryHistory({ relayHubUrl, deviceId });
  const [selectedDelivery, setSelectedDelivery] = React.useState<DeliveryResource | null>(null);

  async function openDelivery(delivery: DeliveryResource): Promise<void> {
    if (delivery.item.type !== "url") {
      setSelectedDelivery(delivery);
      return;
    }

    if (delivery.item.url === null) {
      setSelectedDelivery(delivery);
      return;
    }

    try {
      await openExternalUrl(delivery.item.url);
      deliveryHistory.markViewed(delivery.deliveryId);
    } catch {
      setSelectedDelivery(delivery);
    }
  }

  return (
    <DeliverySection aria-labelledby="deliveries-heading">
      <SectionHeader>
        <h2 id="deliveries-heading">Deliveries</h2>
        <DSButton
          type="button"
          variant="text"
          disabled={!deliveryHistory.canRefresh}
          onClick={() => {
            void deliveryHistory.refreshNewest();
          }}
        >
          {deliveryHistory.isRefreshingNewest ? "Refreshing…" : "Refresh"}
        </DSButton>
      </SectionHeader>

      {deliveryHistory.refreshNewestError !== null && (
        <ErrorMessage>
          Could not refresh deliveries. <RetryButton onRetry={deliveryHistory.refreshNewest} />
        </ErrorMessage>
      )}

      {deliveryHistory.deliveries.length === 0 ? (
        <EmptyState>No deliveries for this device yet.</EmptyState>
      ) : (
        <DeliveryRows aria-label="Deliveries">
          {deliveryHistory.deliveries.map((delivery) => (
            <DeliveryRow
              key={delivery.deliveryId}
              delivery={delivery}
              sourceDeviceLabel={
                currentDeviceQuery.data.deviceNicknamesById[delivery.item.sourceDeviceId] ??
                delivery.item.sourceDeviceId
              }
              onOpen={() => {
                void openDelivery(delivery);
              }}
            />
          ))}
        </DeliveryRows>
      )}

      {deliveryHistory.hasOlder && (
        <LoadMoreWrapper>
          <DSButton
            type="button"
            disabled={deliveryHistory.isLoadingOlder}
            onClick={() => {
              void deliveryHistory.loadOlder();
            }}
          >
            {deliveryHistory.isLoadingOlder ? "Loading more…" : "Load more"}
          </DSButton>
        </LoadMoreWrapper>
      )}

      {deliveryHistory.loadOlderError !== null && (
        <ErrorMessage>
          Could not load more deliveries. <RetryButton onRetry={deliveryHistory.loadOlder} />
        </ErrorMessage>
      )}

      {selectedDelivery !== null && (
        <DeliveryDetailDialog
          delivery={selectedDelivery}
          markViewedError={deliveryHistory.markViewedError}
          isMarkingViewed={deliveryHistory.isMarkingViewed}
          onClose={() => {
            deliveryHistory.resetMarkViewed();
            setSelectedDelivery(null);
          }}
          onOpened={() => {
            deliveryHistory.markViewed(selectedDelivery.deliveryId);
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
      <Dialog open aria-modal="true" aria-labelledby="delivery-detail-heading">
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
  resetKey: unknown;
};

class DeliveryListErrorBoundary extends React.Component<
  DeliveryListErrorBoundaryProps,
  DeliveryListErrorBoundaryState
> {
  override state: DeliveryListErrorBoundaryState = {
    error: null,
    resetKey: this.props.resetKey,
  };

  static getDerivedStateFromError(error: Error): Partial<DeliveryListErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: DeliveryListErrorBoundaryProps,
    state: DeliveryListErrorBoundaryState,
  ): Partial<DeliveryListErrorBoundaryState> | null {
    if (props.resetKey === state.resetKey) {
      return null;
    }

    return {
      error: null,
      resetKey: props.resetKey,
    };
  }

  override render(): React.ReactNode {
    if (this.state.error !== null) {
      const retry = () => {
        this.props.onReset();
        this.setState({ error: null, resetKey: this.props.resetKey });
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
      this.setState({ error: null, resetKey: this.props.resetKey });
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
  min-width: 0;
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

const Dialog = styled.dialog`
  position: static;
  display: block;
  min-width: 0;
  margin: 0;
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

  h3 {
    min-width: 0;
    overflow-wrap: anywhere;
  }
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
