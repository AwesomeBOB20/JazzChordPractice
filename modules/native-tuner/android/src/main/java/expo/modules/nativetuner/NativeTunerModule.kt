package expo.modules.nativetuner

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.concurrent.thread
import kotlin.math.abs
import kotlin.math.log2
import kotlin.math.roundToInt

class NativeTunerModule : Module() {
  private var audioRecord: AudioRecord? = null
  private var isRecording = false
  private val sampleRate = 44100
  private val bufferSize = 4096

  override fun definition() = ModuleDefinition {
    Name("NativeTuner")
    Events("onPitchDetected")

    Function("startListening") {
      startAudioProcessing()
    }

    Function("stopListening") {
      stopAudioProcessing()
    }
  }

  private fun startAudioProcessing() {
    if (isRecording) return

    val context = appContext.reactContext ?: return
    
    // Safety check: Ensure JS side requested permissions
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      println("NativeTuner: Microphone permission denied!")
      return
    }

    val minBufferSize = AudioRecord.getMinBufferSize(
      sampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT
    )
    val size = if (minBufferSize > bufferSize) minBufferSize else bufferSize

    audioRecord = AudioRecord(
      MediaRecorder.AudioSource.MIC,
      sampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      size
    )

    audioRecord?.startRecording()
    isRecording = true

    // Fire up the DSP on a dedicated background thread so the UI stays at 60 FPS
    thread(start = true) {
      val buffer = ShortArray(bufferSize)
      while (isRecording) {
        val readSize = audioRecord?.read(buffer, 0, buffer.size) ?: 0
        if (readSize > 0) {
          val pitch = detectPitch(buffer)
          
          // Lock onto standard guitar ranges
          if (pitch in 60.0..1500.0) { 
            val cents = calculateCents(pitch)
            this@NativeTunerModule.sendEvent("onPitchDetected", mapOf(
              "frequency" to pitch,
              "cents" to cents
            ))
          }
        }
      }
    }
  }

  private fun stopAudioProcessing() {
    isRecording = false
    audioRecord?.stop()
    audioRecord?.release()
    audioRecord = null
  }

  private fun detectPitch(buffer: ShortArray): Double {
    // 1. Hardware Noise Gate - Lowered drastically to pick up quiet/sustaining notes!
    var maxVal = 0f
    for (i in buffer.indices) {
        val value = abs(buffer[i].toFloat())
        if (value > maxVal) maxVal = value
    }
    // If the signal is too quiet, it's just room noise. Ignore it.
    if (maxVal < 100f) return 0.0 

    // YIN ALGORITHM for ultra-precise and sensitive pitch detection
    val yinBufferLength = buffer.size / 2
    val yinBuffer = FloatArray(yinBufferLength)

    // Step 1: Difference function
    for (tau in 1 until yinBufferLength) {
        for (i in 0 until yinBufferLength) {
            val delta = buffer[i].toFloat() - buffer[i + tau].toFloat()
            yinBuffer[tau] += delta * delta
        }
    }

    // Step 2: Cumulative mean normalized difference function
    yinBuffer[0] = 1f
    var runningSum = 0f
    for (tau in 1 until yinBufferLength) {
        runningSum += yinBuffer[tau]
        yinBuffer[tau] *= tau / runningSum
    }

    // Step 3: Absolute threshold
    var tauEstimate = -1
    val threshold = 0.15f // Standard YIN threshold
    for (tau in 2 until yinBufferLength) {
        if (yinBuffer[tau] < threshold) {
            var tempTau = tau
            while (tempTau + 1 < yinBufferLength && yinBuffer[tempTau + 1] < yinBuffer[tempTau]) {
                tempTau++
            }
            tauEstimate = tempTau
            break
        }
    }

    // If no pitch found below threshold, find the absolute minimum
    if (tauEstimate == -1) {
        var minVal = Float.MAX_VALUE
        for (tau in 2 until yinBufferLength) {
            if (yinBuffer[tau] < minVal) {
                minVal = yinBuffer[tau]
                tauEstimate = tau
            }
        }
        if (minVal > 0.5f) return 0.0 // Still too noisy, not a clear pitch
    }

    // Step 4: Parabolic interpolation for sub-sample precision
    var betterTau = tauEstimate.toFloat()
    if (tauEstimate > 0 && tauEstimate < yinBufferLength - 1) {
        val s0 = yinBuffer[tauEstimate - 1]
        val s1 = yinBuffer[tauEstimate]
        val s2 = yinBuffer[tauEstimate + 1]
        
        val denominator = 2f * s1 - s2 - s0
        if (denominator != 0f) {
            betterTau += (s2 - s0) / (2f * denominator)
        }
    }

    if (betterTau <= 0) return 0.0

    // 5. Return the exact Hz
    return sampleRate.toDouble() / betterTau
  }

  private fun calculateCents(frequency: Double): Double {
    // Math to convert raw Hz into standard 440 tuning cents
    val referenceA4 = 440.0
    val noteFloat = 12.0 * log2(frequency / referenceA4) + 69.0
    val noteIndex = noteFloat.roundToInt()
    return (noteFloat - noteIndex) * 100.0
  }
}