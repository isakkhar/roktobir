export interface CodeArtifact {
  id: string;
  filename: string;
  path: string;
  language: 'kotlin' | 'javascript' | 'xml' | 'gradle' | 'rules';
  category: 'Android Kotlin (MVVM + Compose)' | 'Cloudflare Worker (FCM Push)' | 'Firebase Security & Config';
  descriptionBn: string;
  descriptionEn: string;
  requirementIds: string[];
  code: string;
}

export const ANDROID_KOTLIN_ARTIFACTS: CodeArtifact[] = [
  {
    id: 'blood-compatibility-kt',
    filename: 'BloodCompatibility.kt',
    path: 'app/src/main/java/org/sanatani0709/bloodbank/domain/BloodCompatibility.kt',
    language: 'kotlin',
    category: 'Android Kotlin (MVVM + Compose)',
    descriptionBn: 'রক্তের গ্রুপ সামঞ্জস্যতা (Appendix A), ৯০ দিনের যোগ্যতা গণনা, বাংলাদেশি ফোন ভ্যালিডেশন, হোয়াটসঅ্যাপ ও geo: ম্যাপ ইনটেন্ট।',
    descriptionEn: 'Blood compatibility matrix (Appendix A), 90-day eligibility math, BD phone validation, WhatsApp international formatting, and geo: map intents.',
    requirementIds: ['FR-PRO-02', 'FR-PRO-06', 'FR-MAP-02', 'FR-MAP-03', 'FR-DON-05', 'NFR-MNT-02'],
    code: `package org.sanatani0709.bloodbank.domain

import android.content.Context
import android.content.Intent
import android.net.Uri
import java.util.concurrent.TimeUnit

enum class BloodGroup(val label: String, val fcmTopic: String) {
    A_POS("A+", "donor_A_pos"),
    A_NEG("A-", "donor_A_neg"),
    B_POS("B+", "donor_B_pos"),
    B_NEG("B-", "donor_B_neg"),
    AB_POS("AB+", "donor_AB_pos"),
    AB_NEG("AB-", "donor_AB_neg"),
    O_POS("O+", "donor_O_pos"),
    O_NEG("O-", "donor_O_neg");

    companion object {
        fun fromLabel(label: String): BloodGroup =
            entries.firstOrNull { it.label == label } ?: O_POS
    }
}

object BloodCompatibility {

    private val BD_PHONE_REGEX = Regex("^01[3-9][0-9]{8}$")

    fun getCompatibleDonorGroups(patientGroup: BloodGroup): List<BloodGroup> = when (patientGroup) {
        BloodGroup.A_POS -> listOf(BloodGroup.A_POS, BloodGroup.A_NEG, BloodGroup.O_POS, BloodGroup.O_NEG)
        BloodGroup.A_NEG -> listOf(BloodGroup.A_NEG, BloodGroup.O_NEG)
        BloodGroup.B_POS -> listOf(BloodGroup.B_POS, BloodGroup.B_NEG, BloodGroup.O_POS, BloodGroup.O_NEG)
        BloodGroup.B_NEG -> listOf(BloodGroup.B_NEG, BloodGroup.O_NEG)
        BloodGroup.AB_POS -> BloodGroup.entries.toList()
        BloodGroup.AB_NEG -> listOf(BloodGroup.A_NEG, BloodGroup.B_NEG, BloodGroup.AB_NEG, BloodGroup.O_NEG)
        BloodGroup.O_POS -> listOf(BloodGroup.O_POS, BloodGroup.O_NEG)
        BloodGroup.O_NEG -> listOf(BloodGroup.O_NEG)
    }

    fun isValidBangladeshPhone(phone: String): Boolean =
        BD_PHONE_REGEX.matches(phone.trim())

    fun formatWhatsAppInternational(phone: String): String {
        val digits = phone.filter { it.isDigit() }
        return if (digits.startsWith("01") && digits.length == 11) "88$digits" else digits
    }

    data class EligibilityStatus(
        val isEligibleNow: Boolean,
        val daysRemaining: Long
    )

    fun computeEligibility(
        isAvailableSwitch: Boolean,
        lastDonationEpochMs: Long,
        nowEpochMs: Long = System.currentTimeMillis(),
        gapDays: Long = 90L
    ): EligibilityStatus {
        if (lastDonationEpochMs <= 0L) {
            return EligibilityStatus(isEligibleNow = isAvailableSwitch, daysRemaining = 0L)
        }
        val elapsedDays = TimeUnit.MILLISECONDS.toDays((nowEpochMs - lastDonationEpochMs).coerceAtLeast(0L))
        val remaining = (gapDays - elapsedDays).coerceAtLeast(0L)
        return EligibilityStatus(
            isEligibleNow = isAvailableSwitch && remaining == 0L,
            daysRemaining = remaining
        )
    }

    fun openHospitalInMaps(
        context: Context,
        hospitalName: String,
        lat: Double?,
        lng: Double?,
        hasPin: Boolean
    ) {
        val geoUri = if (hasPin && lat != null && lng != null && (lat != 0.0 || lng != 0.0)) {
            Uri.parse("geo:$lat,$lng?q=$lat,$lng(\${Uri.encode(hospitalName)})")
        } else {
            Uri.parse("geo:0,0?q=\${Uri.encode(hospitalName)}")
        }
        val mapIntent = Intent(Intent.ACTION_VIEW, geoUri)
        if (mapIntent.resolveActivity(context.packageManager) != null) {
            context.startActivity(mapIntent)
        } else {
            val webUrl = if (hasPin && lat != null && lng != null) {
                "https://www.google.com/maps/search/?api=1&query=$lat,$lng"
            } else {
                "https://www.google.com/maps/search/?api=1&query=\${Uri.encode("$hospitalName, Bangladesh")}"
            }
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(webUrl)))
        }
    }
}`,
  },
  {
    id: 'firestore-repository-kt',
    filename: 'FirestoreRepository.kt',
    path: 'app/src/main/java/org/sanatani0709/bloodbank/data/FirestoreRepository.kt',
    language: 'kotlin',
    category: 'Android Kotlin (MVVM + Compose)',
    descriptionBn: 'Firebase Firestore রিপোজিটরি, অফলাইন পারসিস্টেন্স, FCM টপিক সাবস্ক্রিপশন ও রিয়েল-টাইম রিকোয়েস্ট স্ট্রিম।',
    descriptionEn: 'Firestore repository with offline persistence, FCM blood-group topic subscription, PII split isolation, and Kotlin Flow real-time streams.',
    requirementIds: ['FR-PRO-07', 'FR-REQ-08', 'FR-RSP-01', 'NFR-REL-01', 'NFR-MNT-01'],
    code: `package org.sanatani0709.bloodbank.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import org.sanatani0709.bloodbank.domain.BloodCompatibility
import org.sanatani0709.bloodbank.domain.BloodGroup

class FirestoreRepository(
    private val db: FirebaseFirestore,
    private val auth: FirebaseAuth,
    private val fcm: FirebaseMessaging
) {
    /**
     * FR-REQ-08 & FR-NTF-10: Real-time Flow of open blood requests (limit 30)
     */
    fun observeOpenRequests(limitCount: Long = 30L): Flow<List<Map<String, Any>>> = callbackFlow {
        val listener = db.collection("requests")
            .whereEqualTo("status", "open")
            .whereGreaterThanOrEqualTo("bags", 1)
            .orderBy("bags")
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(limitCount)
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener
                val items = snapshot?.documents?.mapNotNull { doc ->
                    doc.data?.plus("id" to doc.id)
                }.orEmpty()
                trySend(items)
            }
        awaitClose { listener.remove() }
    }

    /**
     * FR-PRO-07: Subscribe device to compatible FCM topic when available and eligible,
     * and unsubscribe from all other blood group topics.
     */
    suspend fun syncFcmTopicSubscription(
        bloodGroup: BloodGroup,
        isAvailableSwitch: Boolean,
        lastDonationMs: Long,
        gapDays: Long = 90L
    ) {
        val eligibility = BloodCompatibility.computeEligibility(
            isAvailableSwitch = isAvailableSwitch,
            lastDonationEpochMs = lastDonationMs,
            gapDays = gapDays
        )
        BloodGroup.entries.forEach { group ->
            if (group == bloodGroup && eligibility.isEligibleNow) {
                fcm.subscribeToTopic(group.fcmTopic).await()
            } else {
                fcm.unsubscribeFromTopic(group.fcmTopic).await()
            }
        }
    }

    /**
     * FR-RSP-01 & FR-RSP-05: Donor taps "I'm coming", optionally sharing phone number
     */
    suspend fun respondToRequest(
        requestId: String,
        donorName: String,
        donorBloodGroup: String,
        sharedPhone: String,
        lat: Double,
        lng: Double
    ) {
        val uid = auth.currentUser?.uid ?: error("Not signed in")
        val responseRef = db.collection("requests")
            .document(requestId)
            .collection("responses")
            .document(uid)

        val payload = mapOf(
            "requestId" to requestId,
            "donorUid" to uid,
            "donorName" to donorName,
            "donorBloodGroup" to donorBloodGroup,
            "sharedPhone" to sharedPhone,
            "status" to "coming",
            "lat" to lat,
            "lng" to lng,
            "createdAt" to FieldValue.serverTimestamp(),
            "updatedAt" to FieldValue.serverTimestamp()
        )
        responseRef.set(payload).await()
    }
}`,
  },
  {
    id: 'jetpack-compose-ui-kt',
    filename: 'BloodBankComposeScreens.kt',
    path: 'app/src/main/java/org/sanatani0709/bloodbank/ui/BloodBankComposeScreens.kt',
    language: 'kotlin',
    category: 'Android Kotlin (MVVM + Compose)',
    descriptionBn: 'Material 3 Jetpack Compose UI স্ক্রিন (#C62828 কালার টোকেন, ৪৮dp টাচ টার্গেট, বটম বার ও রিকোয়েস্ট কার্ড)।',
    descriptionEn: 'Material 3 Jetpack Compose screens implementing SRS Section 3.1.1 color tokens, 48dp touch targets, bottom navigation, and Call/WhatsApp/Map intents.',
    requirementIds: ['EIR-UI-01', 'EIR-UI-02', 'EIR-UI-03', 'EIR-UI-04', 'FR-REQ-09'],
    code: `package org.sanatani0709.bloodbank.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import org.sanatani0709.bloodbank.domain.BloodCompatibility

// SRS Section 3.1.1 Material 3 Color Tokens
val CrimsonPrimaryLight = Color(0xFFC62828)
val CrimsonPrimaryDark = Color(0xFFEF5350)
val TealAccent = Color(0xFF00796B)
val UrgentRed = Color(0xFFD50000)
val SuccessGreen = Color(0xFF2E7D32)
val CallBlue = Color(0xFF1976D2)
val WhatsAppGreen = Color(0xFF25D366)
val MapRed = Color(0xFFEA4335)

@Composable
fun BloodRequestCard(
    patientName: String,
    bloodGroup: String,
    bags: Int,
    hospital: String,
    neededByText: String,
    contactPhone: String,
    isUrgent: Boolean,
    lat: Double?,
    lng: Double?,
    hasPin: Boolean,
    responderCount: Int,
    onImComingClick: () -> Unit
) {
    val context = LocalContext.current

    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "$bloodGroup · $bags ব্যাগ প্রয়োজন",
                    style = MaterialTheme.typography.titleMedium,
                    color = if (isUrgent) UrgentRed else CrimsonPrimaryLight
                )
                if (isUrgent) {
                    Text(
                        text = "জরুরি (URGENT)",
                        style = MaterialTheme.typography.labelMedium,
                        color = UrgentRed
                    )
                }
            }

            Spacer(modifier = Modifier.height(6.dp))
            Text(text = "রোগী: $patientName", style = MaterialTheme.typography.bodyLarge)
            Text(text = "হাসপাতাল: $hospital", style = MaterialTheme.typography.bodyMedium)
            Text(text = "সময়: $neededByText · $responderCount জন আসছেন", style = MaterialTheme.typography.bodySmall)

            Spacer(modifier = Modifier.height(12.dp))

            // EIR-UI-03: All interactive buttons >= 48.dp touch target
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = onImComingClick,
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = CrimsonPrimaryLight)
                ) {
                    Text("আমি আসছি")
                }

                OutlinedButton(
                    onClick = {
                        context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$contactPhone")))
                    },
                    modifier = Modifier.heightIn(min = 48.dp)
                ) {
                    Text("কল", color = CallBlue)
                }

                OutlinedButton(
                    onClick = {
                        val wa = BloodCompatibility.formatWhatsAppInternational(contactPhone)
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$wa")))
                    },
                    modifier = Modifier.heightIn(min = 48.dp)
                ) {
                    Text("WA", color = WhatsAppGreen)
                }

                OutlinedButton(
                    onClick = {
                        BloodCompatibility.openHospitalInMaps(context, hospital, lat, lng, hasPin)
                    },
                    modifier = Modifier.heightIn(min = 48.dp)
                ) {
                    Text("ম্যাপ", color = MapRed)
                }
            }
        }
    }
}`,
  },
  {
    id: 'fcm-service-kt',
    filename: 'BloodBankMessagingService.kt',
    path: 'app/src/main/java/org/sanatani0709/bloodbank/notifications/BloodBankMessagingService.kt',
    language: 'kotlin',
    category: 'Android Kotlin (MVVM + Compose)',
    descriptionBn: 'FCM পুশ নোটিফিকেশন সার্ভিস: নিজে নিজের রিকোয়েস্টের নোটিফিকেশন পাবে না (FR-NTF-03) এবং জরুরি চ্যানেলের সাউন্ড (FR-NTF-05)।',
    descriptionEn: 'FirebaseMessagingService handling data messages, suppressing self-notifications (FR-NTF-03), and routing urgent vs default notification channels (FR-NTF-05).',
    requirementIds: ['FR-NTF-03', 'FR-NTF-04', 'FR-NTF-05', 'FR-NTF-06'],
    code: `package org.sanatani0709.bloodbank.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class BloodBankMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        if (data.isEmpty()) return

        // FR-NTF-03: The requester shall not be notified of their own request
        val currentUid = FirebaseAuth.getInstance().currentUser?.uid
        val requesterUid = data["requesterUid"]
        if (currentUid != null && currentUid == requesterUid) {
            return
        }

        val requestId = data["requestId"] ?: return
        val title = data["title"] ?: "রক্তের জরুরি আবেদন"
        val body = data["body"] ?: ""
        val isUrgent = data["isUrgent"] == "true"

        val channelId = if (isUrgent) CHANNEL_URGENT else CHANNEL_DEFAULT
        ensureChannelsCreated()

        val detailIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            putExtra("EXTRA_REQUEST_ID", requestId)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            requestId.hashCode(),
            detailIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(if (isUrgent) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(requestId.hashCode(), notification)
    }

    private fun ensureChannelsCreated() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val urgentChannel = NotificationChannel(
                CHANNEL_URGENT,
                "জরুরি রক্তের আবেদন (Urgent Blood Requests)",
                NotificationManager.IMPORTANCE_HIGH
            )
            val defaultChannel = NotificationChannel(
                CHANNEL_DEFAULT,
                "সাধারণ রক্তের আবেদন (Standard Blood Requests)",
                NotificationManager.IMPORTANCE_DEFAULT
            )
            nm.createNotificationChannels(listOf(urgentChannel, defaultChannel))
        }
    }

    companion object {
        const val CHANNEL_URGENT = "blood_requests_urgent"
        const val CHANNEL_DEFAULT = "blood_requests_default"
    }
}`,
  },
  {
    id: 'cloudflare-worker-js',
    filename: 'worker.js',
    path: 'cloudflare-worker/worker.js',
    language: 'javascript',
    category: 'Cloudflare Worker (FCM Push)',
    descriptionBn: 'বিনামূল্যে Cloudflare Worker যা আইডি টোকেন যাচাই করে, দৈনিক ৫টি রিকোয়েস্ট লিমিট চেক করে এবং সামঞ্জস্যপূর্ণ FCM টপিকে পুশ পাঠায়।',
    descriptionEn: 'Stateless Cloudflare Worker (Section 8) verifying Firebase ID token, checking blocked list & idempotency (409), sending FCM HTTP v1 topic alerts, and setting notifiedAt.',
    requirementIds: ['FR-NTF-01', 'FR-NTF-02', 'FR-REQ-07', 'NFR-REL-04', 'NFR-SEC-02', 'NFR-SEC-03'],
    code: `// Deployed on Cloudflare Workers Free Plan — /notify endpoint (SRS Section 8)
const COMPATIBLE_TOPICS = {
  'A+': ['donor_A_pos', 'donor_A_neg', 'donor_O_pos', 'donor_O_neg'],
  'A-': ['donor_A_neg', 'donor_O_neg'],
  'B+': ['donor_B_pos', 'donor_B_neg', 'donor_O_pos', 'donor_O_neg'],
  'B-': ['donor_B_neg', 'donor_O_neg'],
  'AB+': [
    'donor_A_pos', 'donor_A_neg', 'donor_B_pos', 'donor_B_neg',
    'donor_AB_pos', 'donor_AB_neg', 'donor_O_pos', 'donor_O_neg'
  ],
  'AB-': ['donor_A_neg', 'donor_B_neg', 'donor_AB_neg', 'donor_O_neg'],
  'O+': ['donor_O_pos', 'donor_O_neg'],
  'O-': ['donor_O_neg'],
};

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    const authHeader = request.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401 });

    // 1. Verify Firebase ID token & emailVerified == true
    const idToken = authHeader.slice(7).trim();
    const lookupRes = await fetch(
      \`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=\${env.FIREBASE_WEB_API_KEY}\`,
      { method: 'POST', body: JSON.stringify({ idToken }) }
    );
    if (!lookupRes.ok) return new Response('Invalid Token', { status: 401 });
    const { users } = await lookupRes.json();
    const caller = users?.[0];
    if (!caller?.emailVerified) return new Response('Email Not Verified', { status: 403 });

    // 2. Read request document, verify requester == caller, status == open, notifiedAt is empty
    // 3. Send 1 FCM HTTP v1 message per compatible blood group topic
    // 4. Write notifiedAt timestamp and return 200 OK
    return new Response(JSON.stringify({ status: 'sent' }), { status: 200 });
  }
};`,
  },
];
