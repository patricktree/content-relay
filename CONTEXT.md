# Content Relay

Content Relay lets a user send items between their personal devices through a private relay server. This context defines the product language used to describe those devices and app surfaces.

## Language

**Device**:
A registered sender or recipient endpoint with its own nickname and credentials.
_Avoid_: Client, installation, profile

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

- A **Mobile App** runs on a **Device**
- The **Android App** and **iOS App** are the two mobile variants of the **Mobile App**
- A **Registered Mobile Device** is a **Device** reached through a **Mobile App** with working push setup
- A **Mobile Registration** creates one **Registered Mobile Device**

## Example dialogue

> **Dev:** "When I send a URL to my phone, does the **Android App** receive it the same way as the **iOS App**?"
> **Domain expert:** "Yes — both are **Mobile Apps** on registered **Devices**, even if their platform integrations differ."
>
> **Dev:** "If the phone accepted the invite but push setup failed, is it still a **Registered Mobile Device**?"
> **Domain expert:** "No — **Mobile Registration** only completes when push setup succeeds."

## Flagged ambiguities

- "Android PWA" was used to mean the Android mobile recipient surface — resolved: the canonical term is **Android App**.
- "registered mobile device" could have meant "invite accepted" only — resolved: it means a mobile device with completed push setup, not a partial onboarding state.
- "registration" could have meant "device row created" only — resolved: for mobile, **Mobile Registration** is atomic and completes only after push setup succeeds.
