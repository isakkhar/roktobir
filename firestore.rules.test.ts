/**
 * Firestore Security Rules Specification Tests (Dirty Dozen Verification)
 * Verifies all 12 adversarial payloads from security_spec.md are denied.
 */

export interface DirtyDozenTestCase {
  id: string;
  description: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenTestCase[] = [
  {
    id: 'DD-01',
    description: 'Shadow field injection (isAdmin: true) on DonorProfile',
    collectionPath: '/users/user_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    payload: { uid: 'user_1', name: 'Tanvir', isAdmin: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-02',
    description: 'Unverified email attempting to read requests (TC-01)',
    collectionPath: '/requests/req_1',
    operation: 'get',
    auth: { uid: 'user_1', email: 'unverified@example.com', email_verified: false },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-03',
    description: 'Cross-user profile overwrite attempt',
    collectionPath: '/users/user_2',
    operation: 'update',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    payload: { name: 'Spoofed Name' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-04',
    description: 'Leaking publicContactPhone while hidePhone is true',
    collectionPath: '/users/user_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    payload: { hidePhone: true, publicContactPhone: '01712345678' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-05',
    description: 'Non-owner attempting to read isolated PII in /users_private',
    collectionPath: '/users_private/user_2',
    operation: 'get',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-06',
    description: 'Client attempting to set notifiedAt on BloodRequest (TC-17)',
    collectionPath: '/requests/req_1',
    operation: 'update',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    payload: { notifiedAt: '2026-11-08T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-07',
    description: 'Creating a blood request with 25 bags (max is 10)',
    collectionPath: '/requests/req_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    payload: { bags: 25 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-08',
    description: 'Invalid Bangladeshi phone number 12345 (TC-03)',
    collectionPath: '/requests/req_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    payload: { contactPhone: '12345' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-09',
    description: 'Blocked user attempting to create a blood request (TC-13)',
    collectionPath: '/requests/req_blocked',
    operation: 'create',
    auth: { uid: 'blocked_user_1', email: 'blocked@example.com', email_verified: true },
    payload: { status: 'open', bags: 2 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-10',
    description: 'Re-opening a fulfilled blood request (Terminal State Lock)',
    collectionPath: '/requests/req_fulfilled',
    operation: 'update',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    payload: { status: 'open' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-11',
    description: 'Responding to a non-existent or closed parent request (Master Gate)',
    collectionPath: '/requests/req_closed/responses/user_2',
    operation: 'create',
    auth: { uid: 'user_2', email: 'user2@example.com', email_verified: true },
    payload: { requestId: 'req_closed', donorUid: 'user_2', status: 'coming' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-12',
    description: 'Non-admin attempting to read moderation abuse reports (FR-MOD-02)',
    collectionPath: '/reports/rep_1',
    operation: 'get',
    auth: { uid: 'user_1', email: 'user1@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
];
