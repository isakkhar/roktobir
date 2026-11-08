# Security Specification — 0709 সনাতনী ব্লাড ব্যাংক

## 1. Data Invariants

1. **Verified Identity Invariant**: All reads and writes require `request.auth != null && request.auth.token.email_verified == true`. Unverified email accounts cannot read or write any collection (SRS FR-AUTH-02, Section 7.1).
2. **Moderation Block Invariant**: Any user whose UID exists in `/blocked/{uid}` is strictly prevented from creating, updating, or deleting profiles, requests, responses, or reports (SRS FR-MOD-04, Section 7.3).
3. **PII Split Isolation Invariant**: Raw private phone numbers and emails live in `/users_private/{userId}`, readable only by the owner (`request.auth.uid == userId`) or an admin. In `/users/{userId}`, if `hidePhone == true`, `publicContactPhone` MUST be `""` (empty string), ensuring hidden phone numbers are never exposed in the public donor directory (SRS FR-DON-03, Pillar 6).
4. **System-Only Field Guard (`notifiedAt`)**: Clients are strictly forbidden from writing `notifiedAt` on `/requests/{requestId}` (SRS Section 7.3, TC-17).
5. **Terminal State Locking on Requests**: Once a blood request enters a terminal status (`fulfilled`, `cancelled`, or `expired`), non-admin users cannot mutate it further (Pillar 6).
6. **Master Gate on Subcollection Responses**: Creating or updating `/requests/{requestId}/responses/{donorUid}` requires `donorUid == request.auth.uid` and verifies that the parent `/requests/{requestId}` document exists and is `open` (Pillar 1).
7. **Temporal Integrity**: `createdAt` must equal `request.time` on creation and remain immutable on update; `updatedAt` must equal `request.time` on every write.

## 2. The "Dirty Dozen" Payloads

1. **Shadow Field Injection on DonorProfile**: Adding `"isAdmin": true` to `/users/{uid}` -> Rejected by `hasOnly()`.
2. **Unverified Email Spoofing**: Calling any read or write with `email_verified: false` -> Rejected by `isVerifiedUser()`.
3. **Cross-User Profile Hijack**: Authenticated user `uid_A` attempting to create or update `/users/uid_B` -> Rejected by `userId == request.auth.uid && data.uid == request.auth.uid`.
4. **PII Leak when `hidePhone` is true**: Writing `/users/{uid}` with `hidePhone: true` and `publicContactPhone: "01712345678"` -> Rejected by `isValidDonorProfile`.
5. **Unauthorized Private PII Read**: Authenticated user `uid_A` attempting `get` on `/users_private/uid_B` -> Rejected by `request.auth.uid == userId || isAdmin()`.
6. **Client Spoofing `notifiedAt` on BloodRequest (TC-17)**: Sending `notifiedAt` in `/requests/{requestId}` create or update -> Rejected by `hasOnly()`.
7. **Out-of-Bounds Blood Bags**: Creating a request with `bags: 25` or `bags: 0` -> Rejected by `data.bags is int && data.bags >= 1 && data.bags <= 10`.
8. **Invalid Bangladeshi Phone Format (TC-03)**: Submitting `contactPhone: "12345"` -> Rejected by `.matches('^01[3-9][0-9]{8}$')`.
9. **Blocked User Write Attempt (TC-13)**: A user listed in `/blocked/{uid}` attempting to create a blood request -> Rejected by `isNotBlocked()`.
10. **Terminal State Re-opening**: Requester attempting to update a `fulfilled` request back to `open` -> Rejected by terminal state lock `existing().status == 'open'`.
11. **Orphaned or Closed-Request Response**: Donor attempting to write `/requests/{requestId}/responses/{uid}` when the parent request does not exist or is already `cancelled` -> Rejected by Master Gate `get()` on parent request.
12. **Client Reading Moderation Reports**: Non-admin user attempting `get` or `list` on `/reports` -> Rejected by `isAdmin()`.
