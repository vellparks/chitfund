package com.licensegeneratorapp

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import java.security.MessageDigest

class SimpleActivity : AppCompatActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.activity_simple)

    val input = findViewById<EditText>(R.id.productInput)
    val generate = findViewById<Button>(R.id.generateButton)
    val licenseValue = findViewById<TextView>(R.id.licenseValue)
    val errorText = findViewById<TextView>(R.id.errorText)
    val copyButton = findViewById<Button>(R.id.copyButton)
    val rootContainer = findViewById<View>(R.id.rootContainer)
    val cardRoot = findViewById<View>(R.id.cardRoot)
    val themeDark = findViewById<Button>(R.id.themeDark)
    val themeBlue = findViewById<Button>(R.id.themeBlue)
    val themeGreen = findViewById<Button>(R.id.themeGreen)

    val prefs = getSharedPreferences("setlive_prefs", Context.MODE_PRIVATE)
    val currentTheme = prefs.getString("theme", "dark") ?: "dark"
    applyTheme(currentTheme, rootContainer, cardRoot, generate)

    generate.setOnClickListener {
      val code = input.text?.toString()?.trim().orEmpty()
      try {
        errorText.text = ""
        val key = computeLicenseKey(code)
        licenseValue.text = key
      } catch (e: Exception) {
        licenseValue.text = ""
        errorText.text = e.message ?: "Error generating key"
      }
    }

    copyButton.setOnClickListener {
      val key = licenseValue.text?.toString()?.trim().orEmpty()
      if (key.isNotEmpty()) {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("License Key", key)
        clipboard.setPrimaryClip(clip)
        Toast.makeText(this, "License key copied", Toast.LENGTH_SHORT).show()
      } else {
        Toast.makeText(this, "No license key to copy", Toast.LENGTH_SHORT).show()
      }
    }

    themeDark.setOnClickListener {
      applyTheme("dark", rootContainer, cardRoot, generate)
      prefs.edit().putString("theme", "dark").apply()
    }

    themeBlue.setOnClickListener {
      applyTheme("blue", rootContainer, cardRoot, generate)
      prefs.edit().putString("theme", "blue").apply()
    }

    themeGreen.setOnClickListener {
      applyTheme("green", rootContainer, cardRoot, generate)
      prefs.edit().putString("theme", "green").apply()
    }
  }

  private fun applyTheme(name: String, root: View, card: View, button: Button) {
    when (name) {
      "blue" -> {
        root.setBackgroundColor(0xFF0f172a.toInt())
        card.setBackgroundColor(0xFF111827.toInt())
        button.setBackgroundColor(0xFF1d4ed8.toInt())
      }
      "green" -> {
        root.setBackgroundColor(0xFF022c22.toInt())
        card.setBackgroundColor(0xFF064e3b.toInt())
        button.setBackgroundColor(0xFF047857.toInt())
      }
      else -> {
        root.setBackgroundColor(0xFF0f172a.toInt())
        card.setBackgroundColor(0xFF020617.toInt())
        button.setBackgroundColor(0xFF22c55e.toInt())
      }
    }
  }

  private fun computeLicenseKey(productCode: String): String {
    val secret = "FM-LIC-SECRET-2026"
    val base = productCode.replace("-", "").uppercase()
    if (base.isEmpty() || base.length < 16) {
      throw IllegalArgumentException("Invalid product code")
    }
    val hash = sha256Hex(base + secret).uppercase()
    val core = hash.substring(0, 20)
    return core.chunked(5).joinToString("-")
  }

  private fun sha256Hex(text: String): String {
    val md = MessageDigest.getInstance("SHA-256")
    val bytes = md.digest(text.toByteArray(Charsets.UTF_8))
    val sb = StringBuilder(bytes.size * 2)
    for (b in bytes) {
      val v = b.toInt() and 0xFF
      if (v < 16) sb.append('0')
      sb.append(v.toString(16))
    }
    return sb.toString()
  }
}
