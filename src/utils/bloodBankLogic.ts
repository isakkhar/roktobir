export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/**
 * SRS Appendix A – Blood Group Compatibility
 * Maps a patient's blood group to all donor blood groups that can safely donate to them.
 */
export const COMPATIBLE_DONOR_GROUPS: Record<BloodGroup, BloodGroup[]> = {
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'A-': ['A-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  'AB-': ['A-', 'B-', 'AB-', 'O-'],
  'O+': ['O+', 'O-'],
  'O-': ['O-'],
};

/**
 * Reverse compatibility: which patient groups a given donor blood group can donate to.
 */
export function getRecipientGroupsForDonor(donorGroup: BloodGroup): BloodGroup[] {
  return BLOOD_GROUPS.filter((patientGroup) =>
    COMPATIBLE_DONOR_GROUPS[patientGroup].includes(donorGroup)
  );
}

/**
 * SRS Appendix A – FCM Topic Naming:
 * Plus becomes pos and minus becomes neg, e.g. donor_A_pos and donor_O_neg
 */
export function getFcmTopicForBloodGroup(group: BloodGroup): string {
  const normalized = group.replace('+', '_pos').replace('-', '_neg');
  return `donor_${normalized}`;
}

export function getCompatibleFcmTopics(patientGroup: BloodGroup): string[] {
  return COMPATIBLE_DONOR_GROUPS[patientGroup].map(getFcmTopicForBloodGroup);
}

/**
 * SRS FR-PRO-02 / TC-03:
 * Bangladeshi mobile number: 11 digits, starts with 01, third digit 3 to 9.
 */
export const BD_PHONE_REGEX = /^01[3-9][0-9]{8}$/;

export function isValidBangladeshPhone(phone: string): boolean {
  return BD_PHONE_REGEX.test(phone.trim());
}

/**
 * SRS FR-DON-05 / TC-09:
 * WhatsApp number in international format (01XXXXXXXXX becomes 8801XXXXXXXXX).
 */
export function formatWhatsAppNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('8801') && cleaned.length === 13) {
    return cleaned;
  }
  if (cleaned.startsWith('01') && cleaned.length === 11) {
    return `88${cleaned}`;
  }
  return cleaned;
}

export function buildWhatsAppUrl(phone: string, message?: string): string {
  const intl = formatWhatsAppNumber(phone);
  if (!message) {
    return `https://wa.me/${intl}`;
  }
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

/**
 * SRS FR-PRO-06 / TC-06:
 * Donor eligibility calculation:
 * Available only if the switch is on AND the donation gap (default 90 days) has elapsed since last donation.
 */
export interface EligibilityResult {
  isEligibleNow: boolean;
  gapElapsed: boolean;
  daysSinceLastDonation: number | null;
  daysRemaining: number;
  nextEligibleDateIso: string | null;
}

export function computeDonorEligibility(
  isAvailableSwitch: boolean,
  lastDonationMs: number,
  nowMs: number = Date.now(),
  donationGapDays: number = 90
): EligibilityResult {
  if (!lastDonationMs || lastDonationMs <= 0) {
    return {
      isEligibleNow: isAvailableSwitch,
      gapElapsed: true,
      daysSinceLastDonation: null,
      daysRemaining: 0,
      nextEligibleDateIso: null,
    };
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const elapsedMs = Math.max(0, nowMs - lastDonationMs);
  const daysSince = Math.floor(elapsedMs / msPerDay);
  const daysRemaining = Math.max(0, donationGapDays - daysSince);
  const gapElapsed = daysRemaining === 0;
  const nextEligibleMs = lastDonationMs + donationGapDays * msPerDay;

  return {
    isEligibleNow: isAvailableSwitch && gapElapsed,
    gapElapsed,
    daysSinceLastDonation: daysSince,
    daysRemaining,
    nextEligibleDateIso: gapElapsed ? null : new Date(nextEligibleMs).toISOString().split('T')[0],
  };
}

/**
 * SRS FR-HIS-02:
 * Milestone badges for 1, 5, 10 and 25 donations.
 */
export interface MilestoneBadge {
  count: number;
  labelBn: string;
  labelEn: string;
  unlocked: boolean;
}

export function getDonorMilestones(totalDonations: number): MilestoneBadge[] {
  const thresholds = [
    { count: 1, labelBn: '১ম রক্তদান (প্রথম পদক্ষেপ)', labelEn: '1st Donation (First Drop)' },
    { count: 5, labelBn: '৫ বার রক্তদান (জীবনরক্ষক)', labelEn: '5 Donations (Lifesaver)' },
    { count: 10, labelBn: '১০ বার রক্তদান (অগ্রদূত)', labelEn: '10 Donations (Vanguard)' },
    { count: 25, labelBn: '২৫ বার রক্তদান (মহানায়ক)', labelEn: '25 Donations (Hero of 0709)' },
  ];
  return thresholds.map((t) => ({
    ...t,
    unlocked: totalDonations >= t.count,
  }));
}

/**
 * SRS FR-MAP-01 to FR-MAP-04 / TC-07 & TC-08:
 * Builds Android geo: URI and browser fallback HTTPS map URLs.
 */
export function buildAndroidGeoUri(
  hospital: string,
  lat?: number,
  lng?: number,
  hasPin?: boolean
): string {
  if (hasPin && typeof lat === 'number' && typeof lng === 'number' && (lat !== 0 || lng !== 0)) {
    return `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(hospital)})`;
  }
  return `geo:0,0?q=${encodeURIComponent(hospital)}`;
}

export function buildBrowserMapUrl(
  hospital: string,
  lat?: number,
  lng?: number,
  hasPin?: boolean
): string {
  if (hasPin && typeof lat === 'number' && typeof lng === 'number' && (lat !== 0 || lng !== 0)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hospital + ', Bangladesh')}`;
}

/**
 * Haversine distance in kilometers for real-time donor tracking & location-based search.
 */
export function calculateDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if ((!lat1 && !lng1) || (!lat2 && !lng2)) return Infinity;
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Preset Bangladesh Districts, Areas, and Major Hospitals with Coordinates (FR-REQ-03)
 */
export interface PresetHospital {
  id: string;
  nameBn: string;
  nameEn: string;
  district: string;
  area: string;
  lat: number;
  lng: number;
}

export const BD_DISTRICTS: { nameEn: string; nameBn: string; lat: number; lng: number; areas: string[] }[] = [
  {
    nameEn: 'Dhaka',
    nameBn: 'ঢাকা',
    lat: 23.777176,
    lng: 90.399452,
    areas: ['Shahbagh', 'Dhanmondi', 'Mirpur', 'Uttara', 'Panthapath', 'Banani', 'bashundhara', 'Mohammadpur', 'Old Dhaka', 'Motijheel', 'Shyamoli'],
  },
  {
    nameEn: 'Chattogram',
    nameBn: 'চট্টগ্রাম',
    lat: 22.356851,
    lng: 91.783182,
    areas: ['Panchlaish', 'Agrabad', 'GEC Circle', 'Nasirabad', 'Chawkbazar', 'Halishahar', 'Kotwali'],
  },
  {
    nameEn: 'Sylhet',
    nameBn: 'সিলেট',
    lat: 24.894929,
    lng: 91.868706,
    areas: ['Kajalshah', 'Zindabazar', 'Amberkhana', 'Subhanighat', 'Upashahar'],
  },
  {
    nameEn: 'Rajshahi',
    nameBn: 'রাজশাহী',
    lat: 24.374515,
    lng: 88.604166,
    areas: ['Laxmipur', 'Shaheb Bazar', 'Boalia', 'Motihar', 'Rajpara'],
  },
  {
    nameEn: 'Khulna',
    nameBn: 'খুলনা',
    lat: 22.845641,
    lng: 89.540328,
    areas: ['Boyra', 'Sonadanga', 'Moylapota', 'Khalishpur', 'Daulatpur'],
  },
  {
    nameEn: 'Cumilla',
    nameBn: 'কুমিল্লা',
    lat: 23.460657,
    lng: 91.180907,
    areas: ['Kandirpar', 'Kuchaitoli', 'Tomsom Bridge', 'Racecourse'],
  },
  {
    nameEn: 'Mymensingh',
    nameBn: 'ময়মনসিংহ',
    lat: 24.747149,
    lng: 90.420273,
    areas: ['Charpara', 'Ganginarpar', 'Town Hall', 'Kachijhuli'],
  },
  {
    nameEn: 'Barishal',
    nameBn: 'বরিশাল',
    lat: 22.701002,
    lng: 90.353451,
    areas: ['Band Road', 'Sadar Road', 'Rupatoli', 'Nathullabad'],
  },
  {
    nameEn: 'Rangpur',
    nameBn: 'রংপুর',
    lat: 25.743892,
    lng: 89.275227,
    areas: ['Dhap', 'Jahaj Company More', 'Station Road', 'Modern More'],
  },
  {
    nameEn: 'Narayanganj',
    nameBn: 'নারায়ণগঞ্জ',
    lat: 23.623776,
    lng: 90.50004,
    areas: ['Chashara', 'Khanpur', 'Siddhirganj', 'Fatullah'],
  },
  {
    nameEn: 'Gazipur',
    nameBn: 'গাজীপুর',
    lat: 23.999941,
    lng: 90.420273,
    areas: ['Tongi', 'Joydebpur', 'Chandrima', 'Board Bazar'],
  },
];

export const PRESET_HOSPITALS: PresetHospital[] = [
  {
    id: 'dmch',
    nameBn: 'ঢাকা মেডিকেল কলেজ হাসপাতাল (DMCH)',
    nameEn: 'Dhaka Medical College Hospital (DMCH)',
    district: 'Dhaka',
    area: 'Shahbagh',
    lat: 23.7258,
    lng: 90.3976,
  },
  {
    id: 'bsmmu',
    nameBn: 'বিএসএমএমইউ (পিজি হাসপাতাল), শাহবাগ',
    nameEn: 'BSMMU (PG Hospital), Shahbagh',
    district: 'Dhaka',
    area: 'Shahbagh',
    lat: 23.7389,
    lng: 90.3948,
  },
  {
    id: 'square',
    nameBn: 'স্কয়ার হাসপাতাল, পান্থপথ',
    nameEn: 'Square Hospital, Panthapath',
    district: 'Dhaka',
    area: 'Panthapath',
    lat: 23.7529,
    lng: 90.3816,
  },
  {
    id: 'evercare',
    nameBn: 'এভারকেয়ার হাসপাতাল, বসুন্ধরা',
    nameEn: 'Evercare Hospital, Bashundhara',
    district: 'Dhaka',
    area: 'Bashundhara',
    lat: 23.8103,
    lng: 90.4313,
  },
  {
    id: 'nicvd',
    nameBn: 'জাতীয় হৃদরোগ ইনস্টিটিউট (NICVD), শেরেবাংলা নগর',
    nameEn: 'National Heart Institute (NICVD), Shyamoli',
    district: 'Dhaka',
    area: 'Shyamoli',
    lat: 23.7715,
    lng: 90.3694,
  },
  {
    id: 'kurmitola',
    nameBn: 'কুর্মিটোলা জেনারেল হাসপাতাল',
    nameEn: 'Kurmitola General Hospital',
    district: 'Dhaka',
    area: 'Uttara',
    lat: 23.8191,
    lng: 90.4099,
  },
  {
    id: 'cmch',
    nameBn: 'চট্টগ্রাম মেডিকেল কলেজ হাসপাতাল (CMCH)',
    nameEn: 'Chattogram Medical College Hospital (CMCH)',
    district: 'Chattogram',
    area: 'Panchlaish',
    lat: 22.3593,
    lng: 91.8308,
  },
  {
    id: 'somch',
    nameBn: 'সিলেট এমএজি ওসমানী মেডিকেল কলেজ হাসপাতাল',
    nameEn: 'Sylhet MAG Osmani Medical College Hospital',
    district: 'Sylhet',
    area: 'Kajalshah',
    lat: 24.9006,
    lng: 91.8532,
  },
  {
    id: 'rmch',
    nameBn: 'রাজশাহী মেডিকেল কলেজ হাসপাতাল (RMCH)',
    nameEn: 'Rajshahi Medical College Hospital (RMCH)',
    district: 'Rajshahi',
    area: 'Laxmipur',
    lat: 24.3721,
    lng: 88.5872,
  },
  {
    id: 'kmch',
    nameBn: 'খুলনা মেডিকেল কলেজ হাসপাতাল (KMCH)',
    nameEn: 'Khulna Medical College Hospital (KMCH)',
    district: 'Khulna',
    area: 'Boyra',
    lat: 22.8286,
    lng: 89.5356,
  },
  {
    id: 'mmch',
    nameBn: 'ময়মনসিংহ মেডিকেল কলেজ হাসপাতাল (MMCH)',
    nameEn: 'Mymensingh Medical College Hospital (MMCH)',
    district: 'Mymensingh',
    area: 'Charpara',
    lat: 24.7422,
    lng: 90.4089,
  },
];

/**
 * SRS NFR-MNT-02 & Section 10:
 * Automated Unit Tests covering blood compatibility, eligibility calculation,
 * phone validation, WhatsApp formatting, and map URI generation.
 */
export interface UnitTestResult {
  id: string;
  name: string;
  requirement: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export function runDomainUnitTests(): UnitTestResult[] {
  const results: UnitTestResult[] = [];

  // TC-03: Invalid phone 12345 -> Validation error
  const tc03Actual = isValidBangladeshPhone('12345');
  const tc03Valid = isValidBangladeshPhone('01712345678');
  results.push({
    id: 'TC-03',
    name: 'Bangladeshi Phone Validation (11 digits, 01[3-9]XXXXXXXX)',
    requirement: 'FR-PRO-02',
    passed: tc03Actual === false && tc03Valid === true,
    expected: '12345 -> false, 01712345678 -> true',
    actual: `12345 -> ${tc03Actual}, 01712345678 -> ${tc03Valid}`,
  });

  // TC-04: Request for A+ patient -> Topics A+, A-, O+, O- receive push; B+ does not
  const aPosTopics = getCompatibleFcmTopics('A+');
  const tc04Passed =
    aPosTopics.length === 4 &&
    aPosTopics.includes('donor_A_pos') &&
    aPosTopics.includes('donor_A_neg') &&
    aPosTopics.includes('donor_O_pos') &&
    aPosTopics.includes('donor_O_neg') &&
    !aPosTopics.includes('donor_B_pos');
  results.push({
    id: 'TC-04',
    name: 'A+ Patient Compatible FCM Topics',
    requirement: 'FR-NTF-02',
    passed: tc04Passed,
    expected: 'donor_A_pos, donor_A_neg, donor_O_pos, donor_O_neg',
    actual: aPosTopics.join(', '),
  });

  // TC-05: Request for AB+ -> All 8 topics receive the push
  const abPosTopics = getCompatibleFcmTopics('AB+');
  results.push({
    id: 'TC-05',
    name: 'AB+ Universal Recipient Notifies All 8 Topics',
    requirement: 'FR-NTF-02',
    passed: abPosTopics.length === 8,
    expected: '8 topics',
    actual: `${abPosTopics.length} topics (${abPosTopics.join(', ')})`,
  });

  // TC-06: Donor with last donation 30 days ago -> Shown as unavailable with 60 days remaining
  const now = 1794182400000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const elig30 = computeDonorEligibility(true, thirtyDaysAgo, now, 90);
  results.push({
    id: 'TC-06',
    name: 'Donor Eligibility 30 Days After Donation (90-Day Gap)',
    requirement: 'FR-PRO-06',
    passed: elig30.isEligibleNow === false && elig30.daysRemaining === 60,
    expected: 'isEligibleNow: false, daysRemaining: 60',
    actual: `isEligibleNow: ${elig30.isEligibleNow}, daysRemaining: ${elig30.daysRemaining}`,
  });

  // TC-07: Tap map icon with coordinates -> Maps app opens at point
  const geoWithCoords = buildAndroidGeoUri('DMCH', 23.7258, 90.3976, true);
  results.push({
    id: 'TC-07',
    name: 'Map URI with Pinned Coordinates',
    requirement: 'FR-MAP-02',
    passed: geoWithCoords === 'geo:23.7258,90.3976?q=23.7258,90.3976(DMCH)',
    expected: 'geo:23.7258,90.3976?q=23.7258,90.3976(DMCH)',
    actual: geoWithCoords,
  });

  // TC-08: Tap map icon, no coordinates -> Maps search for hospital name
  const geoWithoutCoords = buildAndroidGeoUri('Square Hospital', 0, 0, false);
  results.push({
    id: 'TC-08',
    name: 'Map URI Fallback Without Coordinates',
    requirement: 'FR-MAP-03',
    passed: geoWithoutCoords === 'geo:0,0?q=Square%20Hospital',
    expected: 'geo:0,0?q=Square%20Hospital',
    actual: geoWithoutCoords,
  });

  // TC-09: Tap WhatsApp on 01712345678 -> Chat opens for 8801712345678
  const waNum = formatWhatsAppNumber('01712345678');
  results.push({
    id: 'TC-09',
    name: 'WhatsApp International Format Conversion',
    requirement: 'FR-DON-05',
    passed: waNum === '8801712345678',
    expected: '8801712345678',
    actual: waNum,
  });

  return results;
}
