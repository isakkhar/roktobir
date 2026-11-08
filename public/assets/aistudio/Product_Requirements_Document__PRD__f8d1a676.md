# Product Requirements Document (PRD)

**0709 Blood Bank App** · Version 1.0 (Draft) · 8 November 2026

Product Owner: \[add name\] · Platform: Android (Kotlin, Jetpack Compose) · Backend: Firebase Spark plan (free) · Distribution: direct APK / Firebase App Distribution (no Play Store)

## 1. Summary

The 0709 Blood Bank App is a free Android app that connects people who urgently need blood with compatible, available donors in the 0709 friends community and the wider circle they bring in. A requester posts a request with blood group, hospital and location, and the app notifies every compatible, available donor. Donors respond in one tap. Anyone can also search the donor directory and contact donors by phone call or WhatsApp. Every request carries a map icon that opens the hospital location in the phone’s maps app.

The product runs entirely on free tiers (Firebase Spark plan and Cloudflare Workers free plan) and is distributed outside the Play Store.

Note: this is a donor-matching network, not a blood inventory or storage bank. It never stores or dispenses blood.

## 2. Background and Problem

Today, blood requests spread through Facebook posts and WhatsApp groups. The pain points are:

- Requests get buried in unrelated chatter, so the right donors miss them.
- Requesters cannot filter by blood group or area, so they message many people manually.
- Nobody knows who is eligible to donate right now.
- Hospital locations are typed inconsistently and are often unclear.
- Nobody knows when a request is already fulfilled, so people keep responding after the need is gone.

## 3. Vision

The right donor, with the right blood group, notified within minutes, at zero cost to the community.

## 4. Goals and Non-Goals

### 4.1 Goals

| # | Goal | Measure (proposed targets) |
| --- | --- | --- |
| G1 | Reach compatible donors fast | Push notification sent within 60 s of request creation (95th percentile) |
| G2 | Get a response quickly | At least 60% of requests receive 1 or more donor responses within 2 hours |
| G3 | Make requesting effortless | A request can be created in under 60 seconds |
| G4 | Keep donor data trustworthy | Availability is computed automatically from last donation date |
| G5 | Cost nothing | ৳0 per month, no billing account attached to any service |
| G6 | Easy adoption | Install and sign up in under 3 minutes |

### 4.2 Non-Goals (v1.0)

- Blood inventory, storage or hospital blood-bank stock tracking
- Payments, donations of money, or any commerce
- Medical advice, diagnosis or donor medical screening
- iOS app, web app or Play Store release
- In-app chat or voice calls (phone and WhatsApp hand-off is used instead)
- Profile photo upload (cloud storage is not on the free path)
- Phone-number OTP login (paid SMS)

## 5. Target Users and Personas

| Persona | Description | Key needs |
| --- | --- | --- |
| Requester (e.g. Rafi, 29) | Family member or friend of a patient, stressed, at or near a hospital | Speed, fewest taps, clear status, easy way to share |
| Donor (e.g. Tanvir, 24) | Willing to donate, wants to help without being spammed | Relevant alerts only, privacy control, knows when he is eligible again |
| Admin (community moderator) | Maintains quality and removes abuse | Block users, remove requests, see reports |

Both Requester and Donor are the same account type; a person can be either at different times. Typical devices are mid-range Android phones on mobile data, so the app must be light and tolerant of weak networks.

## 6. Product Principles

1. **Free, always.** No feature may require a paid service or a billing account.
2. **Speed in an emergency.** Every critical action is reachable in 1 to 3 taps.
3. **Privacy-aware.** Collect the minimum, let donors control exposure of their phone number.
4. **Bangla-first.** Default language is Bangla, with English as an option.
5. **Works on weak networks.** Cached data, small APK, no heavy assets.

## 7. Scope and Release Plan

| Release | Scope |
| --- | --- |
| **v1.0 (MVP)** | Email/password and Google sign-up, email verification, profile, availability, donor directory with call/WhatsApp, blood requests, compatible-donor push notifications, ‘I’m coming’ responses, map icon, request status, share, in-app update check, report abuse, Bangla/English, dark mode, console-based moderation |
| **v1.1** | In-app admin screen, donation history and badges, eligibility-again reminder, blood donation camps/events, hospital preset list improvements |
| **v2.0 (ideas)** | District-level broadcast, volunteer coordinators, offline request queue, widgets, richer analytics |

## 8. User Stories

| ID | As a… | I want to… | So that… | Priority |
| --- | --- | --- | --- | --- |
| US-01 | new user | sign up with email/password or Google | I can join without an invite | P0 |
| US-02 | user | verify my email address | the community stays trustworthy | P0 |
| US-03 | donor | create a profile (blood group, area, phone) | others can find me | P0 |
| US-04 | donor | switch availability on or off | I am not disturbed when I cannot donate | P0 |
| US-05 | donor | see when I am eligible again | I can plan my next donation | P1 |
| US-06 | requester | post a request with group, bags, hospital, time and contact | donors know exactly what is needed | P0 |
| US-07 | requester | mark a request urgent | critical cases stand out | P0 |
| US-08 | requester | drop a map pin or pick a hospital | donors can navigate there | P1 |
| US-09 | donor | get a push notification only when my group can help | I act quickly without noise | P0 |
| US-10 | donor | tap a map icon on the request | the hospital opens in my maps app | P0 |
| US-11 | donor | tap ‘I’m coming’ | the requester knows help is on the way | P0 |
| US-12 | requester | see who responded and call them | I can coordinate | P0 |
| US-13 | any user | search donors by group and area | I can reach out myself | P0 |
| US-14 | any user | call or WhatsApp a donor in one tap | I save time | P0 |
| US-15 | requester | mark a request fulfilled or cancelled | people stop responding | P0 |
| US-16 | requester | share the request to WhatsApp or Facebook | I widen the reach | P1 |
| US-17 | donor | hide my phone number | I keep my privacy | P1 |
| US-18 | donor | log a donation | my history and eligibility update | P1 |
| US-19 | user | switch language and dark mode | I am comfortable | P1 |
| US-20 | user | be told about a new app version | I stay current without a store | P0 |
| US-21 | user | report an abusive request or user | the community stays safe | P1 |
| US-22 | admin | block users and remove requests | I can moderate | P1 |
| US-23 | donor | get a reminder when I am eligible again | I donate regularly | P2 |
| US-24 | user | see blood donation camps | I can donate on schedule | P2 |
| US-25 | user | delete my account and data | I control my data | P1 |

## 9. Feature Specifications

### 9.1 Blood Request and Instant Notification (core)

**Request fields:** patient name, blood group, bags needed (1 to 10), hospital name, hospital location (optional pin), needed-by date and time, contact phone, urgent flag, optional note.

**Lifecycle:** Open → Fulfilled, Cancelled or Expired. A request expires automatically 48 hours after its needed-by time (configurable).

**Notification logic:**

- Notify only donors whose blood group is compatible with the patient (see Appendix A) and who are marked available.
- Do not notify the requester.
- Urgent requests use a high-priority notification channel with sound.
- Tapping a notification opens the request detail screen.

**Abuse limits:** a user may have at most 3 open requests and send at most 5 requests per day.

**Acceptance:** a compatible, available donor with notifications enabled receives the alert typically within seconds of request creation. Delivery is best-effort because push delivery depends on the phone and network.

### 9.2 Donor Directory

- Filter by blood group, district, area and ‘available now’.
- Each donor card shows name, blood group, area, availability and eligibility countdown, with **Call**, **WhatsApp** and **SMS** buttons.
- If a donor hides their phone, direct contact buttons are hidden. The donor still receives alerts, and their number is shared with a requester only when the donor taps ‘I’m coming’.
- The list loads once and is cached to save data and free-tier reads.

### 9.3 Map and Location

- A **map icon** appears on every request card and detail screen. Tapping opens the maps app at the hospital location with a label.
- If no coordinates exist, the hospital name is searched in the maps app instead.
- Location can be provided by (a) choosing from a preset hospital list, (b) dropping a pin on an OpenStreetMap view, or (c) name only.
- No paid map SDK is used.

### 9.4 Eligibility

- Default gap between donations is 90 days, adjustable remotely (Remote Config).
- At sign-up, donors self-declare they meet local donation criteria (age and weight limits to be confirmed with a medical advisor).
- The app always shows a disclaimer: it is a contact tool, and the hospital’s screening decides who may donate.

### 9.5 In-App Update Check

Because the app is not on the Play Store, it checks Remote Config on launch. If a newer version exists, a dialog offers the APK download link. A minimum-version value can force an update when a critical fix is released.

### 9.6 Moderation and Safety

- Email must be verified before a user can read or post data.
- Users can report a request or a user. In v1.0, admins review reports and block users from the Firebase console.
- Blocked users cannot create requests, responses or profile changes.

### 9.7 Localization and Theming

Bangla (default) and English, system-following or manual dark mode, minimum touch target 48 dp.

## 10. Key User Flows

**Flow A – Onboarding**

1. Install APK and open the app.
2. Sign up with email and password, or Google.
3. Verify email (skipped for Google).
4. Complete profile: name, blood group, phone, district, area, last donation (optional), eligibility self-declaration.
5. Allow notifications. Land on the Requests tab.

**Flow B – Urgent request**

1. Tap the red ‘+’ button.
2. Enter blood group, bags, hospital, time, contact, toggle Urgent.
3. Optionally pick a hospital or pin.
4. Submit. Compatible donors are notified.
5. Watch the live responder counter, call responders.
6. Mark Fulfilled.

**Flow C – Donor responds**

1. Receive notification, tap it.
2. Review details, tap the map icon to navigate.
3. Tap ‘I’m coming’ (optionally sharing the phone number).
4. After donating, log the donation.

**Flow D – Find a donor manually**

1. Open the Donors tab, filter by group and area.
2. Tap Call or WhatsApp on a donor card.

## 11. UX and Visual Design

**Navigation:** bottom bar with Requests, Donors, a central ‘+ New Request’ action, and Profile.

**Screens (v1.0):** Splash, Login/Sign up, Email verification, Profile setup, Requests list, Request detail, New request, Donor directory, My profile and settings, About and disclaimer, Report dialog, Update dialog.

**Colour tokens**

| Token | Hex | Use |
| --- | --- | --- |
| Primary | #C62828 | App bar, main buttons |
| Primary Dark | #8E0000 | Status bar |
| Primary Light | #FF5F52 | Highlights |
| Accent | #00796B | Secondary actions |
| Background | #FAFAFA | Screen background |
| Surface | #FFFFFF | Cards |
| Text Primary | #212121 | Body text |
| Text Secondary | #757575 | Captions |
| Urgent | #D50000 | Urgent badge |
| Success | #2E7D32 | Available, fulfilled |
| Warning | #F9A825 | In progress |
| Call | #1976D2 | Call button |
| WhatsApp | #25D366 | WhatsApp button |
| Map | #EA4335 | Map icon |
| Dark background | #121212 | Dark mode |
| Dark surface | #1E1E1E | Dark mode cards |

**Empty and error states:** friendly Bangla messages for no requests, no donors, no network (cached data stays visible) and quota-reached situations.

## 12. Constraints and Assumptions

- **Zero cost.** Only Firebase Spark (Authentication with email and Google, Firestore, Cloud Messaging, Remote Config, App Distribution, Crashlytics, Analytics) and Cloudflare Workers free plan. No Cloud Functions, Cloud Storage, phone auth or paid map APIs.
- **Spark quotas** are daily limits (roughly 50,000 Firestore reads and 20,000 writes per day; verify on the Firebase pricing page). The design target for v1.0 is about 300 daily active users. If exceeded, the service throttles rather than billing.
- **Sideloading.** Users must allow installing from unknown sources and may see a Play Protect warning. An install guide is required.
- **Open sign-up.** Anyone can register, so moderation, rate limits and privacy controls are mandatory.
- Android 8.0 (API 26) and above.

## 13. Technical Approach (High Level)

| Need | Free solution |
| --- | --- |
| Login | Firebase Authentication (email/password, Google) |
| Data | Cloud Firestore with security rules |
| Push | Firebase Cloud Messaging with blood-group topics |
| Notification sender | Cloudflare Worker that validates the user and sends FCM |
| Maps | geo: intent to the maps app, OpenStreetMap pin picker |
| Updates | Firebase Remote Config |
| Beta distribution | Firebase App Distribution or direct APK |
| Stability and usage | Crashlytics and Analytics |

## 14. Success Metrics

| Metric | Target (proposed) |
| --- | --- |
| Registered donors in first 60 days | 150 or more |
| Requests with 1 or more responses within 2 hours | 60% or more |
| Median time to first response | 30 minutes or less |
| 30-day user retention | 40% or more |
| Crash-free sessions | 99% or more |
| Monthly cost | ৳0 |

## 15. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Free quota exhausted | App throttled | Caching, small page sizes, monitor usage, plan optimisation before limits |
| Spam or fake requests | Donor fatigue | Verified email, rate limits, report and block |
| Phone number misuse | Privacy harm | Clear consent text, hide-number option, minimal data, easy deletion |
| Push delays on some phones | Missed alerts | In-app live list, battery-optimisation guidance, WhatsApp share |
| Lost signing key | Cannot ship updates | Back up the keystore in two safe places |
| Google sign-in fails in release | Users blocked | Add the release SHA-1 to Firebase |
| Users distrust sideloaded app | Low adoption | Clear install guide, open communication, source transparency |
| Medical or legal misunderstanding | Reputation and legal risk | Disclaimer, no medical advice, review wording |

## 16. Rollout Plan

| Week | Milestone |
| --- | --- |
| 1 | Firebase setup, authentication, profile |
| 2 | Donor directory, call and WhatsApp actions |
| 3 | Requests, responses, map icon |
| 4 | Notification Worker, update check, reporting |
| 5 | Testing, closed beta with 20 to 30 friends via App Distribution, fixes, v1.0 release |

## 17. Open Questions

1. Confirm donation gap, age and weight limits with a medical advisor.
2. Should sign-up stay fully open, or be restricted to selected districts?
3. Who are the admins and how are reports handled day to day?
4. App name, logo and final package name.
5. Data retention: delete expired requests after how many days (suggested 90)?
6. Should donor phone numbers be visible to all verified users, or only after the donor responds?
7. Where is the APK hosted (App Distribution, Drive, GitHub Releases)?
8. Legal review of the disclaimer and privacy notice.

## Appendix A – Blood Group Compatibility (who can donate to whom)

| Patient group | Compatible donor groups |
| --- | --- |
| A+ | A+, A−, O+, O− |
| A− | A−, O− |
| B+ | B+, B−, O+, O− |
| B− | B−, O− |
| AB+ | All groups |
| AB− | A−, B−, AB−, O− |
| O+ | O+, O− |
| O− | O− |
