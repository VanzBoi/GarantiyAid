package expo.modules.garantiyaidface

import android.graphics.BitmapFactory
import android.graphics.Bitmap
import android.graphics.Matrix
import android.net.Uri
import android.speech.tts.TextToSpeech
import androidx.exifinterface.media.ExifInterface
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.Locale
import kotlin.math.abs

class GarantiyAidFaceDetectorModule : Module() {
  private var speech: TextToSpeech? = null
  private var speechGeneration = 0
  private val detector by lazy {
    FaceDetection.getClient(FaceDetectorOptions.Builder()
      .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
      .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
      .setMinFaceSize(0.15f).build())
  }
  private val textRecognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

  /** Decodes an app-owned cache image (camera or picker copy) upright. Never reads remote or shared files. */
  private fun uprightCacheBitmap(uri: String, maxSide: Int = 0): Bitmap {
    val context = appContext.reactContext ?: throw IllegalStateException("Context unavailable")
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file") { "Expected a camera cache file" }
    val file = File(parsed.path ?: "").canonicalFile
    require(file.path.startsWith(context.cacheDir.canonicalPath + File.separator)) { "Not an app cache file" }
    val options = BitmapFactory.Options()
    if (maxSide > 0) {
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(file.path, bounds)
      var sample = 1
      while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
      options.inSampleSize = sample
    }
    val original = BitmapFactory.decodeFile(file.path, options) ?: throw IllegalArgumentException("Invalid image")
    val exif = ExifInterface(file.path)
    val matrix = Matrix().apply {
      postRotate(exif.rotationDegrees.toFloat())
      if (exif.isFlipped) postScale(-1f, 1f)
    }
    val bitmap = Bitmap.createBitmap(original, 0, 0, original.width, original.height, matrix, true)
    if (bitmap !== original) original.recycle()
    return bitmap
  }

  override fun definition() = ModuleDefinition {
    Name("GarantiyAidFaceDetector")
    Function("speak") { text: String ->
      val context = appContext.reactContext ?: return@Function
      val generation = ++speechGeneration
      val say = {
        if (generation == speechGeneration) {
          speech?.language = Locale.US
          speech?.setSpeechRate(0.9f)
          speech?.speak(text.take(200), TextToSpeech.QUEUE_FLUSH, null, "face-guidance")
        }
      }
      if (speech == null) speech = TextToSpeech(context) { status -> if (status == TextToSpeech.SUCCESS) say() }
      else say()
    }
    Function("stopSpeaking") { speechGeneration++; speech?.stop(); Unit }
    AsyncFunction("recognizeText") { uri: String, promise: Promise ->
      val bitmap = uprightCacheBitmap(uri, 2400)
      textRecognizer.process(InputImage.fromBitmap(bitmap, 0))
        .addOnSuccessListener { result ->
          val lines = result.textBlocks.flatMap { block -> block.lines }.map { line ->
            val box = line.boundingBox
            mapOf(
              "text" to line.text,
              "x" to (box?.left ?: 0).toDouble() / bitmap.width,
              "y" to (box?.top ?: 0).toDouble() / bitmap.height,
              "height" to (box?.height() ?: 0).toDouble() / bitmap.height
            )
          }
          promise.resolve(mapOf("text" to result.text, "lines" to lines))
        }
        .addOnFailureListener { promise.reject("TEXT_RECOGNITION_FAILED", "Could not read the ID photo", it) }
        .addOnCompleteListener { bitmap.recycle() }
    }
    AsyncFunction("analyze") { uri: String, promise: Promise ->
      val bitmap = uprightCacheBitmap(uri)
      val sample = Bitmap.createScaledBitmap(bitmap, 160, 120, true)
      val pixels = IntArray(160 * 120)
      sample.getPixels(pixels, 0, 160, 0, 0, 160, 120)
      fun luma(index: Int): Double {
        val p = pixels[index]
        return ((p shr 16) and 255) * .299 + ((p shr 8) and 255) * .587 + (p and 255) * .114
      }
      var light = 0.0
      var edges = 0.0
      for (y in 1 until 119) for (x in 1 until 159) {
        val i = y * 160 + x
        val value = luma(i)
        light += value
        edges += abs(4 * value - luma(i - 1) - luma(i + 1) - luma(i - 160) - luma(i + 160))
      }
      if (sample !== bitmap) sample.recycle()
      detector.process(InputImage.fromBitmap(bitmap, 0))
        .addOnSuccessListener { faces ->
          val face = faces.firstOrNull()
          val bounds = face?.boundingBox
          promise.resolve(mapOf(
            "count" to faces.size,
            "x" to (bounds?.left ?: 0).toDouble() / bitmap.width,
            "y" to (bounds?.top ?: 0).toDouble() / bitmap.height,
            "width" to (bounds?.width() ?: 0).toDouble() / bitmap.width,
            "height" to (bounds?.height() ?: 0).toDouble() / bitmap.height,
            "yaw" to (face?.headEulerAngleY ?: 0f), "roll" to (face?.headEulerAngleZ ?: 0f),
            "leftEye" to (face?.leftEyeOpenProbability ?: -1f),
            "rightEye" to (face?.rightEyeOpenProbability ?: -1f),
            "brightness" to light / (118 * 158), "sharpness" to edges / (118 * 158)
          ))
        }
        .addOnFailureListener { promise.reject("FACE_ANALYSIS_FAILED", "Could not analyze camera image", it) }
        .addOnCompleteListener { bitmap.recycle() }
    }
    OnDestroy { detector.close(); textRecognizer.close(); speechGeneration++; speech?.stop(); speech?.shutdown() }
  }
}
