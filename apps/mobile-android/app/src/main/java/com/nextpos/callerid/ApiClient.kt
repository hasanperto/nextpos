package com.nextpos.callerid

import android.content.Context
import android.util.Log
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

object ApiClient {
    private const val TAG = "NextPOS_API"

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    fun sendCallerInfo(ctx: Context, phoneNumber: String, callback: ((Boolean, String) -> Unit)? = null) {
        val serverUrl = PrefsHelper.getServerUrl(ctx).trimEnd('/')
        val tenantId = PrefsHelper.getTenantId(ctx)
        val apiKey = PrefsHelper.getApiKey(ctx)

        if (serverUrl.isBlank() || tenantId.isBlank()) {
            Log.w(TAG, "Sunucu adresi veya Tenant ID boş, istek gönderilmedi")
            callback?.invoke(false, "Ayarlar eksik")
            return
        }

        val url = "$serverUrl/api/v1/integrations/caller-id?tenant=$tenantId&key=$apiKey"

        val json = JSONObject().apply {
            put("number", phoneNumber)
            put("name", "Android Çağrı")
            put("device", "NextPOS Caller ID v1.0")
            put("timestamp", java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US).format(java.util.Date()))
        }

        val body = json.toString().toRequestBody("application/json".toMediaType())
        val request = Request.Builder().url(url).post(body).build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e(TAG, "Gönderim hatası: ${e.message}")
                callback?.invoke(false, e.message ?: "Bağlantı hatası")
            }

            override fun onResponse(call: Call, response: Response) {
                val ok = response.isSuccessful
                val msg = if (ok) "Başarılı" else "HTTP ${response.code}"
                Log.i(TAG, "Yanıt: $msg ($phoneNumber)")
                callback?.invoke(ok, msg)
                response.close()
            }
        })
    }
}
