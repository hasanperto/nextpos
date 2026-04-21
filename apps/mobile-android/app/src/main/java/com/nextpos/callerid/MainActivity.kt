package com.nextpos.callerid

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.net.Uri
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.android.material.materialswitch.MaterialSwitch

class MainActivity : AppCompatActivity() {
    companion object {
        private const val RC_PERMISSIONS = 100
    }

    private lateinit var etServerUrl: EditText
    private lateinit var etTenantId: EditText
    private lateinit var etApiKey: EditText
    private lateinit var switchService: MaterialSwitch
    private lateinit var btnSave: Button
    private lateinit var btnTest: Button
    private lateinit var btnBattery: Button
    private lateinit var tvStatus: TextView
    private lateinit var tvLog: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        etServerUrl = findViewById(R.id.etServerUrl)
        etTenantId = findViewById(R.id.etTenantId)
        etApiKey = findViewById(R.id.etApiKey)
        switchService = findViewById(R.id.switchService)
        btnSave = findViewById(R.id.btnSave)
        btnTest = findViewById(R.id.btnTest)
        btnBattery = findViewById(R.id.btnBattery)
        tvStatus = findViewById(R.id.tvStatus)
        tvLog = findViewById(R.id.tvLog)

        loadSettings()
        setupListeners()
        checkPermissions()
    }

    private fun loadSettings() {
        etServerUrl.setText(PrefsHelper.getServerUrl(this))
        etTenantId.setText(PrefsHelper.getTenantId(this))
        etApiKey.setText(PrefsHelper.getApiKey(this))
        switchService.isChecked = PrefsHelper.isServiceEnabled(this)
        updateStatusText()
    }

    private fun setupListeners() {
        btnSave.setOnClickListener { saveSettings() }

        btnTest.setOnClickListener { sendTestCall() }
        btnBattery.setOnClickListener { requestBatteryOptimizationWhitelist() }

        switchService.setOnCheckedChangeListener { _, isChecked ->
            PrefsHelper.setServiceEnabled(this, isChecked)
            if (isChecked) {
                startCallerIdService()
            } else {
                stopCallerIdService()
            }
            updateStatusText()
        }
    }

    private fun requestBatteryOptimizationWhitelist() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            appendLog("Batarya optimizasyonu: Bu Android sürümünde gerekli değil")
            return
        }
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        val packageName = packageName
        if (pm.isIgnoringBatteryOptimizations(packageName)) {
            appendLog("Batarya optimizasyonu zaten devre dışı ✓")
            Toast.makeText(this, "Batarya optimizasyonu zaten devre dışı", Toast.LENGTH_SHORT).show()
            return
        }
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
            }
            startActivity(intent)
            appendLog("Batarya optimizasyonu istisna ekranı açıldı")
        } catch (e: Exception) {
            appendLog("Batarya optimizasyonu ekranı açılamadı: ${e.message}")
            Toast.makeText(this, "Cihaz ayarlarından manuel izin verin", Toast.LENGTH_LONG).show()
        }
    }

    private fun saveSettings() {
        val url = etServerUrl.text.toString().trim()
        val tenant = etTenantId.text.toString().trim()
        val key = etApiKey.text.toString().trim()

        if (url.isBlank() || tenant.isBlank()) {
            Toast.makeText(this, "Sunucu adresi ve Tenant ID zorunludur", Toast.LENGTH_SHORT).show()
            return
        }

        PrefsHelper.setServerUrl(this, url)
        PrefsHelper.setTenantId(this, tenant)
        PrefsHelper.setApiKey(this, key.ifBlank { "DEMO" })

        Toast.makeText(this, "Ayarlar kaydedildi", Toast.LENGTH_SHORT).show()
        appendLog("Ayarlar güncellendi → $url")
    }

    private fun sendTestCall() {
        saveSettings()
        val testNumber = "05321112233"
        appendLog("Test çağrısı gönderiliyor: $testNumber")

        ApiClient.sendCallerInfo(this, testNumber) { success, message ->
            runOnUiThread {
                if (success) {
                    appendLog("✓ Test başarılı: $message")
                    tvStatus.text = "Durum: Bağlı ✓"
                    tvStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_green_dark))
                } else {
                    appendLog("✗ Test başarısız: $message")
                    tvStatus.text = "Durum: Hata ✗"
                    tvStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_red_dark))
                }
            }
        }
    }

    private fun startCallerIdService() {
        val intent = Intent(this, CallerIdService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
        appendLog("Servis başlatıldı")
    }

    private fun stopCallerIdService() {
        stopService(Intent(this, CallerIdService::class.java))
        appendLog("Servis durduruldu")
    }

    private fun updateStatusText() {
        if (PrefsHelper.isServiceEnabled(this)) {
            tvStatus.text = "Durum: Aktif — Dinleniyor"
            tvStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_green_dark))
        } else {
            tvStatus.text = "Durum: Kapalı"
            tvStatus.setTextColor(ContextCompat.getColor(this, android.R.color.darker_gray))
        }
    }

    private fun appendLog(msg: String) {
        val time = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())
        val line = "[$time] $msg\n"
        tvLog.append(line)
    }

    private fun checkPermissions() {
        val needed = mutableListOf<String>()

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.READ_PHONE_STATE)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.READ_CALL_LOG)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        if (needed.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toTypedArray(), RC_PERMISSIONS)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == RC_PERMISSIONS) {
            val denied = permissions.zip(grantResults.toTypedArray())
                .filter { it.second != PackageManager.PERMISSION_GRANTED }
                .map { it.first.substringAfterLast('.') }

            if (denied.isNotEmpty()) {
                appendLog("⚠ İzin reddedildi: ${denied.joinToString()}")
                Toast.makeText(this, "Çağrı dinleme için izinler gerekli!", Toast.LENGTH_LONG).show()
            } else {
                appendLog("İzinler verildi ✓")
            }
        }
    }
}
