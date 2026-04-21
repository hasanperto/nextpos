package com.nextpos.callerid

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import android.util.Log

class CallReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "NextPOS_CallRcv"
        private var lastNumber: String? = null
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
        if (!PrefsHelper.isServiceEnabled(context)) return

        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return

        when (state) {
            TelephonyManager.EXTRA_STATE_RINGING -> {
                val number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
                if (!number.isNullOrBlank() && number != lastNumber) {
                    lastNumber = number
                    val cleanNumber = normalizeNumber(number)
                    Log.i(TAG, "Gelen çağrı: $cleanNumber")
                    ApiClient.sendCallerInfo(context, cleanNumber)
                }
            }
            TelephonyManager.EXTRA_STATE_IDLE -> {
                lastNumber = null
            }
        }
    }

    private fun normalizeNumber(number: String): String {
        var clean = number.replace(Regex("[^0-9+]"), "")

        // +90 ile başlıyorsa kaldır, 0 ekle
        if (clean.startsWith("+90")) {
            clean = "0${clean.substring(3)}"
        } else if (clean.startsWith("90") && clean.length == 12) {
            clean = "0${clean.substring(2)}"
        }

        // Başında 0 yoksa ekle
        if (!clean.startsWith("0") && clean.length == 10) {
            clean = "0$clean"
        }

        return clean
    }
}
