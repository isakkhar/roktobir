/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  deleteUser,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  Timestamp,
} from 'firebase/firestore';
import {
  AlertTriangle,
  Award,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  Code2,
  Compass,
  Droplet,
  ExternalLink,
  Flag,
  Globe,
  HeartHandshake,
  Info,
  LogOut,
  MapPin,
  MessageCircle,
  Moon,
  Navigation,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Share2,
  ShieldAlert,
  Sun,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  BD_DISTRICTS,
  BLOOD_GROUPS,
  BloodGroup,
  buildAndroidGeoUri,
  buildBrowserMapUrl,
  buildWhatsAppUrl,
  calculateDistanceKm,
  COMPATIBLE_DONOR_GROUPS,
  computeDonorEligibility,
  formatWhatsAppNumber,
  getCompatibleFcmTopics,
  getDonorMilestones,
  getFcmTopicForBloodGroup,
  isValidBangladeshPhone,
  PRESET_HOSPITALS,
} from './utils/bloodBankLogic';
import { Language, TRANSLATIONS } from './translations';
import { OsmMapComponent, MapMarkerItem } from './components/OsmMapComponent';
import { AndroidCodeStudioView } from './components/AndroidCodeStudioModal';

export interface DonorProfileDoc {
  uid: string;
  name: string;
  bloodGroup: BloodGroup;
  district: string;
  area: string;
  lat: number;
  lng: number;
  isAvailable: boolean;
  lastDonationMs: number;
  lastDonationDate: string;
  totalDonations: number;
  hidePhone: boolean;
  publicContactPhone: string;
  eligibilityDeclared: boolean;
  fcmTopic: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface BloodRequestDoc {
  id: string;
  requesterUid: string;
  requesterName: string;
  patientName: string;
  bloodGroup: BloodGroup;
  bags: number;
  hospital: string;
  district: string;
  area: string;
  lat: number;
  lng: number;
  hasPin: boolean;
  neededAtMs: number;
  neededAtIso: string;
  contactPhone: string;
  note: string;
  isUrgent: boolean;
  status: 'open' | 'fulfilled' | 'cancelled' | 'expired';
  responderCount: number;
  expiresAtMs: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface DonorResponseDoc {
  requestId: string;
  donorUid: string;
  donorName: string;
  donorBloodGroup: BloodGroup;
  sharedPhone: string;
  status: 'coming' | 'donated';
  lat: number;
  lng: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AbuseReportDoc {
  id: string;
  reporterUid: string;
  targetType: 'request' | 'user';
  targetId: string;
  targetName: string;
  reason: string;
  status: 'pending' | 'resolved';
  createdAt?: Timestamp;
}

export interface DonationCampDoc {
  id: string;
  title: string;
  organizer: string;
  district: string;
  location: string;
  dateIso: string;
  contactPhone: string;
  createdByUid: string;
  createdAt?: Timestamp;
}

type ActiveTab = 'requests' | 'donors' | 'new-request' | 'map' | 'kotlin' | 'profile' | 'admin';

export default function App() {
  // Localization & Theme (SRS FR-SET-01 & FR-SET-02: Bangla default, light/dark mode)
  const [lang, setLang] = useState<Language>('bn');
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const t = TRANSLATIONS[lang];

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  // Auth & Profile state
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [myProfile, setMyProfile] = useState<DonorProfileDoc | null>(null);
  const [myPrivatePhone, setMyPrivatePhone] = useState<string>('');
  const [isBlockedUser, setIsBlockedUser] = useState<boolean>(false);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);

  // Navigation & Selected Request Detail
  const [activeTab, setActiveTab] = useState<ActiveTab>('requests');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [responsesForSelected, setResponsesForSelected] = useState<DonorResponseDoc[]>([]);

  // Live Firestore Collections
  const [requests, setRequests] = useState<BloodRequestDoc[]>([]);
  const [donors, setDonors] = useState<DonorProfileDoc[]>([]);
  const [camps, setCamps] = useState<DonationCampDoc[]>([]);
  const [reports, setReports] = useState<AbuseReportDoc[]>([]);

  // User's live GPS coordinates (default Dhaka center)
  const [userLat, setUserLat] = useState<number>(23.7389);
  const [userLng, setUserLng] = useState<number>(90.3948);
  const [gpsStatus, setGpsStatus] = useState<string>('');

  // Remote Config Tunables (SRS Section 6.4)
  const [remoteConfig] = useState({
    installedVersionCode: 1,
    latestVersionCode: 1,
    minVersionCode: 1,
    apkUrl: 'https://github.com/0709-blood-bank/releases/latest',
    donationGapDays: 90,
    requestExpiryHours: 48,
    maxOpenRequests: 3,
  });

  // Feedback banners & modals
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    type: 'request' | 'user';
    id: string;
    name: string;
  } | null>(null);
  const [reportReason, setReportReason] = useState<string>('');

  // Phone sharing prompt when a hidden-phone donor taps "I'm Coming" (SRS FR-RSP-05)
  const [comingModalRequest, setComingModalRequest] = useState<BloodRequestDoc | null>(null);
  const [sharePhoneOnResponse, setSharePhoneOnResponse] = useState<boolean>(true);

  // Filters for Donor Directory & Requests
  const [donorFilterGroup, setDonorFilterGroup] = useState<BloodGroup | 'ALL'>('ALL');
  const [patientMatchGroup, setPatientMatchGroup] = useState<BloodGroup | 'NONE'>('NONE');
  const [donorFilterDistrict, setDonorFilterDistrict] = useState<string>('ALL');
  const [donorSearchArea, setDonorSearchArea] = useState<string>('');
  const [donorAvailableOnly, setDonorAvailableOnly] = useState<boolean>(true);
  const [requestFilterGroup, setRequestFilterGroup] = useState<BloodGroup | 'ALL'>('ALL');
  const [requestFilterUrgentOnly, setRequestFilterUrgentOnly] = useState<boolean>(false);

  // Profile Form State
  const [profName, setProfName] = useState<string>('');
  const [profBloodGroup, setProfBloodGroup] = useState<BloodGroup>('O+');
  const [profPhone, setProfPhone] = useState<string>('');
  const [profDistrict, setProfDistrict] = useState<string>('Dhaka');
  const [profArea, setProfArea] = useState<string>('Shahbagh');
  const [profLat, setProfLat] = useState<number>(23.7389);
  const [profLng, setProfLng] = useState<number>(90.3948);
  const [profAvailable, setProfAvailable] = useState<boolean>(true);
  const [profLastDonationDate, setProfLastDonationDate] = useState<string>('');
  const [profTotalDonations, setProfTotalDonations] = useState<number>(0);
  const [profHidePhone, setProfHidePhone] = useState<boolean>(false);
  const [profDeclared, setProfDeclared] = useState<boolean>(false);
  const [savingProfile, setSavingProfile] = useState<boolean>(false);

  // New Request Form State (SRS FR-REQ-01..03)
  const [reqPatientName, setReqPatientName] = useState<string>('');
  const [reqBloodGroup, setReqBloodGroup] = useState<BloodGroup>('A+');
  const [reqBags, setReqBags] = useState<number>(2);
  const [reqPresetHospitalId, setReqPresetHospitalId] = useState<string>('dmch');
  const [reqHospitalName, setReqHospitalName] = useState<string>(
    PRESET_HOSPITALS[0].nameBn
  );
  const [reqDistrict, setReqDistrict] = useState<string>('Dhaka');
  const [reqArea, setReqArea] = useState<string>('Shahbagh');
  const [reqLat, setReqLat] = useState<number>(PRESET_HOSPITALS[0].lat);
  const [reqLng, setReqLng] = useState<number>(PRESET_HOSPITALS[0].lng);
  const [reqHasPin, setReqHasPin] = useState<boolean>(true);
  const [reqNeededByInput, setReqNeededByInput] = useState<string>(() => {
    const d = new Date(Date.now() + 4 * 3600 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [reqContactPhone, setReqContactPhone] = useState<string>('');
  const [reqNote, setReqNote] = useState<string>('');
  const [reqIsUrgent, setReqIsUrgent] = useState<boolean>(true);
  const [submittingRequest, setSubmittingRequest] = useState<boolean>(false);

  // Admin New Camp Form State
  const [campTitle, setCampTitle] = useState<string>('');
  const [campOrganizer, setCampOrganizer] = useState<string>('0709 সনাতনী ব্লাড ব্যাংক');
  const [campDistrict, setCampDistrict] = useState<string>('Dhaka');
  const [campLocation, setCampLocation] = useState<string>('');
  const [campDateIso, setCampDateIso] = useState<string>('2026-11-20');
  const [campPhone, setCampPhone] = useState<string>('01712345678');

  const notifyBanner = (type: 'success' | 'error' | 'info', text: string) => {
    setBannerMessage({ type, text });
    setTimeout(() => {
      setBannerMessage((prev) => (prev?.text === text ? null : prev));
    }, 5500);
  };

  // 1. Auth State Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);

      if (!currentUser) {
        setMyProfile(null);
        setMyPrivatePhone('');
        setIsAdminUser(false);
        setIsBlockedUser(false);
        return;
      }

      // Check bootstrapped admin email or /admins/{uid}
      const isBootstrapAdmin = currentUser.email === 'sakkhar07@gmail.com';
      try {
        const adminSnap = await getDoc(doc(db, 'admins', currentUser.uid));
        setIsAdminUser(isBootstrapAdmin || adminSnap.exists());
      } catch {
        setIsAdminUser(isBootstrapAdmin);
      }

      try {
        const blockedSnap = await getDoc(doc(db, 'blocked', currentUser.uid));
        setIsBlockedUser(blockedSnap.exists());
      } catch {
        setIsBlockedUser(false);
      }

      // Load user's private PII phone from /users_private/{uid}
      try {
        const privSnap = await getDoc(doc(db, 'users_private', currentUser.uid));
        if (privSnap.exists()) {
          const privData = privSnap.data();
          if (typeof privData.phone === 'string') {
            setMyPrivatePhone(privData.phone);
            setProfPhone(privData.phone);
            setReqContactPhone(privData.phone);
          }
        }
      } catch {
        // ignore if not created yet
      }
    });
    return () => unsub();
  }, []);

  // 2. Real-Time Listener for My DonorProfile (/users/{uid})
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) return;
    const path = `users/${user.uid}`;
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as DonorProfileDoc;
          setMyProfile(data);
          setProfName(data.name || user.displayName || '');
          setProfBloodGroup(data.bloodGroup || 'O+');
          setProfDistrict(data.district || 'Dhaka');
          setProfArea(data.area || 'Shahbagh');
          setProfLat(data.lat || 23.7389);
          setProfLng(data.lng || 90.3948);
          setProfAvailable(Boolean(data.isAvailable));
          setProfLastDonationDate(data.lastDonationDate || '');
          setProfTotalDonations(data.totalDonations || 0);
          setProfHidePhone(Boolean(data.hidePhone));
          setProfDeclared(Boolean(data.eligibilityDeclared));
          if (data.publicContactPhone) {
            setProfPhone(data.publicContactPhone);
            if (!reqContactPhone) setReqContactPhone(data.publicContactPhone);
          }
          if (data.lat && data.lng) {
            setUserLat(data.lat);
            setUserLng(data.lng);
          }
        } else {
          setMyProfile(null);
          setProfName(user.displayName || '');
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, path)
    );
    return () => unsub();
  }, [authReady, user]);

  // 3. Real-Time Listener for Blood Requests (/requests)
  // Enforces query constraints matching firestore.rules allow list
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) return;
    const q = query(
      collection(db, 'requests'),
      where('bags', '>=', 1),
      where('status', 'in', ['open', 'fulfilled', 'cancelled', 'expired'])
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const nowMs = Date.now();
        const items: BloodRequestDoc[] = snap.docs.map((d) => {
          const raw = d.data() as Omit<BloodRequestDoc, 'id'>;
          // SRS FR-REQ-05: Automatically mark expired in UI if 48h past neededAt
          const isPastExpiry =
            raw.status === 'open' && raw.expiresAtMs && nowMs > raw.expiresAtMs;
          return {
            ...raw,
            id: d.id,
            status: isPastExpiry ? 'expired' : raw.status,
          };
        });
        // Sort urgent first, then newest first
        items.sort((a, b) => {
          if (a.status === 'open' && b.status !== 'open') return -1;
          if (a.status !== 'open' && b.status === 'open') return 1;
          if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
          return (b.neededAtMs || 0) - (a.neededAtMs || 0);
        });
        setRequests(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'requests')
    );
    return () => unsub();
  }, [authReady, user]);

  // 4. Real-Time Listener for Donor Directory (/users)
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) return;
    const q = query(
      collection(db, 'users'),
      where('eligibilityDeclared', '==', true)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: DonorProfileDoc[] = snap.docs.map(
          (d) => d.data() as DonorProfileDoc
        );
        setDonors(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );
    return () => unsub();
  }, [authReady, user]);

  // 5. Real-Time Listener for Selected Request's Responses (/requests/{id}/responses)
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified || !selectedRequestId) {
      setResponsesForSelected([]);
      return;
    }
    const subPath = `requests/${selectedRequestId}/responses`;
    const q = query(
      collection(db, 'requests', selectedRequestId, 'responses'),
      where('requestId', '==', selectedRequestId),
      where('status', 'in', ['coming', 'donated'])
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as DonorResponseDoc);
        setResponsesForSelected(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, subPath)
    );
    return () => unsub();
  }, [authReady, user, selectedRequestId]);

  // 6. Real-Time Listener for Donation Camps (/camps)
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) return;
    const q = query(collection(db, 'camps'), where('title', '>=', '   '));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: DonationCampDoc[] = snap.docs.map((d) => ({
          ...(d.data() as Omit<DonationCampDoc, 'id'>),
          id: d.id,
        }));
        setCamps(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'camps')
    );
    return () => unsub();
  }, [authReady, user]);

  // 7. Real-Time Listener for Admin Moderation Reports (/reports)
  useEffect(() => {
    if (!authReady || !user || !isAdminUser) return;
    const q = query(
      collection(db, 'reports'),
      where('status', 'in', ['pending', 'resolved'])
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: AbuseReportDoc[] = snap.docs.map((d) => ({
          ...(d.data() as Omit<AbuseReportDoc, 'id'>),
          id: d.id,
        }));
        setReports(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'reports')
    );
    return () => unsub();
  }, [authReady, user, isAdminUser]);

  // Request Live Geolocation from Browser
  const handleDetectGpsLocation = () => {
    if (!navigator.geolocation) {
      notifyBanner('error', 'Geolocation is not supported by this browser.');
      return;
    }
    setGpsStatus('Detecting GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 100000) / 100000;
        const lng = Math.round(pos.coords.longitude * 100000) / 100000;
        setUserLat(lat);
        setUserLng(lng);
        setProfLat(lat);
        setProfLng(lng);
        setGpsStatus(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        notifyBanner(
          'success',
          lang === 'bn'
            ? `আপনার লাইভ জিপিএস লোকেশন আপডেট হয়েছে (${lat.toFixed(4)}, ${lng.toFixed(4)})`
            : `Live GPS coordinates updated (${lat.toFixed(4)}, ${lng.toFixed(4)})`
        );
      },
      () => {
        setGpsStatus('');
        notifyBanner(
          'info',
          lang === 'bn'
            ? 'জিপিএস অনুমতি পাওয়া যায়নি। ম্যাপে ক্লিক করে আপনার লোকেশন পিন করুন।'
            : 'GPS permission declined. Click directly on the OpenStreetMap to pin your location.'
        );
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Sign In with Google
  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      notifyBanner(
        'error',
        error instanceof Error ? error.message : 'Google Sign-In failed.'
      );
    }
  };

  // Save Donor Profile (SRS FR-PRO-01..08 & PII Split Isolation)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const cleanName = profName.trim().slice(0, 60);
    const cleanPhone = profPhone.trim();
    const cleanArea = profArea.trim().slice(0, 80);

    if (cleanName.length < 2) {
      notifyBanner(
        'error',
        lang === 'bn'
          ? 'অনুগ্রহ করে কমপক্ষে ২ অক্ষরের পূর্ণ নাম লিখুন।'
          : 'Please enter a valid full name (2–60 characters).'
      );
      return;
    }

    if (!isValidBangladeshPhone(cleanPhone)) {
      notifyBanner(
        'error',
        lang === 'bn'
          ? 'সঠিক ১১ ডিজিটের বাংলাদেশি মোবাইল নম্বর দিন (যেমন 01712345678)। (FR-PRO-02)'
          : 'Invalid Bangladeshi phone number. Must be 11 digits starting with 01[3-9] (FR-PRO-02).'
      );
      return;
    }

    if (!profDeclared) {
      notifyBanner(
        'error',
        lang === 'bn'
          ? 'রক্তদানের যোগ্যতার স্ব-ঘোষণা বক্সে টিক দিন (FR-PRO-04)।'
          : 'Please confirm the donor eligibility self-declaration checkbox (FR-PRO-04).'
      );
      return;
    }

    let lastDonationMs = 0;
    if (profLastDonationDate) {
      const parsed = Date.parse(profLastDonationDate);
      if (!Number.isNaN(parsed)) {
        if (parsed > Date.now()) {
          notifyBanner(
            'error',
            lang === 'bn'
              ? 'সর্বশেষ রক্তদানের তারিখ ভবিষ্যতের হতে পারবে না।'
              : 'Last donation date cannot be in the future.'
          );
          return;
        }
        lastDonationMs = parsed;
      }
    }

    setSavingProfile(true);
    const elig = computeDonorEligibility(
      profAvailable,
      lastDonationMs,
      Date.now(),
      remoteConfig.donationGapDays
    );
    const fcmTopic = elig.isEligibleNow
      ? getFcmTopicForBloodGroup(profBloodGroup)
      : 'unsubscribed';

    try {
      // 1. Save isolated PII in /users_private/{uid}
      await setDoc(doc(db, 'users_private', user.uid), {
        uid: user.uid,
        phone: cleanPhone,
        email: (user.email || 'member@0709.org').slice(0, 120),
        updatedAt: serverTimestamp(),
      });

      // 2. Save public directory profile in /users/{uid}
      // When hidePhone is true, publicContactPhone is strictly '' (Pillar 6 PII isolation)
      const userDocRef = doc(db, 'users', user.uid);
      const profilePayload = {
        uid: user.uid,
        name: cleanName,
        bloodGroup: profBloodGroup,
        district: profDistrict,
        area: cleanArea || 'Sadar',
        lat: Number(profLat) || 23.7389,
        lng: Number(profLng) || 90.3948,
        isAvailable: Boolean(profAvailable),
        lastDonationMs,
        lastDonationDate: profLastDonationDate ? profLastDonationDate.slice(0, 30) : '',
        totalDonations: Math.max(0, Math.min(500, Math.floor(Number(profTotalDonations) || 0))),
        hidePhone: Boolean(profHidePhone),
        publicContactPhone: profHidePhone ? '' : cleanPhone,
        eligibilityDeclared: true,
        fcmTopic,
        createdAt: myProfile?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(userDocRef, profilePayload);
      setMyPrivatePhone(cleanPhone);

      notifyBanner(
        'success',
        lang === 'bn'
          ? `প্রোফাইল সংরক্ষিত হয়েছে! FCM টপিক: ${fcmTopic}`
          : `Profile saved! Subscribed FCM Topic: ${fcmTopic}`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    } finally {
      setSavingProfile(false);
    }
  };

  // Create Emergency Blood Request (SRS FR-REQ-01..07)
  const myOpenRequestsCount = useMemo(() => {
    if (!user) return 0;
    return requests.filter(
      (r) => r.requesterUid === user.uid && r.status === 'open'
    ).length;
  }, [requests, user]);

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !myProfile) {
      notifyBanner(
        'error',
        lang === 'bn'
          ? 'আবেদন করার আগে আপনার প্রোফাইল সম্পন্ন করুন।'
          : 'Please complete your donor/member profile before posting a request.'
      );
      setActiveTab('profile');
      return;
    }

    // SRS FR-REQ-07 / TC-10: At most 3 open requests at a time
    if (myOpenRequestsCount >= remoteConfig.maxOpenRequests) {
      notifyBanner('error', t.maxOpenRequestsWarning);
      return;
    }

    const cleanPatient = reqPatientName.trim().slice(0, 60);
    const cleanHospital = reqHospitalName.trim().slice(0, 120);
    const cleanContact = reqContactPhone.trim();
    const cleanNote = reqNote.trim().slice(0, 300);

    if (cleanPatient.length < 2 || cleanHospital.length < 2) {
      notifyBanner(
        'error',
        lang === 'bn'
          ? 'রোগীর নাম ও হাসপাতালের নাম সঠিকভাবে লিখুন।'
          : 'Please enter valid patient and hospital names.'
      );
      return;
    }

    if (!isValidBangladeshPhone(cleanContact)) {
      notifyBanner(
        'error',
        lang === 'bn'
          ? 'সঠিক ১১ ডিজিটের যোগাযোগের মোবাইল নম্বর দিন (01[3-9]XXXXXXXX)।'
          : 'Invalid contact phone number. Must be 11 digits starting with 01[3-9].'
      );
      return;
    }

    const neededAtMs = Date.parse(reqNeededByInput);
    if (Number.isNaN(neededAtMs) || neededAtMs < Date.now() - 5 * 60 * 1000) {
      notifyBanner(
        'error',
        lang === 'bn'
          ? 'প্রয়োজনের সময় অতীতের হতে পারবে না (FR-REQ-02)।'
          : 'Needed-by date and time cannot be in the past (FR-REQ-02).'
      );
      return;
    }

    const bagsInt = Math.max(1, Math.min(10, Math.floor(Number(reqBags) || 1)));
    const expiresAtMs =
      neededAtMs + remoteConfig.requestExpiryHours * 3600 * 1000;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    setSubmittingRequest(true);
    try {
      await setDoc(doc(db, 'requests', requestId), {
        requesterUid: user.uid,
        requesterName: myProfile.name.slice(0, 60),
        patientName: cleanPatient,
        bloodGroup: reqBloodGroup,
        bags: bagsInt,
        hospital: cleanHospital,
        district: reqDistrict.slice(0, 60),
        area: (reqArea.trim() || 'Hospital Area').slice(0, 80),
        lat: reqHasPin ? Number(reqLat) || 23.7258 : 0,
        lng: reqHasPin ? Number(reqLng) || 90.3976 : 0,
        hasPin: Boolean(reqHasPin),
        neededAtMs,
        neededAtIso: new Date(neededAtMs).toISOString().slice(0, 16).replace('T', ' '),
        contactPhone: cleanContact,
        note: cleanNote,
        isUrgent: Boolean(reqIsUrgent),
        status: 'open',
        responderCount: 0,
        expiresAtMs,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const notifiedTopics = getCompatibleFcmTopics(reqBloodGroup);
      setReqPatientName('');
      setReqNote('');
      setSelectedRequestId(requestId);
      setActiveTab('requests');

      notifyBanner(
        'success',
        lang === 'bn'
          ? `আবেদন প্রকাশিত হয়েছে! সামঞ্জস্যপূর্ণ টপিকে (${notifiedTopics.join(', ')}) নোটিফিকেশন পাঠানো হয়েছে।`
          : `Blood request published! Push dispatched to compatible topics: ${notifiedTopics.join(', ')}`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `requests/${requestId}`);
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Donor Taps "I'm Coming" (SRS FR-RSP-01..05)
  const handleInitiateImComing = (reqItem: BloodRequestDoc) => {
    if (!user || !myProfile) {
      notifyBanner(
        'error',
        lang === 'bn'
          ? 'সাড়া দেওয়ার আগে অনুগ্রহ করে আপনার রক্তদাতা প্রোফাইল সম্পন্ন করুন।'
          : 'Please complete your donor profile before responding to a request.'
      );
      setActiveTab('profile');
      return;
    }
    if (myProfile.hidePhone) {
      // SRS FR-RSP-05: A donor whose phone is hidden shall be asked at response time whether to share the number
      setSharePhoneOnResponse(true);
      setComingModalRequest(reqItem);
    } else {
      void submitDonorResponse(reqItem, true);
    }
  };

  const submitDonorResponse = async (
    reqItem: BloodRequestDoc,
    shouldSharePhone: boolean
  ) => {
    if (!user || !myProfile) return;
    const responseDocRef = doc(
      db,
      'requests',
      reqItem.id,
      'responses',
      user.uid
    );
    const phoneToShare = shouldSharePhone
      ? myPrivatePhone || myProfile.publicContactPhone || ''
      : '';

    try {
      const existingSnap = await getDoc(responseDocRef);
      const isNewResponse = !existingSnap.exists();

      await setDoc(responseDocRef, {
        requestId: reqItem.id,
        donorUid: user.uid,
        donorName: myProfile.name.slice(0, 60),
        donorBloodGroup: myProfile.bloodGroup,
        sharedPhone: isValidBangladeshPhone(phoneToShare) ? phoneToShare : '',
        status: 'coming',
        lat: userLat || myProfile.lat || 23.7389,
        lng: userLng || myProfile.lng || 90.3948,
        createdAt: isNewResponse
          ? serverTimestamp()
          : existingSnap.data()?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (isNewResponse) {
        await updateDoc(doc(db, 'requests', reqItem.id), {
          responderCount: (reqItem.responderCount || 0) + 1,
          updatedAt: serverTimestamp(),
        });
      }

      setComingModalRequest(null);
      setSelectedRequestId(reqItem.id);
      notifyBanner(
        'success',
        lang === 'bn'
          ? 'ধন্যবাদ! আপনি "আমি আসছি" হিসেবে তালিকাভুক্ত হয়েছেন।'
          : 'Thank you! Your response ("I’m coming") is now live for the requester.'
      );
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `requests/${reqItem.id}/responses/${user.uid}`
      );
    }
  };

  // Withdraw donor response (SRS FR-RSP-04)
  const handleWithdrawResponse = async (reqItem: BloodRequestDoc) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'requests', reqItem.id, 'responses', user.uid));
      if (reqItem.responderCount > 0) {
        await updateDoc(doc(db, 'requests', reqItem.id), {
          responderCount: Math.max(0, reqItem.responderCount - 1),
          updatedAt: serverTimestamp(),
        });
      }
      notifyBanner(
        'info',
        lang === 'bn'
          ? 'আপনার সাড়া প্রত্যাহার করা হয়েছে।'
          : 'Your response has been withdrawn.'
      );
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `requests/${reqItem.id}/responses/${user.uid}`
      );
    }
  };

  // Requester updates request status or bags (SRS FR-REQ-06)
  const handleUpdateRequestStatus = async (
    reqItem: BloodRequestDoc,
    newStatus: 'fulfilled' | 'cancelled',
    newBags?: number
  ) => {
    try {
      await updateDoc(doc(db, 'requests', reqItem.id), {
        status: newStatus,
        bags: newBags ?? reqItem.bags,
        updatedAt: serverTimestamp(),
      });
      notifyBanner(
        'success',
        lang === 'bn'
          ? `আবেদনের স্ট্যাটাস "${newStatus}" এ আপডেট হয়েছে।`
          : `Request marked as ${newStatus}.`
      );
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `requests/${reqItem.id}`
      );
    }
  };

  // Log a completed donation today (SRS FR-HIS-01)
  const handleLogDonationToday = async () => {
    if (!user || !myProfile) return;
    const todayIso = new Date().toISOString().split('T')[0];
    const nowMs = Date.now();
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        lastDonationMs: nowMs,
        lastDonationDate: todayIso,
        totalDonations: (myProfile.totalDonations || 0) + 1,
        fcmTopic: 'unsubscribed',
        updatedAt: serverTimestamp(),
      });
      notifyBanner(
        'success',
        lang === 'bn'
          ? 'অভিনন্দন! আপনার রক্তদান রেকর্ড করা হয়েছে। আগামী ৯০ দিন আপনার নোটিফিকেশন বিরতি থাকবে।'
          : 'Donation logged! Your 90-day recovery countdown has started.'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  // Submit Abuse Report (SRS FR-MOD-01)
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !reportTarget) return;
    const cleanReason = reportReason.trim().slice(0, 300);
    if (cleanReason.length < 3) return;

    const reportId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      await setDoc(doc(db, 'reports', reportId), {
        reporterUid: user.uid,
        targetType: reportTarget.type,
        targetId: reportTarget.id,
        targetName: reportTarget.name.slice(0, 100),
        reason: cleanReason,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setReportTarget(null);
      setReportReason('');
      notifyBanner(
        'success',
        lang === 'bn'
          ? 'রিপোর্ট জমা হয়েছে। অ্যাডমিন টিম এটি পর্যালোচনা করবেন।'
          : 'Report submitted to community moderators.'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `reports/${reportId}`);
    }
  };

  // Share Request (SRS FR-REQ-10)
  const handleShareRequest = async (reqItem: BloodRequestDoc) => {
    const mapUrl = buildBrowserMapUrl(
      reqItem.hospital,
      reqItem.lat,
      reqItem.lng,
      reqItem.hasPin
    );
    const shareText =
      lang === 'bn'
        ? `🩸 জরুরি রক্তের আবেদন (0709 সনাতনী ব্লাড ব্যাংক)\nরক্তের গ্রুপ: ${reqItem.bloodGroup} (${reqItem.bags} ব্যাগ)\nরোগী: ${reqItem.patientName}\nহাসপাতাল: ${reqItem.hospital} (${reqItem.area}, ${reqItem.district})\nপ্রয়োজন: ${reqItem.neededAtIso}\nযোগাযোগ: ${reqItem.contactPhone}\nম্যাপ: ${mapUrl}`
        : `🩸 Emergency Blood Request (0709 Sanatan Blood Bank)\nGroup: ${reqItem.bloodGroup} (${reqItem.bags} Bags)\nPatient: ${reqItem.patientName}\nHospital: ${reqItem.hospital} (${reqItem.area}, ${reqItem.district})\nNeeded By: ${reqItem.neededAtIso}\nContact: ${reqItem.contactPhone}\nMap: ${mapUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${reqItem.bloodGroup} Blood Needed - ${reqItem.hospital}`,
          text: shareText,
        });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      notifyBanner(
        'success',
        lang === 'bn'
          ? 'আবেদনের বিবরণ ক্লিপবোর্ডে কপি হয়েছে (হোয়াটসঅ্যাপ বা ফেসবুকে শেয়ার করুন)।'
          : 'Request details copied to clipboard for sharing.'
      );
    } catch {
      // ignore
    }
  };

  // Delete Account & Data (SRS FR-AUTH-08 / US-25)
  const handleDeleteAccount = async () => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid));
      await deleteDoc(doc(db, 'users_private', user.uid));
      await deleteUser(user);
      notifyBanner('info', 'Account and profile deleted.');
    } catch (error) {
      notifyBanner(
        'error',
        lang === 'bn'
          ? 'অ্যাকাউন্ট মুছতে পুনরায় সাইন-ইন করে চেষ্টা করুন।'
          : 'Please sign out and sign in again before deleting your account (re-authentication required).'
      );
    }
  };

  // Filtered Open Requests
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (r.status !== 'open') return false;
      if (requestFilterGroup !== 'ALL' && r.bloodGroup !== requestFilterGroup) {
        return false;
      }
      if (requestFilterUrgentOnly && !r.isUrgent) {
        return false;
      }
      return true;
    });
  }, [requests, requestFilterGroup, requestFilterUrgentOnly]);

  // Filtered & Distance-Sorted Donors
  const filteredDonors = useMemo(() => {
    const allowedGroups: BloodGroup[] | null =
      patientMatchGroup !== 'NONE'
        ? COMPATIBLE_DONOR_GROUPS[patientMatchGroup]
        : donorFilterGroup !== 'ALL'
          ? [donorFilterGroup]
          : null;

    return donors
      .map((d) => {
        const elig = computeDonorEligibility(
          d.isAvailable,
          d.lastDonationMs,
          Date.now(),
          remoteConfig.donationGapDays
        );
        const distanceKm = calculateDistanceKm(userLat, userLng, d.lat, d.lng);
        return { ...d, elig, distanceKm };
      })
      .filter((d) => {
        if (donorAvailableOnly && !d.elig.isEligibleNow) return false;
        if (allowedGroups && !allowedGroups.includes(d.bloodGroup)) return false;
        if (
          donorFilterDistrict !== 'ALL' &&
          d.district.toLowerCase() !== donorFilterDistrict.toLowerCase()
        ) {
          return false;
        }
        if (
          donorSearchArea.trim() &&
          !d.area.toLowerCase().includes(donorSearchArea.trim().toLowerCase()) &&
          !d.name.toLowerCase().includes(donorSearchArea.trim().toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.elig.isEligibleNow !== b.elig.isEligibleNow) {
          return a.elig.isEligibleNow ? -1 : 1;
        }
        return a.distanceKm - b.distanceKm;
      });
  }, [
    donors,
    patientMatchGroup,
    donorFilterGroup,
    donorFilterDistrict,
    donorSearchArea,
    donorAvailableOnly,
    userLat,
    userLng,
    remoteConfig.donationGapDays,
  ]);

  // Radar Map Markers combining Open Requests + Available Donors + Self
  const radarMarkers: MapMarkerItem[] = useMemo(() => {
    const items: MapMarkerItem[] = [
      {
        id: 'self_gps',
        type: 'self',
        title: lang === 'bn' ? 'আমার অবস্থান (You)' : 'Your Location',
        subtitle: `${userLat.toFixed(4)}, ${userLng.toFixed(4)}`,
        lat: userLat,
        lng: userLng,
      },
    ];

    filteredRequests.forEach((req) => {
      if (req.hasPin && (req.lat !== 0 || req.lng !== 0)) {
        items.push({
          id: req.id,
          type: 'request',
          title: `${req.bloodGroup} (${req.bags} ব্যাগ) · ${req.patientName}`,
          subtitle: `${req.hospital} · ${req.area}`,
          bloodGroup: req.bloodGroup,
          isUrgent: req.isUrgent,
          lat: req.lat,
          lng: req.lng,
          hospital: req.hospital,
          onSelect: (id) => {
            setSelectedRequestId(id);
            setActiveTab('requests');
          },
        });
      }
    });

    filteredDonors.forEach((d) => {
      if (d.lat !== 0 || d.lng !== 0) {
        items.push({
          id: d.uid,
          type: 'donor',
          title: `${d.name} (${d.bloodGroup})`,
          subtitle: `${d.area}, ${d.district} · ${
            d.elig.isEligibleNow ? 'রক্তদানে প্রস্তুত' : `${d.elig.daysRemaining} দিন বাকি`
          }`,
          bloodGroup: d.bloodGroup,
          lat: d.lat,
          lng: d.lng,
        });
      }
    });

    return items;
  }, [filteredRequests, filteredDonors, userLat, userLng, lang]);

  const selectedRequest = useMemo(
    () => requests.find((r) => r.id === selectedRequestId) || null,
    [requests, selectedRequestId]
  );

  const myEligibility = useMemo(() => {
    if (!myProfile) return null;
    return computeDonorEligibility(
      myProfile.isAvailable,
      myProfile.lastDonationMs,
      Date.now(),
      remoteConfig.donationGapDays
    );
  }, [myProfile, remoteConfig.donationGapDays]);

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#121212] text-[#212121] dark:text-[#ECEFF1] pb-24 lg:pb-12 transition-colors">
      {/* Top Bar Contract (frontend-design §2: 3 zones separated by gap-8) */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#1E1E1E]/95 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-4 sm:px-6 h-16">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className="text-lg font-bold tracking-tight text-[#C62828] dark:text-[#EF5350] whitespace-nowrap shrink-0 text-left"
          >
            {t.appName}
          </button>

          {/* Zone 2: 5 Single-Line Navigation Links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-neutral-600 dark:text-neutral-300">
            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'requests'
                  ? 'text-[#C62828] dark:text-[#EF5350] font-semibold underline underline-offset-8 decoration-2'
                  : 'hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              {t.navRequests}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('donors')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'donors'
                  ? 'text-[#C62828] dark:text-[#EF5350] font-semibold underline underline-offset-8 decoration-2'
                  : 'hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              {t.navDonors}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('map')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'map'
                  ? 'text-[#C62828] dark:text-[#EF5350] font-semibold underline underline-offset-8 decoration-2'
                  : 'hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              {t.navLiveMap}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('kotlin')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'kotlin'
                  ? 'text-[#C62828] dark:text-[#EF5350] font-semibold underline underline-offset-8 decoration-2'
                  : 'hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              {t.navKotlinCode}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'profile'
                  ? 'text-[#C62828] dark:text-[#EF5350] font-semibold underline underline-offset-8 decoration-2'
                  : 'hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              {t.navProfile}
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => setActiveTab('new-request')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#C62828] hover:bg-[#8E0000] text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                {t.navNewRequest}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#C62828] hover:bg-[#8E0000] text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                {t.signInWithGoogle}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Sub-header Utility Strip (Language, Theme, GPS Location, Admin Access) */}
      <div className="border-b border-neutral-200/80 dark:border-neutral-800/80 bg-neutral-100/70 dark:bg-neutral-900/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-neutral-600 dark:text-neutral-400">
            <span>{t.appSubtitle}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {filteredRequests.length} {lang === 'bn' ? 'টি চলমান আবেদন' : 'Open Requests'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {donors.length} {lang === 'bn' ? 'জন নিবন্ধিত রক্তদাতা' : 'Registered Donors'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDetectGpsLocation}
              className="min-h-[36px] px-3 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1E1E1E] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Navigation className="w-3.5 h-3.5 text-[#00796B]" />
              <span>
                {gpsStatus || (lang === 'bn' ? 'লাইভ লোকেশন নিন' : 'Sync GPS')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}
              className="min-h-[36px] px-3 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1E1E1E] text-neutral-800 dark:text-neutral-200 font-medium hover:bg-neutral-50 transition-colors whitespace-nowrap shrink-0"
            >
              {lang === 'bn' ? 'English' : 'বাংলা'}
            </button>

            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              aria-label="Toggle Dark Mode"
              className="min-h-[36px] px-3 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1E1E1E] text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5 hover:bg-neutral-50 transition-colors whitespace-nowrap shrink-0"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{darkMode ? 'Light' : 'Dark'}</span>
            </button>

            {isAdminUser && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={`min-h-[36px] px-3 py-1 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'admin'
                    ? 'bg-[#C62828] text-white'
                    : 'border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1E1E1E] text-[#C62828] dark:text-[#EF5350]'
                }`}
              >
                {t.navAdmin} ({reports.filter((r) => r.status === 'pending').length})
              </button>
            )}

            {user && (
              <button
                type="button"
                onClick={() => signOut(auth)}
                className="min-h-[36px] px-3 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1E1E1E] text-neutral-600 dark:text-neutral-400 hover:text-[#C62828] transition-colors whitespace-nowrap shrink-0"
              >
                {t.signOut}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Global Toast / Feedback Banner */}
      {bannerMessage && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-4">
          <div
            className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center justify-between gap-4 border ${
              bannerMessage.type === 'error'
                ? 'bg-[#D50000]/10 border-[#D50000]/30 text-[#D50000] dark:text-[#FF5F52]'
                : bannerMessage.type === 'success'
                  ? 'bg-[#2E7D32]/10 border-[#2E7D32]/30 text-[#2E7D32] dark:text-emerald-400'
                  : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200'
            }`}
          >
            <span>{bannerMessage.text}</span>
            <button
              type="button"
              onClick={() => setBannerMessage(null)}
              className="p-1 hover:opacity-75"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Visitor / Unauthenticated Landing View (SRS Section 2.3) */}
        {authReady && !user && activeTab !== 'kotlin' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-7 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-8 flex flex-col justify-between">
              <div>
                <div className="text-xs font-semibold text-[#C62828] dark:text-[#EF5350] tracking-wide">
                  0709 FRIENDS COMMUNITY · ZERO-COST EMERGENCY NETWORK
                </div>
                <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 leading-tight">
                  {lang === 'bn'
                    ? 'সঠিক রক্তের গ্রুপের প্রস্তুত রক্তদাতার কাছে মুহূর্তেই বার্তা পৌঁছে দিন'
                    : 'Reach Compatible, Eligible Blood Donors Within Minutes'}
                </h1>
                <p className="mt-4 text-base text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-2xl">
                  {lang === 'bn'
                    ? '০৭০৯ সনাতনী ব্লাড ব্যাংক একটি সম্পূর্ণ বিনামূল্যে পরিচালিত জরুরি রক্তদাতা সংযোগ নেটওয়ার্ক। রিয়েল-টাইম লোকেশন সার্চ, অটোমেটিক ৯০ দিনের যোগ্যতা গণনা, ওপেনস্ট্রিটম্যাপ হাসপাতাল পিন এবং সরাসরি কল/হোয়াটসঅ্যাপ যোগাযোগের মাধ্যমে দ্রুত রক্তের ব্যবস্থা করুন।'
                    : '0709 Sanatan Blood Bank connects patients in urgent need with compatible, eligible donors across Bangladesh. Featuring real-time donor distance tracking, 90-day automatic eligibility calculation, OpenStreetMap hospital pins, and instant Call/WhatsApp handoff.'}
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="min-h-[48px] px-6 py-3 rounded-xl bg-[#C62828] hover:bg-[#8E0000] text-white font-semibold text-sm transition-colors whitespace-nowrap shrink-0"
                  >
                    {t.signInWithGoogle}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('kotlin')}
                    className="min-h-[48px] px-5 py-3 rounded-xl border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 font-medium text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    {lang === 'bn'
                      ? 'Android Kotlin ও Worker কোড দেখুন'
                      : 'Inspect Android Kotlin & Worker Code'}
                  </button>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-800 space-y-2 text-xs text-neutral-500 dark:text-neutral-400">
                <p>{t.privacyNotice}</p>
                <p>{t.medicalDisclaimer}</p>
              </div>
            </div>

            {/* Right Column: Blood Group Compatibility Reference Table (SRS Appendix A) */}
            <div className="lg:col-span-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-6 flex flex-col justify-between">
              <div>
                <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  {lang === 'bn'
                    ? 'রক্তের গ্রুপ সামঞ্জস্যতা চার্ট (SRS Appendix A)'
                    : 'Blood Group Compatibility Matrix (SRS Appendix A)'}
                </h2>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {lang === 'bn'
                    ? 'আবেদন করার সাথে সাথে শুধুমাত্র সামঞ্জস্যপূর্ণ গ্রুপের রক্তদাতাদের FCM টপিকে পুশ নোটিফিকেশন পাঠানো হয়।'
                    : 'When a request is created, only compatible donor FCM topics are alerted.'}
                </p>

                <div className="mt-4 divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
                  {BLOOD_GROUPS.map((bg) => (
                    <div
                      key={bg}
                      className="py-2.5 flex items-center justify-between gap-4"
                    >
                      <span className="font-mono font-bold text-sm text-[#C62828] dark:text-[#EF5350] w-12">
                        {bg}
                      </span>
                      <span className="font-mono text-neutral-700 dark:text-neutral-300 text-right">
                        {COMPATIBLE_DONOR_GROUPS[bg].join(' · ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400 flex items-center justify-between">
                <span>Firebase Spark + Cloudflare Worker</span>
                <span className="font-mono">৳0 / month (C-01)</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Unverified Email Screen (SRS FR-AUTH-02 / TC-01) */}
        {authReady && user && !user.emailVerified && activeTab !== 'kotlin' ? (
          <div className="max-w-xl mx-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-8 text-center space-y-4">
            <AlertTriangle className="w-10 h-10 text-[#F9A825] mx-auto" />
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
              {lang === 'bn'
                ? 'আপনার ইমেইল ভেরিফাই করুন (FR-AUTH-02)'
                : 'Please Verify Your Email Address (FR-AUTH-02)'}
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {lang === 'bn'
                ? 'কমিউনিটির নিরাপত্তার স্বার্থে ইমেইল ভেরিফিকেশন ছাড়া রক্তদাতা তালিকা বা আবেদন দেখা ও পোস্ট করা যায় না।'
                : 'To keep the 0709 community trustworthy, unverified accounts cannot read or post data.'}
            </p>
          </div>
        ) : null}

        {/* Blocked User Notice (SRS FR-MOD-04 / TC-13) */}
        {isBlockedUser && (
          <div className="mb-6 rounded-xl border border-[#D50000]/40 bg-[#D50000]/10 p-4 text-sm text-[#D50000] dark:text-[#FF5F52]">
            {lang === 'bn'
              ? 'আপনার অ্যাকাউন্টটি মডারেটর দ্বারা ব্লক করা হয়েছে (FR-MOD-04)। আপনি শুধুমাত্র তথ্য দেখতে পারবেন কিন্তু নতুন কোনো তথ্য যোগ বা পরিবর্তন করতে পারবেন না।'
              : 'Your account has been restricted by a moderator (FR-MOD-04). You have read-only access.'}
          </div>
        )}

        {/* TAB: ANDROID KOTLIN & CLOUDFLARE WORKER CODE STUDIO */}
        {activeTab === 'kotlin' && <AndroidCodeStudioView lang={lang} />}

        {/* AUTHENTICATED APP VIEWS */}
        {authReady && user && user.emailVerified && activeTab !== 'kotlin' && (
          <>
            {/* Prompt new members to complete their profile first (SRS FR-PRO-01) */}
            {!myProfile && activeTab !== 'profile' && (
              <div className="mb-8 rounded-2xl border border-[#C62828]/30 bg-white dark:bg-[#1E1E1E] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                    {t.completeProfileTitle}
                  </h2>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    {t.completeProfileDesc}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#C62828] hover:bg-[#8E0000] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  {lang === 'bn' ? 'প্রোফাইল সম্পন্ন করুন →' : 'Complete Profile →'}
                </button>
              </div>
            )}

            {/* TAB 1: BLOOD REQUESTS & LIVE DETAIL (SRS FR-REQ & FR-RSP) */}
            {activeTab === 'requests' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Left Column: Open Requests Feed */}
                <div className="lg:col-span-7 space-y-5">
                  <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                          {lang === 'bn'
                            ? 'চলমান রক্তের আবেদনসমূহ (Real-Time Feed)'
                            : 'Live Open Blood Requests'}
                        </h2>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                          {lang === 'bn'
                            ? 'জরুরি আবেদনগুলো সবার উপরে প্রদর্শিত হচ্ছে · প্রয়োজনের ৪৮ ঘণ্টা পর স্বয়ংক্রিয়ভাবে মেয়াদোত্তীর্ণ হয়'
                            : 'Urgent requests prioritized · Automatically expires 48h after needed-by time'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveTab('new-request')}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-[#C62828] hover:bg-[#8E0000] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                      >
                        {t.navNewRequest}
                      </button>
                    </div>

                    {/* Blood Group & Urgent Filter Bar */}
                    <div className="mt-4 flex flex-wrap items-center gap-1.5 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                      <button
                        type="button"
                        onClick={() => setRequestFilterGroup('ALL')}
                        className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          requestFilterGroup === 'ALL'
                            ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        {t.filterAllGroups}
                      </button>
                      {BLOOD_GROUPS.map((bg) => (
                        <button
                          key={bg}
                          type="button"
                          onClick={() => setRequestFilterGroup(bg)}
                          className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors whitespace-nowrap shrink-0 ${
                            requestFilterGroup === bg
                              ? 'bg-[#C62828] text-white'
                              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200'
                          }`}
                        >
                          {bg}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setRequestFilterUrgentOnly(!requestFilterUrgentOnly)
                        }
                        className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ml-auto ${
                          requestFilterUrgentOnly
                            ? 'bg-[#D50000] text-white'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        {t.urgentBadge}
                      </button>
                    </div>
                  </div>

                  {/* Requests List */}
                  {filteredRequests.length === 0 ? (
                    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-10 text-center space-y-3">
                      <Droplet className="w-8 h-8 text-[#C62828] mx-auto opacity-80" />
                      <div className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                        {lang === 'bn'
                          ? 'এই মুহূর্তে কোনো চলমান রক্তের আবেদন নেই'
                          : 'No open blood requests matching your filter'}
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">
                        {lang === 'bn'
                          ? 'জরুরি রক্তের প্রয়োজন হলে "+ নতুন আবেদন" বাটনে ট্যাপ করে ৬০ সেকেন্ডের মধ্যে আবেদন পোস্ট করুন।'
                          : 'Tap "+ New Request" to create an emergency blood request and alert compatible donors.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredRequests.slice(0, 30).map((req) => {
                        const distKm = req.hasPin
                          ? calculateDistanceKm(userLat, userLng, req.lat, req.lng)
                          : Infinity;
                        const isSelected = selectedRequestId === req.id;
                        const mapUrl = buildBrowserMapUrl(
                          req.hospital,
                          req.lat,
                          req.lng,
                          req.hasPin
                        );
                        const waUrl = buildWhatsAppUrl(
                          req.contactPhone,
                          `নমস্কার, ০৭০৯ সনাতনী ব্লাড ব্যাংক অ্যাপে ${req.patientName}-এর জন্য ${req.bloodGroup} রক্তের আবেদন দেখে যোগাযোগ করছি।`
                        );

                        return (
                          <div
                            key={req.id}
                            onClick={() => setSelectedRequestId(req.id)}
                            className={`rounded-2xl border p-5 bg-white dark:bg-[#1E1E1E] transition-colors cursor-pointer ${
                              isSelected
                                ? 'border-[#C62828] dark:border-[#EF5350]'
                                : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
                            }`}
                          >
                            {/* Quiet Kicker / Unboxed Metadata (Zero-Pill Discipline) */}
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div className="flex flex-wrap items-center gap-2 font-medium">
                                {req.isUrgent && (
                                  <>
                                    <span className="font-bold text-[#D50000] dark:text-[#FF5F52] flex items-center gap-1">
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                      {t.urgentBadge}
                                    </span>
                                    <span aria-hidden="true">·</span>
                                  </>
                                )}
                                <span className="text-neutral-600 dark:text-neutral-400">
                                  {req.district}, {req.area}
                                </span>
                                {Number.isFinite(distKm) && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono tabular-nums text-[#00796B] dark:text-teal-400">
                                      {distKm} km
                                    </span>
                                  </>
                                )}
                              </div>

                              <span className="font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
                                {req.responderCount} {t.respondersLabel}
                              </span>
                            </div>

                            {/* Primary Title Row */}
                            <div className="mt-2.5 flex items-baseline justify-between gap-4">
                              <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                                <span className="font-mono text-xl text-[#C62828] dark:text-[#EF5350] mr-2">
                                  {req.bloodGroup}
                                </span>
                                <span>
                                  ({req.bags} {t.bagsLabel}) — {req.patientName}
                                </span>
                              </h3>
                            </div>

                            {/* Hospital & Needed-by Info */}
                            <div className="mt-2 space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
                              <div>
                                <span className="text-neutral-500 dark:text-neutral-400">
                                  {t.hospitalLabel}:{' '}
                                </span>
                                <span className="font-medium">{req.hospital}</span>
                              </div>
                              <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono tabular-nums">
                                {t.neededByLabel}: {req.neededAtIso} · Contact:{' '}
                                {req.contactPhone}
                              </div>
                              {req.note && (
                                <p className="text-xs text-neutral-600 dark:text-neutral-400 pt-1">
                                  {req.note}
                                </p>
                              )}
                            </div>

                            {/* Action Buttons (EIR-UI-03: >= 48px touch targets) */}
                            <div
                              className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex flex-wrap items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => handleInitiateImComing(req)}
                                className="min-h-[48px] px-4 py-2 rounded-xl bg-[#C62828] hover:bg-[#8E0000] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                              >
                                <HeartHandshake className="w-4 h-4" />
                                {t.imComingBtn}
                              </button>

                              <a
                                href={`tel:${req.contactPhone}`}
                                className="min-h-[48px] px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-[#1976D2] dark:text-blue-400 text-xs font-semibold flex items-center gap-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors whitespace-nowrap shrink-0"
                              >
                                <Phone className="w-4 h-4" />
                                {t.callBtn}
                              </a>

                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-h-[48px] px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-[#25D366] text-xs font-semibold flex items-center gap-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors whitespace-nowrap shrink-0"
                              >
                                <MessageCircle className="w-4 h-4" />
                                {t.whatsappBtn}
                              </a>

                              <a
                                href={mapUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={buildAndroidGeoUri(
                                  req.hospital,
                                  req.lat,
                                  req.lng,
                                  req.hasPin
                                )}
                                className="min-h-[48px] px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-[#EA4335] text-xs font-semibold flex items-center gap-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors whitespace-nowrap shrink-0"
                              >
                                <MapPin className="w-4 h-4" />
                                {t.mapBtn}
                              </a>

                              <button
                                type="button"
                                onClick={() => handleShareRequest(req)}
                                aria-label="Share request"
                                className="min-h-[48px] min-w-[48px] px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center justify-center transition-colors ml-auto"
                              >
                                <Share2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right Column: Selected Request Live Detail & Responders (SRS FR-REQ-09 & FR-RSP-03) */}
                <div className="lg:col-span-5">
                  {selectedRequest ? (
                    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-6 space-y-5 sticky top-24">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                            ID: {selectedRequest.id} · Status: {selectedRequest.status.toUpperCase()}
                          </div>
                          <h3 className="mt-1 text-xl font-bold text-neutral-900 dark:text-neutral-100">
                            {selectedRequest.bloodGroup} ({selectedRequest.bags}{' '}
                            {t.bagsLabel}) — {selectedRequest.patientName}
                          </h3>
                          <p className="text-sm text-neutral-600 dark:text-neutral-400">
                            {selectedRequest.hospital} · {selectedRequest.area},{' '}
                            {selectedRequest.district}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setReportTarget({
                              type: 'request',
                              id: selectedRequest.id,
                              name: `${selectedRequest.patientName} (${selectedRequest.hospital})`,
                            })
                          }
                          title={t.reportBtn}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-neutral-400 hover:text-[#D50000] transition-colors"
                        >
                          <Flag className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Compatible Donor Topics Alerted (Appendix A) */}
                      <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 text-xs space-y-1">
                        <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                          {lang === 'bn'
                            ? 'সামঞ্জস্যপূর্ণ রক্তদাতা গ্রুপ (Appendix A):'
                            : 'Compatible Donor Groups Alerted (Appendix A):'}
                        </div>
                        <div className="font-mono text-[#C62828] dark:text-[#EF5350] font-semibold">
                          {COMPATIBLE_DONOR_GROUPS[selectedRequest.bloodGroup].join(' · ')}
                        </div>
                        <div className="font-mono text-[11px] text-neutral-500">
                          FCM Topics:{' '}
                          {getCompatibleFcmTopics(selectedRequest.bloodGroup).join(', ')}
                        </div>
                      </div>

                      {/* Hospital Location OpenStreetMap Preview */}
                      {selectedRequest.hasPin && (
                        <div>
                          <OsmMapComponent
                            mode="radar"
                            centerLat={selectedRequest.lat}
                            centerLng={selectedRequest.lng}
                            zoom={15}
                            heightClass="h-48"
                            markers={[
                              {
                                id: selectedRequest.id,
                                type: 'request',
                                title: selectedRequest.hospital,
                                subtitle: `${selectedRequest.bloodGroup} (${selectedRequest.bags} Bags)`,
                                bloodGroup: selectedRequest.bloodGroup,
                                isUrgent: selectedRequest.isUrgent,
                                lat: selectedRequest.lat,
                                lng: selectedRequest.lng,
                                hospital: selectedRequest.hospital,
                              },
                            ]}
                          />
                          <div className="mt-2 flex items-center justify-between text-xs text-neutral-500 font-mono">
                            <span>
                              { buildAndroidGeoUri(
                                selectedRequest.hospital,
                                selectedRequest.lat,
                                selectedRequest.lng,
                                selectedRequest.hasPin
                              ) }
                            </span>
                            <a
                              href={buildBrowserMapUrl(
                                selectedRequest.hospital,
                                selectedRequest.lat,
                                selectedRequest.lng,
                                selectedRequest.hasPin
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#EA4335] font-sans font-semibold hover:underline"
                            >
                              {t.mapBtn} ↗
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Live Responders List (SRS FR-RSP-03) */}
                      <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                            {lang === 'bn'
                              ? `সাড়াদানকারী রক্তদাতা (${responsesForSelected.length})`
                              : `Responding Donors (${responsesForSelected.length})`}
                          </h4>
                          {responsesForSelected.some((r) => r.donorUid === user.uid) && (
                            <button
                              type="button"
                              onClick={() => handleWithdrawResponse(selectedRequest)}
                              className="text-xs text-[#D50000] hover:underline font-medium"
                            >
                              {t.withdrawResponseBtn}
                            </button>
                          )}
                        </div>

                        {responsesForSelected.length === 0 ? (
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            {lang === 'bn'
                              ? 'এখনো কেউ সাড়া দেননি। আপনার গ্রুপ সামঞ্জস্যপূর্ণ হলে "আমি আসছি" বাটনে ট্যাপ করুন।'
                              : 'No donors have tapped "I’m coming" yet.'}
                          </p>
                        ) : (
                          <div className="space-y-2.5">
                            {responsesForSelected.map((resp) => {
                              const dist = calculateDistanceKm(
                                selectedRequest.lat || userLat,
                                selectedRequest.lng || userLng,
                                resp.lat,
                                resp.lng
                              );
                              return (
                                <div
                                  key={resp.donorUid}
                                  className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 flex flex-wrap items-center justify-between gap-2 text-xs"
                                >
                                  <div>
                                    <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                                      {resp.donorName}{' '}
                                      <span className="font-mono text-[#C62828] dark:text-[#EF5350]">
                                        ({resp.donorBloodGroup})
                                      </span>
                                    </div>
                                    <div className="text-neutral-500 font-mono tabular-nums">
                                      {Number.isFinite(dist) ? `${dist} km from hospital` : 'Coming'}
                                      {resp.sharedPhone ? ` · ${resp.sharedPhone}` : ' · Phone private'}
                                    </div>
                                  </div>

                                  {resp.sharedPhone && (
                                    <div className="flex items-center gap-1.5">
                                      <a
                                        href={`tel:${resp.sharedPhone}`}
                                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#1976D2] text-white font-semibold flex items-center gap-1"
                                      >
                                        <Phone className="w-3.5 h-3.5" />
                                        {t.callBtn}
                                      </a>
                                      <a
                                        href={buildWhatsAppUrl(resp.sharedPhone)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#25D366] text-white font-semibold flex items-center gap-1"
                                      >
                                        WA
                                      </a>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Requester Controls: Edit Bags, Mark Fulfilled or Cancelled (SRS FR-REQ-06) */}
                      {(selectedRequest.requesterUid === user.uid || isAdminUser) &&
                        selectedRequest.status === 'open' && (
                          <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
                            <div className="text-xs font-semibold text-neutral-500">
                              {lang === 'bn'
                                ? 'আবেদনকারীর নিয়ন্ত্রণ (FR-REQ-06):'
                                : 'Requester Controls (FR-REQ-06):'}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateRequestStatus(selectedRequest, 'fulfilled')
                                }
                                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#2E7D32] hover:bg-emerald-800 text-white text-xs font-semibold transition-colors"
                              >
                                {t.markFulfilledBtn}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateRequestStatus(selectedRequest, 'cancelled')
                                }
                                className="min-h-[44px] px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                              >
                                {t.markCancelledBtn}
                              </button>
                            </div>
                          </div>
                        )}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-6 text-center space-y-2">
                      <Info className="w-6 h-6 text-neutral-400 mx-auto" />
                      <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                        {lang === 'bn'
                          ? 'বিস্তারিত দেখতে যেকোনো আবেদনে ক্লিক করুন'
                          : 'Select a request to view hospital map & live responders'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: DONOR DIRECTORY WITH LOCATION & COMPATIBILITY SEARCH (SRS FR-DON) */}
            {activeTab === 'donors' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-6 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                        {t.navDonors} ({filteredDonors.length})
                      </h2>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        {lang === 'bn'
                          ? 'আপনার অবস্থান থেকে দূরত্ব অনুযায়ী সাজানো · ৯০ দিনের রক্তদানের বিরতি স্বয়ংক্রিয়ভাবে যাচাইকৃত'
                          : 'Sorted by real-time distance · 90-day donation interval computed automatically'}
                      </p>
                    </div>

                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={donorAvailableOnly}
                        onChange={(e) => setDonorAvailableOnly(e.target.checked)}
                        className="w-4 h-4 accent-[#C62828] rounded"
                      />
                      <span>{t.filterAvailableOnly}</span>
                    </label>
                  </div>

                  {/* Filter Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                    <div>
                      <label className="block text-xs text-neutral-500 mb-1">
                        {t.bloodGroupLabel}
                      </label>
                      <select
                        value={donorFilterGroup}
                        onChange={(e) => {
                          setDonorFilterGroup(e.target.value as BloodGroup | 'ALL');
                          setPatientMatchGroup('NONE');
                        }}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
                      >
                        <option value="ALL">{t.filterAllGroups}</option>
                        {BLOOD_GROUPS.map((bg) => (
                          <option key={bg} value={bg}>
                            Exact Group: {bg}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-500 mb-1">
                        {t.filterCompatibleFor}
                      </label>
                      <select
                        value={patientMatchGroup}
                        onChange={(e) =>
                          setPatientMatchGroup(e.target.value as BloodGroup | 'NONE')
                        }
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
                      >
                        <option value="NONE">-- {lang === 'bn' ? 'নির্বাচন করুন' : 'Select Patient Group'} --</option>
                        {BLOOD_GROUPS.map((bg) => (
                          <option key={bg} value={bg}>
                            Patient is {bg} (Matches: {COMPATIBLE_DONOR_GROUPS[bg].join(', ')})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-500 mb-1">
                        {t.districtLabel}
                      </label>
                      <select
                        value={donorFilterDistrict}
                        onChange={(e) => setDonorFilterDistrict(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
                      >
                        <option value="ALL">{t.filterAllDistricts}</option>
                        {BD_DISTRICTS.map((d) => (
                          <option key={d.nameEn} value={d.nameEn}>
                            {lang === 'bn' ? `${d.nameBn} (${d.nameEn})` : d.nameEn}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-500 mb-1">
                        {t.areaLabel}
                      </label>
                      <div className="relative">
                        <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-3.5" />
                        <input
                          type="text"
                          value={donorSearchArea}
                          onChange={(e) => setDonorSearchArea(e.target.value)}
                          placeholder={lang === 'bn' ? 'এলাকা বা নাম খুঁজুন...' : 'Search area or name...'}
                          className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Donor Cards Grid (SRS FR-DON-02..05) */}
                {filteredDonors.length === 0 ? (
                  <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-10 text-center space-y-2">
                    <Users className="w-8 h-8 text-neutral-400 mx-auto" />
                    <div className="text-base font-semibold">
                      {lang === 'bn'
                        ? 'এই ফিল্টারে কোনো রক্তদাতা পাওয়া যায়নি'
                        : 'No donors found matching these filters'}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredDonors.slice(0, 50).map((donor) => {
                      const canShowPhone =
                        !donor.hidePhone &&
                        isValidBangladeshPhone(donor.publicContactPhone);
                      return (
                        <div
                          key={donor.uid}
                          className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-5 flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-baseline justify-between gap-2">
                              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                                {donor.name}
                              </h3>
                              <span className="font-mono text-lg font-bold text-[#C62828] dark:text-[#EF5350]">
                                {donor.bloodGroup}
                              </span>
                            </div>

                            {/* Unboxed Metadata Line */}
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                              <span>
                                {donor.area}, {donor.district}
                              </span>
                              {Number.isFinite(donor.distanceKm) && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono tabular-nums text-[#00796B] dark:text-teal-400">
                                    {donor.distanceKm} km
                                  </span>
                                </>
                              )}
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {donor.totalDonations || 0} donations
                              </span>
                            </div>

                            {/* Eligibility Status (SRS FR-PRO-06 / TC-06) */}
                            <div className="mt-3 text-xs font-medium">
                              {donor.elig.isEligibleNow ? (
                                <span className="text-[#2E7D32] dark:text-emerald-400 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  {t.availableNow}
                                </span>
                              ) : (
                                <span className="text-[#F9A825] flex items-center gap-1 font-mono tabular-nums">
                                  {donor.elig.daysRemaining > 0
                                    ? `${donor.elig.daysRemaining} ${t.daysRemainingSuffix}`
                                    : t.unavailableNow}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Contact Actions or Privacy Hidden Note (SRS FR-DON-03 / TC-14) */}
                          <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                            {canShowPhone ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <a
                                  href={`tel:${donor.publicContactPhone}`}
                                  className="min-h-[48px] flex-1 px-3 py-2 rounded-xl bg-[#1976D2] hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                  {t.callBtn}
                                </a>
                                <a
                                  href={buildWhatsAppUrl(
                                    donor.publicContactPhone,
                                    `নমস্কার ${donor.name}, ০৭০৯ সনাতনী ব্লাড ব্যাংক অ্যাপ থেকে জরুরি রক্তের প্রয়োজনে যোগাযোগ করছি।`
                                  )}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="min-h-[48px] flex-1 px-3 py-2 rounded-xl bg-[#25D366] hover:bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  {t.whatsappBtn}
                                </a>
                                <a
                                  href={`sms:${donor.publicContactPhone}`}
                                  className="min-h-[48px] px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-semibold flex items-center justify-center hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                                >
                                  {t.smsBtn}
                                </a>
                              </div>
                            ) : (
                              <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                                {t.phoneHiddenNote}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Community Blood Donation Camps (SRS FR-HIS-03) */}
                {camps.length > 0 && (
                  <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-6">
                    <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                      {lang === 'bn'
                        ? 'আসন্ন রক্তদান ক্যাম্প ও ইভেন্টসমূহ (FR-HIS-03)'
                        : 'Upcoming Community Blood Donation Camps (FR-HIS-03)'}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {camps.map((c) => (
                        <div
                          key={c.id}
                          className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4"
                        >
                          <div>
                            <div className="font-bold text-sm">{c.title}</div>
                            <div className="text-xs text-neutral-500 mt-0.5">
                              {c.organizer} · {c.location}, {c.district} · {c.dateIso}
                            </div>
                          </div>
                          <a
                            href={`tel:${c.contactPhone}`}
                            className="min-h-[44px] px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-[#1976D2] whitespace-nowrap shrink-0 flex items-center gap-1"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            {c.contactPhone}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: LIVE OPENSTREETMAP RADAR & REAL-TIME TRACKING */}
            {activeTab === 'map' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                        {lang === 'bn'
                          ? 'রিয়েল-টাইম রক্তদাতা ও হাসপাতালের লাইভ ম্যাপ (OpenStreetMap)'
                          : 'Real-Time Donor & Hospital Request Radar (OpenStreetMap)'}
                      </h2>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        {lang === 'bn'
                          ? 'লাল পিন = চলমান রক্তের আবেদন · সবুজ পিন = প্রস্তুত রক্তদাতা · নীল পিন = আপনার বর্তমান অবস্থান'
                          : 'Crimson Pins = Active Blood Requests · Teal Pins = Eligible Donors · Blue Pin = Your Location'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDetectGpsLocation}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-[#00796B] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Navigation className="w-4 h-4" />
                      {t.updateLocationBtn}
                    </button>
                  </div>

                  <OsmMapComponent
                    mode="radar"
                    centerLat={userLat}
                    centerLng={userLng}
                    zoom={12}
                    heightClass="h-[500px]"
                    markers={radarMarkers}
                  />
                </div>
              </div>
            )}

            {/* TAB 4: CREATE NEW BLOOD REQUEST (SRS FR-REQ-01..07) */}
            {activeTab === 'new-request' && (
              <div className="max-w-3xl mx-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-6 sm:p-8">
                <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                  {t.createRequestTitle}
                </h2>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {lang === 'bn'
                    ? `আপনার চলমান আবেদন: ${myOpenRequestsCount}/${remoteConfig.maxOpenRequests} (সর্বোচ্চ ৩টি চলমান আবেদন করা যাবে)`
                    : `Your active open requests: ${myOpenRequestsCount}/${remoteConfig.maxOpenRequests}`}
                </p>

                <form onSubmit={handleCreateRequest} className="mt-6 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                        {t.patientNameLabel} *
                      </label>
                      <input
                        type="text"
                        required
                        minLength={2}
                        maxLength={60}
                        value={reqPatientName}
                        onChange={(e) => setReqPatientName(e.target.value)}
                        placeholder={lang === 'bn' ? 'রোগীর নাম লিখুন' : 'Patient full name'}
                        className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                        {t.bloodGroupLabel} *
                      </label>
                      <select
                        value={reqBloodGroup}
                        onChange={(e) => setReqBloodGroup(e.target.value as BloodGroup)}
                        className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-mono font-bold text-[#C62828]"
                      >
                        {BLOOD_GROUPS.map((bg) => (
                          <option key={bg} value={bg}>
                            {bg}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                        {t.bagsCountLabel} *
                      </label>
                      <input
                        type="number"
                        required
                        min={1}
                        max={10}
                        value={reqBags}
                        onChange={(e) => setReqBags(Number(e.target.value))}
                        className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-mono tabular-nums"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                        {t.neededByLabel} *
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={reqNeededByInput}
                        onChange={(e) => setReqNeededByInput(e.target.value)}
                        className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                        {t.contactPhoneLabel} *
                      </label>
                      <input
                        type="tel"
                        required
                        pattern="^01[3-9][0-9]{8}$"
                        value={reqContactPhone}
                        onChange={(e) => setReqContactPhone(e.target.value)}
                        placeholder="01712345678"
                        className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-mono"
                      />
                    </div>
                  </div>

                  {/* Preset Hospital Selector (SRS FR-REQ-03) */}
                  <div className="space-y-3 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                        {t.presetHospitalLabel}
                      </label>
                      <select
                        value={reqPresetHospitalId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setReqPresetHospitalId(id);
                          const found = PRESET_HOSPITALS.find((h) => h.id === id);
                          if (found) {
                            setReqHospitalName(
                              lang === 'bn' ? found.nameBn : found.nameEn
                            );
                            setReqDistrict(found.district);
                            setReqArea(found.area);
                            setReqLat(found.lat);
                            setReqLng(found.lng);
                            setReqHasPin(true);
                          }
                        }}
                        className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
                      >
                        <option value="custom">
                          -- {lang === 'bn' ? 'অন্যান্য হাসপাতাল (নিচে নাম লিখুন)' : 'Custom Hospital Name'} --
                        </option>
                        {PRESET_HOSPITALS.map((h) => (
                          <option key={h.id} value={h.id}>
                            {lang === 'bn' ? h.nameBn : h.nameEn} ({h.district})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-1">
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                          {t.customHospitalLabel} *
                        </label>
                        <input
                          type="text"
                          required
                          minLength={2}
                          maxLength={120}
                          value={reqHospitalName}
                          onChange={(e) => {
                            setReqHospitalName(e.target.value);
                            setReqPresetHospitalId('custom');
                          }}
                          className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                          {t.districtLabel} *
                        </label>
                        <select
                          value={reqDistrict}
                          onChange={(e) => setReqDistrict(e.target.value)}
                          className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
                        >
                          {BD_DISTRICTS.map((d) => (
                            <option key={d.nameEn} value={d.nameEn}>
                              {lang === 'bn' ? d.nameBn : d.nameEn}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                          {t.areaLabel} *
                        </label>
                        <input
                          type="text"
                          required
                          value={reqArea}
                          onChange={(e) => setReqArea(e.target.value)}
                          className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
                        />
                      </div>
                    </div>

                    {/* OpenStreetMap Pin Dropper (SRS FR-REQ-03) */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                          {t.pinMapInstruction}
                        </span>
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={reqHasPin}
                            onChange={(e) => setReqHasPin(e.target.checked)}
                            className="w-4 h-4 accent-[#C62828]"
                          />
                          <span className="font-mono">
                            {reqHasPin
                              ? `${reqLat.toFixed(4)}, ${reqLng.toFixed(4)}`
                              : 'Name Only (No Pin)'}
                          </span>
                        </label>
                      </div>

                      {reqHasPin && (
                        <OsmMapComponent
                          mode="picker"
                          centerLat={reqLat}
                          centerLng={reqLng}
                          selectedLat={reqLat}
                          selectedLng={reqLng}
                          onPickCoordinate={(lat, lng) => {
                            setReqLat(lat);
                            setReqLng(lng);
                          }}
                          heightClass="h-56"
                        />
                      )}
                    </div>
                  </div>

                  {/* Urgent Flag & Optional Note */}
                  <div className="space-y-3 pt-2">
                    <label className="flex items-center gap-2.5 p-3.5 rounded-xl border border-[#D50000]/30 bg-[#D50000]/5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reqIsUrgent}
                        onChange={(e) => setReqIsUrgent(e.target.checked)}
                        className="w-5 h-5 accent-[#D50000]"
                      />
                      <span className="text-sm font-semibold text-[#D50000] dark:text-[#FF5F52]">
                        {t.urgentToggleLabel}
                      </span>
                    </label>

                    <div>
                      <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                        {t.noteLabel}
                      </label>
                      <textarea
                        rows={2}
                        maxLength={300}
                        value={reqNote}
                        onChange={(e) => setReqNote(e.target.value)}
                        placeholder={
                          lang === 'bn'
                            ? 'যেমন: আইসিইউ বেড ৪, অপারেশন সকাল ১০টায়...'
                            : 'e.g. Ward 4, hemoglobin 6.2, surgery scheduled...'
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submittingRequest || isBlockedUser}
                    className="w-full min-h-[48px] px-6 py-3 rounded-xl bg-[#C62828] hover:bg-[#8E0000] disabled:opacity-50 text-white font-semibold text-sm transition-colors"
                  >
                    {submittingRequest ? 'Publishing...' : t.submitRequestBtn}
                  </button>
                </form>
              </div>
            )}

            {/* TAB 5: MY PROFILE, AVAILABILITY, MILESTONE BADGES & SETTINGS (SRS FR-PRO & FR-HIS) */}
            {activeTab === 'profile' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Left Column: Profile Form */}
                <div className="lg:col-span-7 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-6 sm:p-8">
                  <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                    {t.completeProfileTitle}
                  </h2>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {t.privacyNotice}
                  </p>

                  <form onSubmit={handleSaveProfile} className="mt-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          {t.nameLabel} *
                        </label>
                        <input
                          type="text"
                          required
                          minLength={2}
                          maxLength={60}
                          value={profName}
                          onChange={(e) => setProfName(e.target.value)}
                          className="w-full min-h-[48px] px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          {t.bloodGroupLabel} *
                        </label>
                        <select
                          value={profBloodGroup}
                          onChange={(e) =>
                            setProfBloodGroup(e.target.value as BloodGroup)
                          }
                          className="w-full min-h-[48px] px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-mono font-bold text-[#C62828]"
                        >
                          {BLOOD_GROUPS.map((bg) => (
                            <option key={bg} value={bg}>
                              {bg}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          {t.phoneLabel} *
                        </label>
                        <input
                          type="tel"
                          required
                          pattern="^01[3-9][0-9]{8}$"
                          value={profPhone}
                          onChange={(e) => setProfPhone(e.target.value)}
                          placeholder="01712345678"
                          className="w-full min-h-[48px] px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          {t.districtLabel} *
                        </label>
                        <select
                          value={profDistrict}
                          onChange={(e) => {
                            const distName = e.target.value;
                            setProfDistrict(distName);
                            const found = BD_DISTRICTS.find(
                              (d) => d.nameEn === distName
                            );
                            if (found) {
                              setProfLat(found.lat);
                              setProfLng(found.lng);
                              setProfArea(found.areas[0] || 'Sadar');
                            }
                          }}
                          className="w-full min-h-[48px] px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
                        >
                          {BD_DISTRICTS.map((d) => (
                            <option key={d.nameEn} value={d.nameEn}>
                              {lang === 'bn' ? d.nameBn : d.nameEn}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          {t.areaLabel} *
                        </label>
                        <input
                          type="text"
                          required
                          minLength={2}
                          maxLength={80}
                          value={profArea}
                          onChange={(e) => setProfArea(e.target.value)}
                          className="w-full min-h-[48px] px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          {t.lastDonationLabel}
                        </label>
                        <input
                          type="date"
                          value={profLastDonationDate}
                          onChange={(e) => setProfLastDonationDate(e.target.value)}
                          className="w-full min-h-[48px] px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          {t.totalDonationsLabel}
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={500}
                          value={profTotalDonations}
                          onChange={(e) =>
                            setProfTotalDonations(Number(e.target.value))
                          }
                          className="w-full min-h-[48px] px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-mono tabular-nums"
                        />
                      </div>
                    </div>

                    {/* OpenStreetMap Location Pin for Real-Time Donor Tracking */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                          {lang === 'bn'
                            ? 'রিয়েল-টাইম ডোনার ট্র্যাকিং লোকেশন (ম্যাপে ক্লিক করুন অথবা GPS নিন)'
                            : 'Donor Location Pin (Click map or sync GPS)'}
                        </span>
                        <button
                          type="button"
                          onClick={handleDetectGpsLocation}
                          className="text-xs font-semibold text-[#00796B] hover:underline"
                        >
                          {t.updateLocationBtn}
                        </button>
                      </div>
                      <OsmMapComponent
                        mode="picker"
                        centerLat={profLat}
                        centerLng={profLng}
                        selectedLat={profLat}
                        selectedLng={profLng}
                        onPickCoordinate={(lat, lng) => {
                          setProfLat(lat);
                          setProfLng(lng);
                        }}
                        heightClass="h-48"
                      />
                    </div>

                    {/* Switches: Availability, Hide Phone, Eligibility Declaration */}
                    <div className="space-y-2.5 pt-2">
                      <label className="flex items-center gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={profAvailable}
                          onChange={(e) => setProfAvailable(e.target.checked)}
                          className="w-5 h-5 accent-[#2E7D32]"
                        />
                        <span className="text-sm font-medium">
                          {t.availableNow} (FR-PRO-05)
                        </span>
                      </label>

                      <label className="flex items-center gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={profHidePhone}
                          onChange={(e) => setProfHidePhone(e.target.checked)}
                          className="w-5 h-5 accent-[#C62828]"
                        />
                        <span className="text-sm font-medium">
                          {t.hidePhoneLabel} (FR-PRO-03)
                        </span>
                      </label>

                      <label className="flex items-start gap-3 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 cursor-pointer">
                        <input
                          type="checkbox"
                          required
                          checked={profDeclared}
                          onChange={(e) => setProfDeclared(e.target.checked)}
                          className="w-5 h-5 mt-0.5 accent-[#C62828]"
                        />
                        <span className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
                          {t.eligibilityCheckbox}
                        </span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={savingProfile || isBlockedUser}
                      className="w-full min-h-[48px] px-6 py-3 rounded-xl bg-[#C62828] hover:bg-[#8E0000] disabled:opacity-50 text-white font-semibold text-sm transition-colors"
                    >
                      {savingProfile ? 'Saving...' : t.saveProfileBtn}
                    </button>
                  </form>
                </div>

                {/* Right Column: Eligibility Status, Milestones & Account Privacy */}
                <div className="lg:col-span-5 space-y-6">
                  {myProfile && myEligibility && (
                    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-neutral-500">
                            FCM Topic Subscription (FR-PRO-07)
                          </div>
                          <div className="font-mono text-sm font-bold text-[#C62828] dark:text-[#EF5350]">
                            {myProfile.fcmTopic}
                          </div>
                        </div>
                        <span className="font-mono text-2xl font-bold text-[#C62828] dark:text-[#EF5350]">
                          {myProfile.bloodGroup}
                        </span>
                      </div>

                      <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900">
                        <div className="text-sm font-bold">
                          {myEligibility.isEligibleNow
                            ? t.availableNow
                            : `${myEligibility.daysRemaining} ${t.daysRemainingSuffix}`}
                        </div>
                        {myEligibility.nextEligibleDateIso && (
                          <div className="text-xs text-neutral-500 font-mono mt-1">
                            Next Eligible Date: {myEligibility.nextEligibleDateIso}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleLogDonationToday}
                        className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#00796B] hover:bg-teal-800 text-white text-xs font-semibold transition-colors"
                      >
                        {lang === 'bn'
                          ? 'আজ রক্তদান সম্পন্ন করেছি — রেকর্ড আপডেট করুন (FR-HIS-01)'
                          : 'Log Completed Blood Donation Today (FR-HIS-01)'}
                      </button>

                      {/* Milestone Badges (SRS FR-HIS-02: 1, 5, 10, 25 donations) */}
                      <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">
                          {lang === 'bn'
                            ? 'রক্তদান মাইলফলক ব্যাজ (FR-HIS-02)'
                            : 'Donation Milestone Badges (FR-HIS-02)'}
                        </h3>
                        <div className="grid grid-cols-2 gap-2.5">
                          {getDonorMilestones(myProfile.totalDonations).map((m) => (
                            <div
                              key={m.count}
                              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                                m.unlocked
                                  ? 'border-[#2E7D32]/40 bg-[#2E7D32]/10 text-[#2E7D32] dark:text-emerald-400 font-semibold'
                                  : 'border-neutral-200 dark:border-neutral-800 text-neutral-400'
                              }`}
                            >
                              <Award className="w-4 h-4 shrink-0" />
                              <span>{lang === 'bn' ? m.labelBn : m.labelEn}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Medical Disclaimer & Delete Account (FR-SET-03 & FR-AUTH-08) */}
                  <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-6 space-y-4">
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      {lang === 'bn'
                        ? 'সতর্কবার্তা ও অ্যাকাউন্ট নিয়ন্ত্রণ'
                        : 'Medical Disclaimer & Data Control'}
                    </h3>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                      {t.medicalDisclaimer}
                    </p>
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      className="min-h-[44px] px-4 py-2 rounded-xl border border-[#D50000]/40 text-[#D50000] text-xs font-semibold hover:bg-[#D50000]/10 transition-colors"
                    >
                      {lang === 'bn'
                        ? 'আমার অ্যাকাউন্ট ও সকল তথ্য মুছে ফেলুন (FR-AUTH-08)'
                        : 'Delete My Account & Profile Data (FR-AUTH-08)'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 6: ADMIN MODERATION & BLOOD CAMP CONSOLE (SRS FR-MOD & FR-HIS-03) */}
            {activeTab === 'admin' && isAdminUser && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-7 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-6 space-y-4">
                  <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                    {lang === 'bn'
                      ? 'মডারেশন ও রিপোর্ট তালিকা (FR-MOD-05)'
                      : 'Moderation Abuse Reports (FR-MOD-05)'}
                  </h2>

                  {reports.length === 0 ? (
                    <p className="text-xs text-neutral-500">
                      No abuse reports filed.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {reports.map((rep) => (
                        <div
                          key={rep.id}
                          className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-4 text-xs"
                        >
                          <div>
                            <div className="font-bold text-sm">
                              [{rep.targetType.toUpperCase()}] {rep.targetName}
                            </div>
                            <p className="text-neutral-600 dark:text-neutral-400 mt-1">
                              Reason: {rep.reason}
                            </p>
                            <div className="font-mono text-neutral-400 mt-1">
                              Target ID: {rep.targetId} · Status: {rep.status}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {rep.status === 'pending' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await updateDoc(doc(db, 'reports', rep.id), {
                                    status: 'resolved',
                                  });
                                }}
                                className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#2E7D32] text-white font-semibold"
                              >
                                Resolve
                              </button>
                            )}
                            {rep.targetType === 'user' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await setDoc(doc(db, 'blocked', rep.targetId), {
                                    blockedUid: rep.targetId,
                                    reason: rep.reason.slice(0, 200),
                                    blockedByUid: user.uid,
                                    createdAt: serverTimestamp(),
                                  });
                                  notifyBanner('success', `Blocked user ${rep.targetId}`);
                                }}
                                className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#D50000] text-white font-semibold"
                              >
                                Block User
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Post New Blood Donation Camp (SRS FR-HIS-03) */}
                <div className="lg:col-span-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1E1E1E] p-6">
                  <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    {lang === 'bn'
                      ? 'নতুন রক্তদান ক্যাম্প যোগ করুন (FR-HIS-03)'
                      : 'Post Blood Donation Camp (FR-HIS-03)'}
                  </h3>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const campId = `camp_${Date.now()}`;
                      try {
                        await setDoc(doc(db, 'camps', campId), {
                          title: campTitle.trim().slice(0, 100),
                          organizer: campOrganizer.trim().slice(0, 100),
                          district: campDistrict,
                          location: campLocation.trim().slice(0, 120),
                          dateIso: campDateIso,
                          contactPhone: campPhone.trim(),
                          createdByUid: user.uid,
                          createdAt: serverTimestamp(),
                        });
                        setCampTitle('');
                        setCampLocation('');
                        notifyBanner('success', 'Blood donation camp published!');
                      } catch (err) {
                        handleFirestoreError(err, OperationType.CREATE, `camps/${campId}`);
                      }
                    }}
                    className="space-y-3 text-xs"
                  >
                    <input
                      type="text"
                      required
                      minLength={3}
                      placeholder="Camp Title"
                      value={campTitle}
                      onChange={(e) => setCampTitle(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Location / Venue"
                      value={campLocation}
                      onChange={(e) => setCampLocation(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        required
                        value={campDateIso}
                        onChange={(e) => setCampDateIso(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono"
                      />
                      <input
                        type="tel"
                        required
                        pattern="^01[3-9][0-9]{8}$"
                        value={campPhone}
                        onChange={(e) => setCampPhone(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#C62828] text-white font-semibold"
                    >
                      Publish Camp
                    </button>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Modal: Hidden-Phone Donor Confirmation at Response Time (SRS FR-RSP-05) */}
      {comingModalRequest && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-white dark:bg-[#1E1E1E] border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
            <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              {lang === 'bn'
                ? 'এই আবেদনকারীর সাথে কি আপনার ফোন নম্বর শেয়ার করবেন? (FR-RSP-05)'
                : 'Share your phone number with this requester? (FR-RSP-05)'}
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              {lang === 'bn'
                ? 'আপনার প্রোফাইলে ফোন নম্বর গোপন রাখা আছে। আপনি চাইলে শুধুমাত্র এই রোগীর স্বজনের সাথে নম্বরটি শেয়ার করতে পারেন যাতে তিনি দ্রুত যোগাযোগ করতে পারেন।'
                : 'Your phone number is hidden in the public directory. Choose whether to share it with this requester so they can coordinate with you.'}
            </p>
            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 cursor-pointer text-xs font-medium">
              <input
                type="checkbox"
                checked={sharePhoneOnResponse}
                onChange={(e) => setSharePhoneOnResponse(e.target.checked)}
                className="w-4 h-4 accent-[#C62828]"
              />
              <span>
                {lang === 'bn'
                  ? `হ্যাঁ, আমার নম্বর (${myPrivatePhone}) শেয়ার করুন`
                  : `Yes, share my phone number (${myPrivatePhone})`}
              </span>
            </label>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setComingModalRequest(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  submitDonorResponse(comingModalRequest, sharePhoneOnResponse)
                }
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#C62828] text-white text-xs font-semibold"
              >
                {t.imComingBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Report Abuse (SRS FR-MOD-01) */}
      {reportTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitReport}
            className="max-w-md w-full rounded-2xl bg-white dark:bg-[#1E1E1E] border border-neutral-200 dark:border-neutral-800 p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              {t.reportBtn}: {reportTarget.name}
            </h3>
            <textarea
              required
              minLength={3}
              maxLength={300}
              rows={3}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder={
                lang === 'bn'
                  ? 'রিপোর্ট করার কারণ লিখুন (যেমন: ভুয়া আবেদন বা ভুল নম্বর)...'
                  : 'Describe why you are reporting this item...'
              }
              className="w-full p-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D50000] text-white text-xs font-semibold"
              >
                Submit Report
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Mobile Fixed Bottom Navigation Bar (SRS EIR-UI-02: Requests, Donors, + New Request, Map/Kotlin, Profile) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#1E1E1E]/95 backdrop-blur-md border-t border-neutral-200 dark:border-neutral-800">
        <div className="grid grid-cols-5 items-center h-16 px-2">
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`min-h-[48px] flex flex-col items-center justify-center text-[11px] font-medium ${
              activeTab === 'requests'
                ? 'text-[#C62828] dark:text-[#EF5350] font-bold'
                : 'text-neutral-500 dark:text-neutral-400'
            }`}
          >
            <Droplet className="w-5 h-5" />
            <span className="mt-0.5 truncate">{t.navRequests}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('donors')}
            className={`min-h-[48px] flex flex-col items-center justify-center text-[11px] font-medium ${
              activeTab === 'donors'
                ? 'text-[#C62828] dark:text-[#EF5350] font-bold'
                : 'text-neutral-500 dark:text-neutral-400'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="mt-0.5 truncate">{t.navDonors}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('new-request')}
            className="min-h-[48px] flex flex-col items-center justify-center"
          >
            <span className="w-11 h-11 rounded-full bg-[#C62828] text-white flex items-center justify-center shadow-md">
              <Plus className="w-5 h-5" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('map')}
            className={`min-h-[48px] flex flex-col items-center justify-center text-[11px] font-medium ${
              activeTab === 'map'
                ? 'text-[#C62828] dark:text-[#EF5350] font-bold'
                : 'text-neutral-500 dark:text-neutral-400'
            }`}
          >
            <Compass className="w-5 h-5" />
            <span className="mt-0.5 truncate">ম্যাপ</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('kotlin')}
            className={`min-h-[48px] flex flex-col items-center justify-center text-[11px] font-medium ${
              activeTab === 'kotlin'
                ? 'text-[#C62828] dark:text-[#EF5350] font-bold'
                : 'text-neutral-500 dark:text-neutral-400'
            }`}
          >
            <Code2 className="w-5 h-5" />
            <span className="mt-0.5 truncate">Kotlin</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
