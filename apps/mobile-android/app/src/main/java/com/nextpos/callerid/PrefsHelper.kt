package com.nextpos.callerid

import android.content.Context
import android.content.SharedPreferences

object PrefsHelper {
    private const val PREFS_NAME = "nextpos_caller_id"
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_TENANT_ID = "tenant_id"
    private const val KEY_API_KEY = "api_key"
    private const val KEY_SERVICE_ENABLED = "service_enabled"

    private fun prefs(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getServerUrl(ctx: Context): String =
        prefs(ctx).getString(KEY_SERVER_URL, "") ?: ""

    fun setServerUrl(ctx: Context, url: String) =
        prefs(ctx).edit().putString(KEY_SERVER_URL, url).apply()

    fun getTenantId(ctx: Context): String =
        prefs(ctx).getString(KEY_TENANT_ID, "") ?: ""

    fun setTenantId(ctx: Context, id: String) =
        prefs(ctx).edit().putString(KEY_TENANT_ID, id).apply()

    fun getApiKey(ctx: Context): String =
        prefs(ctx).getString(KEY_API_KEY, "DEMO") ?: "DEMO"

    fun setApiKey(ctx: Context, key: String) =
        prefs(ctx).edit().putString(KEY_API_KEY, key).apply()

    fun isServiceEnabled(ctx: Context): Boolean =
        prefs(ctx).getBoolean(KEY_SERVICE_ENABLED, false)

    fun setServiceEnabled(ctx: Context, enabled: Boolean) =
        prefs(ctx).edit().putBoolean(KEY_SERVICE_ENABLED, enabled).apply()
}
