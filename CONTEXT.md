# Content Relay

Content Relay lets a user send items between their personal devices through a private Relay Hub. This context defines the product language used to describe the core domain, those devices, and app surfaces.

## Language

**Relay Hub**:
The private server that stores items, tracks deliveries, registers devices, and coordinates device-to-device relay over the Tailnet.
_Avoid_: Backend, API server, cloud service

**Device**:
A registered sender or recipient endpoint with its own device ID, nickname, and local connection settings.
_Avoid_: Client, installation, profile
_Note_: A local CLI/client **profile** is a stored configuration for accessing a Device; it is not the domain Device itself.

**Item**:
A shared unit of content created by one Device and targeted to one or more Devices. An Item can be text, a URL, or a file bundle.
_Avoid_: Message, notification, payload

**File Item**:
An Item whose content is one or more files shared as one logical unit.
_Avoid_: File message, attachment list, per-file item

**Delivery**:
A per-target-Device record that tracks a recipient Device's handling of an Item.
_Avoid_: Push, notification, message copy

**Push Token**:
The native mobile push-provider token stored for a mobile Device so the Relay Hub can wake or notify it.
_Avoid_: Device credential, auth token

**Mobile App**:
The installable app surface used on iOS and Android to send and receive items.
_Avoid_: PWA, mobile web app

**Android App**:
The Android mobile app used to send and receive items.
_Avoid_: Android PWA

**iOS App**:
The iOS mobile app used to send and receive items.
_Avoid_: iPhone client, React Native app

**Registered Mobile Device**:
A mobile Device that has completed registration, notification permission, native push registration, and push-token upload.
_Avoid_: Partially registered device, push-optional mobile device

**Mobile Registration**:
The onboarding flow that creates a Registered Mobile Device only when push setup has completed successfully.
_Avoid_: Partial registration, device-first registration

## Relationships

- The **Relay Hub** stores **Items**, tracks **Deliveries**, registers **Devices**, and stores mobile **Push Tokens**.
- A **Device** can create an **Item** and target it to one or more other **Devices**.
- Each target **Device** gets its own **Delivery** for an **Item**.
- A **File Item** may contain multiple files, but still creates one logical **Item** and one **Delivery** per target **Device**.
- A **Mobile App** runs on a **Device**.
- The **Android App** and **iOS App** are the two mobile variants of the **Mobile App**.
- A **Registered Mobile Device** is a **Device** reached through a **Mobile App** with working push setup.
- A **Mobile Registration** creates one **Registered Mobile Device** by registering a nickname, platform, and push token with the Relay Hub.

## Example dialogue

> **Dev:** "When I send a URL to my phone, does the **Android App** receive it the same way as the **iOS App**?"
> **Domain expert:** "Yes — both are **Mobile Apps** on registered **Devices**, even if their platform integrations differ. The Relay Hub tracks one **Delivery** for the target Device."
>
> **Dev:** "If I share three files at once, is that three **Items**?"
> **Domain expert:** "No — that is one **File Item** containing three files. Each target Device gets one **Delivery** for that Item."
>
> **Dev:** "If the phone chose a nickname but push setup failed, is it still a **Registered Mobile Device**?"
> **Domain expert:** "No — **Mobile Registration** only completes when push setup succeeds. The Relay Hub must not create a partial mobile Device."
>
> **Dev:** "The CLI has a profile. Is that the same as a **Device**?"
> **Domain expert:** "No — the profile is local configuration for a registered **Device**. Use **Device** when describing the domain object."

## Flagged ambiguities

- "Android PWA" was used to mean the Android mobile recipient surface — resolved: the canonical term is **Android App**.
- "registered mobile device" could have meant "device row created" only — resolved: it means a mobile device with completed push setup, not a partial onboarding state.
- "registration" could have meant "device row created" only — resolved: for mobile, **Mobile Registration** is atomic and completes only after push setup succeeds.
- "profile" can mean local CLI/client configuration — resolved: use **profile** only for local stored configuration, not as a synonym for domain **Device**.
- "push" could mean delivery itself — resolved: push is only wake/notification; **Delivery** state remains authoritative in the Relay Hub.
