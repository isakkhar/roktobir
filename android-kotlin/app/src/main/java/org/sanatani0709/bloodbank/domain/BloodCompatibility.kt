package org.sanatani0709.bloodbank.domain

import android.content.Context
import android.content.Intent
import android.net.Uri
import java.util.concurrent.TimeUnit

/**
 * 0709 সনাতনী ব্লাড ব্যাংক — Domain Logic & Compatibility (SRS Section 4 & Appendix A)
 */
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

    /**
     * Appendix A – Compatible donor groups for a given patient group
     */
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

    /**
     * FR-PRO-02 / TC-03: Validate Bangladeshi 11-digit mobile number
     */
    fun isValidBangladeshPhone(phone: String): Boolean =
        BD_PHONE_REGEX.matches(phone.trim())

    /**
     * FR-DON-05 / TC-09: Convert 01712345678 to 8801712345678 for WhatsApp
     */
    fun formatWhatsAppInternational(phone: String): String {
        val digits = phone.filter { it.isDigit() }
        return if (digits.startsWith("01") && digits.length == 11) "88$digits" else digits
    }

    /**
     * FR-PRO-06 / TC-06: Compute donor eligibility and remaining days (default 90-day gap)
     */
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

    /**
     * FR-MAP-01 to FR-MAP-04 / TC-07 & TC-08: Open Hospital in Maps with browser fallback
     */
    fun openHospitalInMaps(
        context: Context,
        hospitalName: String,
        lat: Double?,
        lng: Double?,
        hasPin: Boolean
    ) {
        val geoUri = if (hasPin && lat != null && lng != null && (lat != 0.0 || lng != 0.0)) {
            Uri.parse("geo:$lat,$lng?q=$lat,$lng(${Uri.encode(hospitalName)})")
        } else {
            Uri.parse("geo:0,0?q=${Uri.encode(hospitalName)}")
        }
        val mapIntent = Intent(Intent.ACTION_VIEW, geoUri)
        if (mapIntent.resolveActivity(context.packageManager) != null) {
            context.startActivity(mapIntent)
        } else {
            val webUrl = if (hasPin && lat != null && lng != null) {
                "https://www.google.com/maps/search/?api=1&query=$lat,$lng"
            } else {
                "https://www.google.com/maps/search/?api=1&query=${Uri.encode("$hospitalName, Bangladesh")}"
            }
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(webUrl)))
        }
    }
}
