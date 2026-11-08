# Software Requirements Specification (SRS)

**0709 Blood Bank App** · Version 1.0 (Draft) · 8 November 2026

Prepared for: Product Owner \[add name\] · Format follows ISO/IEC/IEEE 29148 · Companion document: PRD – 0709 Blood Bank App

## 1. Introduction

### 1.1 Purpose

This document specifies the software requirements for the 0709 Blood Bank App, an Android application that connects blood requesters with compatible donors. It is the contract between product, design, development and testing for release v1.0, with notes on v1.1.

### 1.2 Scope

The system consists of:

1. An Android app (Kotlin, Jetpack Compose).
2. A Firebase backend on the free Spark plan: Authentication, Cloud Firestore, Cloud Messaging, Remote Config, Crashlytics and Analytics.
3. A notification service: one Cloudflare Worker (free plan) that validates a request and sends push notifications.

Out of scope: blood inventory, payments, medical screening or advice, iOS and web clients, in-app chat, photo upload, phone-number OTP login.

### 1.3 Definitions

| Term | Meaning |
| --- | --- |
| Requester | A signed-in user who creates a blood request |
| Donor | A signed-in user with a donor profile |
| Admin | A user whose UID exists in the admins collection |
| Compatible group | A donor blood group that can safely donate to the patient group (Appendix A) |
| Available | Donor switch is on and the donation gap has elapsed |
| Donation gap | Minimum days between donations (default 90, set in Remote Config) |
| FCM topic | A named push channel; one per blood group, for example donor\_A\_pos |
| Spark | Firebase no-cost plan, daily quotas, no billing |
| Worker | The Cloudflare Worker that sends notifications |

### 1.4 References

- PRD – 0709 Blood Bank App, v1.0
- ISO/IEC/IEEE 29148:2018, Requirements engineering
- Firebase documentation (Authentication, Firestore, Cloud Messaging, Remote Config)
- Android Developers documentation (Credential Manager, notifications, intents)

### 1.5 Conventions

Requirement keywords: **shall** is mandatory, **should** is recommended. Priority: **M** Must (v1.0), **S** Should (v1.0 if time allows, else v1.1), **C** Could (v1.1 or later). Each requirement has a unique ID such as FR-REQ-03.

## 2. Overall Description

### 2.1 Product Perspective

The app is a client of managed cloud services. There is no self-hosted server except the stateless Worker.

- **App → Firebase Authentication:** sign-up, sign-in, email verification, Google sign-in via Credential Manager.
- **App ↔ Cloud Firestore:** profiles, requests, responses, reports. Access is governed by security rules.
- **App → Worker (HTTPS):** after saving a request, the app asks the Worker to notify donors, sending the Firebase ID token.
- **Worker → Firebase:** verifies the token, reads and updates the request in Firestore, and sends FCM messages.
- **FCM → App:** push messages arrive at donors subscribed to compatible blood-group topics.
- **App → Remote Config:** reads latest version, minimum version, APK link and tunable limits.
- **App → other apps (intents):** phone dialer, WhatsApp, SMS, maps, share sheet, browser for APK download.

### 2.2 Product Functions (summary)

Authentication and verification; donor profile and availability; blood requests with lifecycle; donor responses; donor directory; push notifications; map and contact actions; update check; reporting and moderation; settings (language, theme); donation history (v1.1).

### 2.3 User Classes

| Class | Description | Privileges |
| --- | --- | --- |
| Visitor | Not signed in | Sign-up and login screens only |
| Unverified user | Signed up, email not verified | Verification screen only |
| Member | Verified user (requester and/or donor) | Full app functions |
| Admin | Member listed in admins | Delete any request; moderation via console in v1.0 |
| Blocked user | Member listed in blocked | Read only; cannot write |

### 2.4 Operating Environment

- Android 8.0 (API 26) and above, phones, portrait orientation.
- Requires Google Play services for Google sign-in and FCM.
- Internet via mobile data or Wi-Fi; cached data is available offline.

### 2.5 Design and Implementation Constraints

- **C-01** No paid service, no billing account, no Cloud Functions, no Cloud Storage, no phone authentication, no paid map SDK.
- **C-02** Firestore Spark daily quotas apply (roughly 50,000 reads, 20,000 writes and 20,000 deletes per day and 1 GiB storage; verify on the Firebase pricing page).
- **C-03** The app is distributed as a signed APK outside the Play Store. The release keystore SHA-1 must be registered in Firebase.
- **C-04** Sign-up is open to anyone, so security rules, rate limits and moderation are mandatory.
- **C-05** Kotlin, Jetpack Compose, MVVM, Kotlin coroutines and Flow.

### 2.6 Assumptions and Dependencies

- A1: Users have Android 8.0+ phones with Play services.
- A2: Firebase and Cloudflare keep their free tiers available. If not, the design is revisited.
- A3: The design target is about 300 daily active users in v1.0.
- A4: Medical eligibility rules (age, weight, donation gap) are confirmed by a medical advisor before release.
- D1: Google Sign-In depends on correct SHA-1 registration and an up-to-date google-services.json.
- D2: Push delivery depends on the device, battery optimisation and the network.

## 3. External Interface Requirements

### 3.1 User Interfaces

- **EIR-UI-01** The UI shall follow Material 3 with the colour tokens in 3.1.1.
- **EIR-UI-02** Primary navigation shall be a bottom bar: Requests, Donors, New Request (central action), Profile.
- **EIR-UI-03** All interactive elements shall have a touch target of at least 48 dp and a content description for screen readers.
- **EIR-UI-04** Text and background colours shall meet a contrast ratio of at least 4.5:1 in light and dark modes.

#### 3.1.1 Colour Tokens

| Token | Light | Dark |
| --- | --- | --- |
| Primary | #C62828 | #EF5350 |
| Primary Dark | #8E0000 | – |
| Accent | #00796B | – |
| Background | #FAFAFA | #121212 |
| Surface | #FFFFFF | #1E1E1E |
| Text Primary | #212121 | #ECEFF1 |
| Text Secondary | #757575 | – |
| Urgent | #D50000 | – |
| Success | #2E7D32 | – |
| Warning | #F9A825 | – |
| Call | #1976D2 | – |
| WhatsApp | #25D366 | – |
| Map | #EA4335 | – |

### 3.2 Hardware Interfaces

None beyond standard phone features (network, optional location permission is not required in v1.0).

### 3.3 Software Interfaces

| Interface | Use | Notes |
| --- | --- | --- |
| Firebase Authentication | Email/password and Google sign-in | Email verification required |
| Cloud Firestore | Primary database | Offline persistence enabled |
| Firebase Cloud Messaging | Push to topics | Data messages, app builds the notification |
| Firebase Remote Config | Version info and tunables | Fetch interval 12 hours, forced fetch at cold start |
| Android Credential Manager | Google ID token | Needs the web client ID from google-services.json |
| Dialer, SMS and share intents | tel:, sms:, ACTION\_SEND | No special permission |
| WhatsApp | https://wa.me/ link with prefilled text | Opens WhatsApp if installed, otherwise the browser |
| Maps | geo: URI intent | Fallback: https maps search link in browser |
| Notification Worker | HTTPS POST | See section 8 |

### 3.4 Communications Interfaces

All network traffic shall use HTTPS/TLS. The app shall not use cleartext HTTP.

## 4. Functional Requirements

### 4.1 Authentication (FR-AUTH)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-AUTH-01 | The app shall allow sign-up with email and password (minimum 8 characters). | M |
| FR-AUTH-02 | After email sign-up the app shall send a verification email and block access to app data until the email is verified. | M |
| FR-AUTH-03 | The app shall allow sign-in with a Google account. Google accounts are treated as verified. | M |
| FR-AUTH-04 | The app shall allow sign-in and sign-out with email and password. | M |
| FR-AUTH-05 | The app shall provide password reset by email. | M |
| FR-AUTH-06 | The app shall keep the user signed in across restarts until sign-out. | M |
| FR-AUTH-07 | The verification screen shall let the user resend the email and re-check status. | M |
| FR-AUTH-08 | The app shall let a user delete their account, which removes the Firestore profile and the authentication account after re-authentication. | S |
| FR-AUTH-09 | Error messages shall be shown in the selected language for wrong password, unknown account, weak password, duplicate email and no network. | M |

### 4.2 Profile and Availability (FR-PRO)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-PRO-01 | A new member shall complete a profile before using the app: name, blood group, phone, district, area. | M |
| FR-PRO-02 | Phone shall be validated as a Bangladeshi mobile number (11 digits, starts with 01, third digit 3 to 9). | M |
| FR-PRO-03 | Optional fields: last donation date and hide-phone switch. | M |
| FR-PRO-04 | The member shall confirm an eligibility self-declaration and see the disclaimer that hospital screening decides eligibility. | M |
| FR-PRO-05 | The member shall be able to turn availability on or off. | M |
| FR-PRO-06 | The app shall compute eligibility: available only if the switch is on and the donation gap has elapsed since last donation; otherwise show days remaining. | M |
| FR-PRO-07 | On saving the profile the app shall subscribe the device to the topic of the member’s blood group when available, and unsubscribe from it when unavailable or when the blood group changes. | M |
| FR-PRO-08 | The member shall be able to edit all profile fields. | M |

### 4.3 Blood Requests (FR-REQ)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-REQ-01 | A member shall create a request with: patient name, blood group, bags (1 to 10), hospital name, needed-by date and time, contact phone, urgent flag, optional note (max 300 characters). | M |
| FR-REQ-02 | Needed-by shall not be in the past. Contact phone shall pass the same validation as FR-PRO-02. | M |
| FR-REQ-03 | The member may set the hospital location by choosing from a preset list, dropping a pin on an OpenStreetMap view, or leaving it as name only. | S |
| FR-REQ-04 | A request shall have the status open, fulfilled, cancelled or expired. New requests start as open. | M |
| FR-REQ-05 | The app shall mark a request expired when 48 hours (configurable) have passed since needed-by. Expired requests shall not be shown in the open list. | M |
| FR-REQ-06 | The requester shall be able to mark the request fulfilled or cancelled and to edit the number of bags. | M |
| FR-REQ-07 | A member shall have at most 3 open requests at a time and shall be allowed at most 5 requests per 24 hours. The client shall check the first limit, the Worker shall enforce both. | M |
| FR-REQ-08 | The Requests tab shall list open requests in real time, newest first, with urgent requests visually distinct (Urgent colour badge). The list shall load at most 30 items and offer load more. | M |
| FR-REQ-09 | The request detail screen shall show all fields, status, responder count, and buttons for map, call and WhatsApp to the contact number. | M |
| FR-REQ-10 | The member shall be able to share a request as prefilled text through the system share sheet. | S |

### 4.4 Donor Responses (FR-RSP)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-RSP-01 | A member shall be able to tap I’m coming on an open request, creating one response per member per request. | M |
| FR-RSP-02 | The response shall include the donor’s name and, if the donor chooses, their phone number. | M |
| FR-RSP-03 | The requester shall see the live list of responders with call and WhatsApp buttons where a phone was shared. | M |
| FR-RSP-04 | A donor shall be able to withdraw their response. | S |
| FR-RSP-05 | A donor whose phone is hidden shall be asked at response time whether to share the number with this requester. | M |

### 4.5 Donor Directory (FR-DON)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-DON-01 | The Donors tab shall list members who are available, filterable by blood group, district and area. | M |
| FR-DON-02 | Each donor card shall show name, blood group, area and availability, and Call, WhatsApp and SMS buttons. | M |
| FR-DON-03 | If the donor has hide-phone on, the contact buttons shall be hidden and a note shall explain that the donor shares their number when responding to a request. | M |
| FR-DON-04 | The query shall return at most 50 donors per page with load more, and results shall be cached for the session. | M |
| FR-DON-05 | Call shall open the dialer with the number prefilled. WhatsApp shall open a chat to the number in international format (01XXXXXXXXX becomes 8801XXXXXXXXX). | M |

### 4.6 Notifications (FR-NTF)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-NTF-01 | After a request is saved, the app shall call the Worker with the request ID and the user’s Firebase ID token. | M |
| FR-NTF-02 | The Worker shall send a notification to the topic of every compatible group (Appendix A) of the request’s blood group. | M |
| FR-NTF-03 | The requester shall not be notified of their own request. | M |
| FR-NTF-04 | The notification shall carry title, body (group, bags, hospital, time), urgent flag and request ID as data fields. | M |
| FR-NTF-05 | The app shall display urgent requests on a high-importance channel with sound, and other requests on a default channel. | M |
| FR-NTF-06 | Tapping a notification shall open the request detail screen. | M |
| FR-NTF-07 | On Android 13 and above the app shall request the notification permission after sign-in and explain why. | M |
| FR-NTF-08 | If the Worker call fails, the app shall retry up to 3 times with backoff and show the requester that donors may not have been alerted, with a share button. | S |
| FR-NTF-09 | The app shall remind a donor when their donation gap has ended (local notification). | C |
| FR-NTF-10 | While the app is open, the open-requests list shall update in real time even when push fails. | M |

### 4.7 Map and Contact Actions (FR-MAP)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-MAP-01 | Every request card and detail screen shall show a map icon. | M |
| FR-MAP-02 | If latitude and longitude exist, tapping shall open the maps app at that point with the hospital name as label (geo: URI). | M |
| FR-MAP-03 | If coordinates do not exist, tapping shall open a maps search for the hospital name. | M |
| FR-MAP-04 | If no maps app handles the intent, the app shall open the equivalent https maps link in the browser. | M |

### 4.8 App Update (FR-UPD)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-UPD-01 | On start the app shall fetch Remote Config values latest\_version\_code, min\_version\_code and apk\_url. | M |
| FR-UPD-02 | If the installed version code is lower than latest, the app shall show a dismissible update dialog with a download button that opens apk\_url. | M |
| FR-UPD-03 | If lower than min\_version\_code, the dialog shall not be dismissible and the app shall block use until updated. | M |

### 4.9 Reporting and Moderation (FR-MOD)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-MOD-01 | A member shall be able to report a request or a donor with a reason. | M |
| FR-MOD-02 | Reports shall be stored in a collection readable only by admins through the console. | M |
| FR-MOD-03 | An admin shall be able to block a user by creating a document in blocked, and to delete any request. | M |
| FR-MOD-04 | A blocked user shall be unable to create or change requests, responses, reports or profile data. | M |
| FR-MOD-05 | The app shall include an in-app admin screen for reports and blocking. | C |

### 4.10 Settings and Localization (FR-SET)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-SET-01 | The app shall support Bangla (default) and English with all strings externalised. | M |
| FR-SET-02 | The app shall support light, dark and system theme. | M |
| FR-SET-03 | The app shall provide notification settings, About, Privacy notice and Disclaimer screens. | M |
| FR-SET-04 | The app shall provide an install and update guide screen explaining unknown-source installation. | S |

### 4.11 Donation History (FR-HIS, v1.1)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-HIS-01 | A donor shall be able to log a donation date, which updates last donation date and total donations. | C |
| FR-HIS-02 | The app shall show milestone badges for 1, 5, 10 and 25 donations. | C |
| FR-HIS-03 | The app shall show blood donation camps posted by admins. | C |

## 5. Non-Functional Requirements

### 5.1 Performance and Capacity

| ID | Requirement |
| --- | --- |
| NFR-PERF-01 | Cold start to the first usable screen shall take 3 seconds or less on the reference device (Android 10, 3 GB RAM). |
| NFR-PERF-02 | The Requests list shall show cached or fresh content within 2 seconds on 4G. |
| NFR-PERF-03 | The notification shall be handed to FCM within 60 seconds of request creation (95th percentile). |
| NFR-PERF-04 | The release APK shall be 25 MB or smaller. |
| NFR-CAP-01 | Within the Spark quotas the system shall support about 300 daily active users, budgeted at no more than 100 Firestore reads and 3 writes per user per day. |

### 5.2 Reliability and Availability

| ID | Requirement |
| --- | --- |
| NFR-REL-01 | Firestore offline persistence shall be enabled so previously loaded data stays readable without network. |
| NFR-REL-02 | If a free-tier quota is exhausted, the app shall show a friendly message and shall not crash. |
| NFR-REL-03 | Crash-free sessions shall be 99% or higher (Crashlytics). |
| NFR-REL-04 | The Worker shall be idempotent: a request already notified shall not be notified again. |

### 5.3 Security

| ID | Requirement |
| --- | --- |
| NFR-SEC-01 | Firestore security rules shall deny access by default and allow only the operations in section 7. |
| NFR-SEC-02 | The Firebase service account key shall exist only as a Worker secret and shall never be in the APK or in source control. |
| NFR-SEC-03 | The Worker shall verify the Firebase ID token and that the email is verified before sending anything. |
| NFR-SEC-04 | Release builds shall use R8 minification and be signed with a private keystore backed up in at least two safe locations. |
| NFR-SEC-05 | The app shall not log personal data (phone, email) to the console or analytics. |
| NFR-SEC-06 | The Firebase API key in google-services.json shall be treated as a public identifier, with real protection coming from rules and token verification. |

### 5.4 Privacy

| ID | Requirement |
| --- | --- |
| NFR-PRIV-01 | Sign-up shall show a clear notice that name, blood group, area and (unless hidden) phone number are visible to other verified members, with explicit consent. |
| NFR-PRIV-02 | Only data needed for the service shall be collected: no gender, address, national ID or photos. |
| NFR-PRIV-03 | Members shall be able to hide their phone number and delete their account. |
| NFR-PRIV-04 | Expired and cancelled requests shall be deleted after 90 days by a scheduled Worker or manual admin clean-up. |
| NFR-PRIV-05 | Processing shall respect applicable Bangladeshi law; the privacy notice shall be reviewed before release. |

### 5.5 Usability and Accessibility

| ID | Requirement |
| --- | --- |
| NFR-USE-01 | A new request shall be creatable in 60 seconds or less by a returning user. |
| NFR-USE-02 | Critical actions (new request, call, map) shall be reachable within 3 taps from the home screen. |
| NFR-USE-03 | The app shall support system font scaling up to 130% without clipped text. |
| NFR-USE-04 | Bangla text shall render with an embedded Bangla-capable font where the system font is insufficient. |

### 5.6 Compatibility, Maintainability and Observability

| ID | Requirement |
| --- | --- |
| NFR-COMP-01 | The app shall run on Android 8.0 (API 26) and above on phones in portrait. |
| NFR-MNT-01 | Code shall follow MVVM with a repository layer and unidirectional data flow. |
| NFR-MNT-02 | Unit tests shall cover blood compatibility, eligibility calculation, phone validation and WhatsApp number formatting. |
| NFR-OBS-01 | Analytics events: sign\_up, profile\_completed, request\_created, donor\_responded, call\_tapped, whatsapp\_tapped, map\_tapped. No personal data in event parameters. |
| NFR-COST-01 | Monthly cost shall be zero, with no billing account on any service. |

## 6. Data Requirements

### 6.1 Collection users/{uid}

| Field | Type | Rule |
| --- | --- | --- |
| name | string | 2 to 60 characters |
| phone | string | Bangladeshi mobile format |
| bloodGroup | string | One of A+, A−, B+, B−, AB+, AB−, O+, O− |
| district, area | string | Non-empty |
| isAvailable | boolean | Default true |
| lastDonation | timestamp | Optional, not in future |
| totalDonations | number | 0 or more |
| hidePhone | boolean | Default false |
| eligibilityDeclared | boolean | Must be true |
| createdAt, updatedAt | timestamp | Server time |

### 6.2 Collection requests/{requestId}

| Field | Type | Rule |
| --- | --- | --- |
| requesterUid | string | Equals the signed-in UID, immutable |
| patientName | string | 2 to 60 characters |
| bloodGroup | string | One of eight groups |
| bags | number | Integer 1 to 10 |
| hospital | string | Non-empty |
| lat, lng | number | Optional, valid ranges |
| neededAt | timestamp | Not in the past at creation |
| contactPhone | string | Valid format |
| note | string | Up to 300 characters, optional |
| isUrgent | boolean | Default false |
| status | string | open, fulfilled, cancelled, expired; open at creation |
| expiresAt | timestamp | neededAt plus expiry hours |
| notifiedAt | timestamp | Written only by the Worker |
| createdAt | timestamp | Server time, immutable |

Subcollection **responses/{uid}**: donorName (string), phone (string, only if shared), at (server timestamp).

### 6.3 Other Collections

| Collection | Purpose | Access |
| --- | --- | --- |
| reports/{id} | reporterUid, targetType (request or user), targetId, reason, at | Members create, nobody reads in app |
| blocked/{uid} | Block list | Console only |
| admins/{uid} | Admin list | Console only |

### 6.4 Remote Config Parameters

| Key | Default | Use |
| --- | --- | --- |
| latest\_version\_code | current build | Update prompt |
| min\_version\_code | 1 | Forced update |
| apk\_url | link | Download page |
| donation\_gap\_days | 90 | Eligibility |
| request\_expiry\_hours | 48 | Expiry |
| max\_open\_requests | 3 | Client limit |

### 6.5 Required Indexes

- requests: status ascending, createdAt descending.
- users: isAvailable, bloodGroup, district (as needed by the directory filters).

## 7. Security Rules Requirements

1. Reads and writes are allowed only for users with a verified email.
2. A user may create and update only their own users document and may not delete other profiles. Rules shall also allow an owner to delete their own profile (FR-AUTH-08).
3. A request may be created only if requesterUid equals the caller, bags is an integer from 1 to 10, status is open, and the caller is not in blocked. The client shall not be able to set notifiedAt.
4. A request may be updated or deleted only by its requester or an admin. Updates shall not change requesterUid, createdAt or notifiedAt.
5. A response may be written only by the donor whose UID is the document ID, and only if not blocked.
6. Reports may be created by verified, non-blocked members and shall not be readable by clients.
7. blocked and admins shall not be readable or writable by clients.

## 8. Notification Service Specification

**Endpoint:** HTTPS POST to the Worker’s /notify path. **Header:** Authorization with the Firebase ID token as a Bearer value. **Body field:** requestId.

**Processing steps**

1. Verify the ID token by calling Firebase’s account lookup with the project web API key; require email verified.
2. Read the request document using the service account.
3. Check that the requester equals the caller, status is open, and notifiedAt is empty.
4. Check that the caller is not in blocked.
5. Count the caller’s requests in the last 24 hours and reject if more than 5.
6. Compute compatible groups (Appendix A).
7. Send one FCM HTTP v1 data message per compatible topic (a topic condition supports at most 5 topics, so separate messages are used, at most 8).
8. Write notifiedAt on the request and return the number of topics sent.

**Responses:** 200 sent; 401 invalid token; 403 not the requester, unverified or blocked; 404 request not found; 409 already notified; 429 daily limit reached; 5xx temporary failure.

**Non-functional:** stateless; secrets stored as Worker secrets; stays within Cloudflare free plan request and subrequest limits (verify current limits).

## 9. Use Cases

### UC-01 Create request and notify donors

- **Actor:** Requester. **Precondition:** Verified member, profile complete, under limits.
- **Main flow:** Open New Request → fill fields → submit → app saves the request → app calls the Worker → Worker validates and sends to compatible topics → request appears in the open list with a responder count of 0.
- **Alternates:** Validation error → fields highlighted. Worker unavailable → retry and show share option (FR-NTF-08). Limit reached → message shown.
- **Postcondition:** Request is open and notifiedAt is set.

### UC-02 Donor responds to a request

- **Actor:** Donor. **Precondition:** Receives notification or opens the list.
- **Main flow:** Open request → review details → tap map icon to navigate → tap I’m coming → choose whether to share the phone → response saved.
- **Alternates:** Request already fulfilled or expired → button disabled with message.
- **Postcondition:** Requester sees the responder.

### UC-03 Find and contact a donor

- **Actor:** Any member. **Main flow:** Open Donors → filter → tap Call or WhatsApp.
- **Alternate:** Donor hides the phone → contact buttons are hidden.

### UC-04 Register and set up profile

- **Actor:** Visitor. **Main flow:** Sign up → verify email → complete profile and declaration → allow notifications → subscribe to blood group topic.
- **Alternate:** Google sign-in skips email verification.

### UC-05 Update the app

- **Actor:** Member. **Main flow:** App start → Remote Config shows a newer version → user taps Download → installs the new APK over the old one (same signing key).
- **Alternate:** Below minimum version → forced update screen.

## 10. Acceptance Criteria (key tests)

| ID | Scenario | Expected result | Req |
| --- | --- | --- | --- |
| TC-01 | Sign up with email, do not verify | Cannot read data; verification screen shown | FR-AUTH-02 |
| TC-02 | Sign in with Google (release APK) | Succeeds with release SHA-1 registered | FR-AUTH-03 |
| TC-03 | Invalid phone 12345 | Validation error | FR-PRO-02 |
| TC-04 | Request for A+ patient | Topics A+, A−, O+, O− receive the push; B+ does not | FR-NTF-02 |
| TC-05 | Request for AB+ | All 8 topics receive the push | FR-NTF-02 |
| TC-06 | Donor with last donation 30 days ago | Shown as unavailable with 60 days remaining | FR-PRO-06 |
| TC-07 | Tap map icon with coordinates | Maps app opens at the point | FR-MAP-02 |
| TC-08 | Tap map icon, no coordinates | Maps search for hospital name | FR-MAP-03 |
| TC-09 | Tap WhatsApp on 01712345678 | Chat opens for 8801712345678 | FR-DON-05 |
| TC-10 | Fourth open request by same user | Blocked with message | FR-REQ-07 |
| TC-11 | Sixth request in 24 hours | Worker returns 429 | FR-REQ-07 |
| TC-12 | Notify call repeated for same request | Worker returns 409, no second push | NFR-REL-04 |
| TC-13 | Blocked user creates a request | Write rejected by rules | FR-MOD-04 |
| TC-14 | Donor with hide-phone | Contact buttons hidden in directory | FR-DON-03 |
| TC-15 | Remote Config latest greater than installed | Update dialog shown | FR-UPD-02 |
| TC-16 | Airplane mode after loading | Cached requests still visible | NFR-REL-01 |
| TC-17 | Client tries to edit notifiedAt | Write rejected by rules | Section 7 |

## 11. Traceability (PRD stories to requirements)

| PRD story | Requirements |
| --- | --- |
| US-01, US-02 | FR-AUTH-01 to 07 |
| US-03, US-04, US-05, US-17 | FR-PRO-01 to 08, FR-DON-03 |
| US-06, US-07, US-08, US-15, US-16 | FR-REQ-01 to 10 |
| US-09 | FR-NTF-01 to 07, FR-NTF-10 |
| US-10 | FR-MAP-01 to 04 |
| US-11, US-12 | FR-RSP-01 to 05 |
| US-13, US-14 | FR-DON-01 to 05 |
| US-18, US-23, US-24 | FR-HIS-01 to 03, FR-NTF-09 |
| US-19 | FR-SET-01 to 02 |
| US-20 | FR-UPD-01 to 03 |
| US-21, US-22 | FR-MOD-01 to 05 |
| US-25 | FR-AUTH-08, NFR-PRIV-03 |

## Appendix A – Blood Group Compatibility

| Patient group | Compatible donor groups (topics notified) |
| --- | --- |
| A+ | A+, A−, O+, O− |
| A− | A−, O− |
| B+ | B+, B−, O+, O− |
| B− | B−, O− |
| AB+ | A+, A−, B+, B−, AB+, AB−, O+, O− |
| AB− | A−, B−, AB−, O− |
| O+ | O+, O− |
| O− | O− |

Topic naming: plus becomes pos and minus becomes neg, for example donor\_A\_pos and donor\_O\_neg.
