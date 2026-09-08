package com.redcalf.keepflick.photomonths

import android.content.ContentUris
import android.database.Cursor
import android.graphics.Bitmap
import android.net.Uri
import android.provider.MediaStore
import android.util.Log
import android.util.Size
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream
import java.time.Instant
import java.time.Month
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.TextStyle
import java.util.Locale
import java.util.LinkedHashMap
import java.util.LinkedHashSet

class PhotoMonthsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val zoneId: ZoneId = ZoneId.systemDefault()
    private val externalUri: Uri = MediaStore.Files.getContentUri("external")

    override fun getName(): String = "PhotoMonths"

    private fun Cursor.getOptionalLong(index: Int): Long? =
        if (index >= 0 && !isNull(index)) getLong(index) else null

    private fun resolveTimestampMillis(cursor: Cursor, dateTakenIndex: Int, dateAddedIndex: Int): Long {
        val dateTaken = cursor.getOptionalLong(dateTakenIndex) ?: 0L
        val dateAddedSeconds = cursor.getOptionalLong(dateAddedIndex) ?: 0L
        return when {
            dateTaken > 0L -> dateTaken
            dateAddedSeconds > 0L -> dateAddedSeconds * 1000L
            else -> 0L
        }
    }

    private fun toMonthKey(tsMillis: Long): Triple<String, Int, Int> {
        val zoned = Instant.ofEpochMilli(tsMillis).atZone(zoneId)
        val year = zoned.year
        val month = zoned.monthValue
        val monthKey = "%04d-%02d".format(year, month)
        return Triple(monthKey, year, month)
    }

    private fun monthRangeMillis(monthKey: String): Pair<Long, Long> {
        val parts = monthKey.split("-")
        require(parts.size == 2)

        val year = parts[0].toInt()
        val month = parts[1].toInt()

        val start = ZonedDateTime.of(year, month, 1, 0, 0, 0, 0, zoneId).toInstant().toEpochMilli()
        val end = ZonedDateTime.of(year, month, 1, 0, 0, 0, 0, zoneId)
            .plusMonths(1)
            .toInstant()
            .toEpochMilli()

        return start to end
    }

    private fun displayMonth(year: Int, month: Int): String =
        "${Month.of(month).getDisplayName(TextStyle.FULL, Locale.ENGLISH)} $year"

    @ReactMethod
    fun fetchMonths(promise: Promise) {
        val startTime = System.currentTimeMillis()
        try {
            val projection = arrayOf(
                MediaStore.Files.FileColumns._ID,
                MediaStore.Files.FileColumns.MEDIA_TYPE,
                MediaStore.Images.Media.DATE_TAKEN,
                MediaStore.Files.FileColumns.DATE_ADDED
            )
            val selection =
                "${MediaStore.Files.FileColumns.MEDIA_TYPE}=? OR ${MediaStore.Files.FileColumns.MEDIA_TYPE}=?"
            val selectionArgs = arrayOf(
                MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE.toString(),
                MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO.toString()
            )
            val sortOrder =
                "${MediaStore.Images.Media.DATE_TAKEN} DESC, ${MediaStore.Files.FileColumns.DATE_ADDED} DESC"

            val monthKeys = LinkedHashSet<String>()
            val monthMeta = LinkedHashMap<String, Pair<Int, Int>>()

            reactContext.contentResolver.query(
                externalUri,
                projection,
                selection,
                selectionArgs,
                sortOrder
            )?.use { cursor ->
                val dateTakenIndex = cursor.getColumnIndex(MediaStore.Images.Media.DATE_TAKEN)
                val dateAddedIndex = cursor.getColumnIndex(MediaStore.Files.FileColumns.DATE_ADDED)

                val monthCap = 240 // ~20 years of months

                while (cursor.moveToNext() && monthKeys.size < monthCap) {
                    val tsMillis = resolveTimestampMillis(cursor, dateTakenIndex, dateAddedIndex)
                    if (tsMillis <= 0L) continue

                    val (key, year, month) = toMonthKey(tsMillis)
                    if (monthKeys.add(key)) {
                        monthMeta[key] = year to month
                    }
                }
            }

            val result = Arguments.createArray()
            monthKeys.forEach { key ->
                val (year, month) = monthMeta[key] ?: return@forEach
                val map = Arguments.createMap()
                map.putString("monthKey", key)
                map.putInt("year", year)
                map.putInt("month", month)
                map.putString("monthName", displayMonth(year, month))
                map.putInt("totalCount", 0) // Lazy loaded to match iOS behavior
                map.putInt("photoCount", 0)
                map.putInt("videoCount", 0)
                map.putBoolean("hasMore", true)
                result.pushMap(map)
            }

            val endTime = System.currentTimeMillis()
            Log.d(
                "PhotoMonths",
                "fetchMonths: total ${endTime - startTime} ms, months=${result.size()}"
            )
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_MONTH_QUERY", "Failed to fetch months", e)
        }
    }

    @ReactMethod
    fun fetchAllPhotos(promise: Promise) {
        val startTime = System.currentTimeMillis()
        try {
            val projection = arrayOf(
                MediaStore.Files.FileColumns._ID,
                MediaStore.Files.FileColumns.MEDIA_TYPE,
                MediaStore.Images.Media.DATE_TAKEN,
                MediaStore.Files.FileColumns.DATE_ADDED,
                MediaStore.Files.FileColumns.DISPLAY_NAME
            )

            val selection =
                "${MediaStore.Files.FileColumns.MEDIA_TYPE}=? OR ${MediaStore.Files.FileColumns.MEDIA_TYPE}=?"
            val selectionArgs = arrayOf(
                MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE.toString(),
                MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO.toString()
            )
            val sortOrder =
                "${MediaStore.Images.Media.DATE_TAKEN} DESC, ${MediaStore.Files.FileColumns.DATE_ADDED} DESC LIMIT 2000"

            val result = Arguments.createArray()

            reactContext.contentResolver.query(
                externalUri,
                projection,
                selection,
                selectionArgs,
                sortOrder
            )?.use { cursor ->
                val idIndex = cursor.getColumnIndex(MediaStore.Files.FileColumns._ID)
                val typeIndex = cursor.getColumnIndex(MediaStore.Files.FileColumns.MEDIA_TYPE)
                val dateTakenIndex = cursor.getColumnIndex(MediaStore.Images.Media.DATE_TAKEN)
                val dateAddedIndex = cursor.getColumnIndex(MediaStore.Files.FileColumns.DATE_ADDED)
                val nameIndex = cursor.getColumnIndex(MediaStore.Files.FileColumns.DISPLAY_NAME)

                while (cursor.moveToNext()) {
                    val tsMillis = resolveTimestampMillis(cursor, dateTakenIndex, dateAddedIndex)
                    if (tsMillis <= 0L) continue

                    val id = cursor.getLong(idIndex)
                    val type = cursor.getInt(typeIndex)
                    val displayName = cursor.getString(nameIndex) ?: "media"

                    val contentUri: Uri = if (type == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO) {
                        ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)
                    } else {
                        ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
                    }

                    val map = Arguments.createMap()
                    map.putString("id", id.toString())
                    map.putString("uri", contentUri.toString())
                    map.putString(
                        "type",
                        if (type == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO) "video" else "photo"
                    )
                    map.putDouble("timestamp", tsMillis.toDouble())
                    map.putString("source", "Gallery")
                    map.putString("filename", displayName)
                    result.pushMap(map)

                    if (result.size() >= 2000) break
                }
            }

            val endTime = System.currentTimeMillis()
            Log.d(
                "PhotoMonths",
                "fetchAllPhotos: total ${endTime - startTime} ms, count=${result.size()}"
            )
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_PHOTO_QUERY", "Failed to fetch all photos", e)
        }
    }

    @ReactMethod
    fun fetchMonthPhotos(monthKey: String, offset: Int, limit: Int, promise: Promise) {
        try {
            val (startMs, endMs) = monthRangeMillis(monthKey)

            val projection = arrayOf(
                MediaStore.Files.FileColumns._ID,
                MediaStore.Files.FileColumns.MEDIA_TYPE,
                MediaStore.Images.Media.DATE_TAKEN,
                MediaStore.Files.FileColumns.DATE_ADDED,
                MediaStore.Files.FileColumns.DISPLAY_NAME
            )

            val selection = """
                (${MediaStore.Files.FileColumns.MEDIA_TYPE}=? OR ${MediaStore.Files.FileColumns.MEDIA_TYPE}=?)
                AND (
                    (${MediaStore.Images.Media.DATE_TAKEN} >= ? AND ${MediaStore.Images.Media.DATE_TAKEN} < ?)
                    OR (
                        (${MediaStore.Images.Media.DATE_TAKEN} IS NULL OR ${MediaStore.Images.Media.DATE_TAKEN} <= 0)
                        AND ${MediaStore.Files.FileColumns.DATE_ADDED} >= ?
                        AND ${MediaStore.Files.FileColumns.DATE_ADDED} < ?
                    )
                )
            """.trimIndent()

            val selectionArgs = arrayOf(
                MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE.toString(),
                MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO.toString(),
                startMs.toString(),
                endMs.toString(),
                (startMs / 1000L).toString(),
                (endMs / 1000L).toString()
            )

            val sortOrder =
                "${MediaStore.Images.Media.DATE_TAKEN} DESC, ${MediaStore.Files.FileColumns.DATE_ADDED} DESC"

            val result = Arguments.createArray()

            reactContext.contentResolver.query(
                externalUri,
                projection,
                selection,
                selectionArgs,
                sortOrder
            )?.use { cursor ->
                val idIndex = cursor.getColumnIndex(MediaStore.Files.FileColumns._ID)
                val typeIndex = cursor.getColumnIndex(MediaStore.Files.FileColumns.MEDIA_TYPE)
                val dateTakenIndex = cursor.getColumnIndex(MediaStore.Images.Media.DATE_TAKEN)
                val dateAddedIndex = cursor.getColumnIndex(MediaStore.Files.FileColumns.DATE_ADDED)
                val nameIndex = cursor.getColumnIndex(MediaStore.Files.FileColumns.DISPLAY_NAME)

                var skipped = 0

                while (cursor.moveToNext()) {
                    if (skipped < offset) {
                        skipped++
                        continue
                    }
                    if (result.size() >= limit) break

                    val tsMillis = resolveTimestampMillis(cursor, dateTakenIndex, dateAddedIndex)
                    if (tsMillis <= 0L) continue

                    val id = cursor.getLong(idIndex)
                    val type = cursor.getInt(typeIndex)
                    val displayName = cursor.getString(nameIndex) ?: "media"

                    val contentUri: Uri = if (type == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO) {
                        ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)
                    } else {
                        ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
                    }

                    val map = Arguments.createMap()
                    map.putString("id", id.toString())
                    map.putString("uri", contentUri.toString())
                    map.putString(
                        "type",
                        if (type == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO) "video" else "photo"
                    )
                    map.putDouble("timestamp", tsMillis.toDouble())
                    map.putString("source", "Gallery")
                    map.putString("filename", displayName)
                    result.pushMap(map)
                }
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_PHOTO_QUERY", "Failed to fetch photos for month", e)
        }
    }

    private fun queryCount(mediaType: Int?, startMs: Long, endMs: Long): Int {
        val typeClause = if (mediaType != null) {
            "${MediaStore.Files.FileColumns.MEDIA_TYPE}=? AND "
        } else {
            ""
        }

        val selection = """
            $typeClause(
                (${MediaStore.Images.Media.DATE_TAKEN} >= ? AND ${MediaStore.Images.Media.DATE_TAKEN} < ?)
                OR (
                    (${MediaStore.Images.Media.DATE_TAKEN} IS NULL OR ${MediaStore.Images.Media.DATE_TAKEN} <= 0)
                    AND ${MediaStore.Files.FileColumns.DATE_ADDED} >= ?
                    AND ${MediaStore.Files.FileColumns.DATE_ADDED} < ?
                )
            )
        """.trimIndent()

        val args = mutableListOf<String>()
        if (mediaType != null) {
            args.add(mediaType.toString())
        }
        args.addAll(
            listOf(
                startMs.toString(),
                endMs.toString(),
                (startMs / 1000L).toString(),
                (endMs / 1000L).toString()
            )
        )

        val projection = arrayOf(MediaStore.Files.FileColumns._ID)

        reactContext.contentResolver.query(
            externalUri,
            projection,
            selection,
            args.toTypedArray(),
            null
        )?.use { cursor ->
            return cursor.count
        }

        return 0
    }

    @ReactMethod
    fun fetchMonthCount(monthKey: String, promise: Promise) {
        try {
            val (startMs, endMs) = monthRangeMillis(monthKey)
            val photoCount = queryCount(MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE, startMs, endMs)
            val videoCount = queryCount(MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO, startMs, endMs)
            val totalCount = photoCount + videoCount

            val result = Arguments.createMap()
            result.putInt("totalCount", totalCount)
            result.putInt("photoCount", photoCount)
            result.putInt("videoCount", videoCount)

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_COUNT_QUERY", "Failed to fetch month counts", e)
        }
    }

    // ===== Biggest wins first =====

    private data class RankedRow(
        val id: Long,
        val type: Int,
        val tsMillis: Long,
        val displayName: String,
        val size: Long,
        val bucket: Int,
        val reason: String
    )

    /**
     * Bucket 0: videos, 1: screenshots, 2: chat / downloaded media, 3: everything else.
     * Within a bucket the largest file comes first.
     */
    private fun classifyRow(type: Int, displayName: String, relativePath: String?): Pair<Int, String> {
        val path = (relativePath ?: "").lowercase(Locale.ROOT)
        val name = displayName.lowercase(Locale.ROOT)
        val isVideo = type == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO
        val isScreenshot = path.contains("screenshot") || name.startsWith("screenshot")
        val chatApp = when {
            path.contains("whatsapp") -> "WhatsApp"
            path.contains("telegram") -> "Telegram"
            path.contains("messenger") -> "Messenger"
            path.contains("snapchat") -> "Snapchat"
            path.contains("instagram") -> "Instagram"
            path.contains("download") -> "Downloaded"
            else -> null
        }
        return when {
            isVideo && chatApp != null -> 0 to "$chatApp video"
            isVideo -> 0 to "Video"
            isScreenshot -> 1 to "Screenshot"
            chatApp != null -> 2 to chatApp
            else -> 3 to "Photo"
        }
    }

    @ReactMethod
    fun fetchMonthPhotosRanked(monthKey: String, offset: Int, limit: Int, promise: Promise) {
        val startTime = System.currentTimeMillis()
        try {
            val (startMs, endMs) = monthRangeMillis(monthKey)

            val projection = arrayOf(
                MediaStore.Files.FileColumns._ID,
                MediaStore.Files.FileColumns.MEDIA_TYPE,
                MediaStore.Images.Media.DATE_TAKEN,
                MediaStore.Files.FileColumns.DATE_ADDED,
                MediaStore.Files.FileColumns.DISPLAY_NAME,
                MediaStore.Files.FileColumns.SIZE,
                MediaStore.Files.FileColumns.RELATIVE_PATH
            )

            val selection = """
                (${MediaStore.Files.FileColumns.MEDIA_TYPE}=? OR ${MediaStore.Files.FileColumns.MEDIA_TYPE}=?)
                AND (
                    (${MediaStore.Images.Media.DATE_TAKEN} >= ? AND ${MediaStore.Images.Media.DATE_TAKEN} < ?)
                    OR (
                        (${MediaStore.Images.Media.DATE_TAKEN} IS NULL OR ${MediaStore.Images.Media.DATE_TAKEN} <= 0)
                        AND ${MediaStore.Files.FileColumns.DATE_ADDED} >= ?
                        AND ${MediaStore.Files.FileColumns.DATE_ADDED} < ?
                    )
                )
            """.trimIndent()

            val selectionArgs = arrayOf(
                MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE.toString(),
                MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO.toString(),
                startMs.toString(),
                endMs.toString(),
                (startMs / 1000L).toString(),
                (endMs / 1000L).toString()
            )

            val rows = ArrayList<RankedRow>()

            reactContext.contentResolver.query(
                externalUri,
                projection,
                selection,
                selectionArgs,
                null
            )?.use { cursor ->
                val idIndex = cursor.getColumnIndex(MediaStore.Files.FileColumns._ID)
                val typeIndex = cursor.getColumnIndex(MediaStore.Files.FileColumns.MEDIA_TYPE)
                val dateTakenIndex = cursor.getColumnIndex(MediaStore.Images.Media.DATE_TAKEN)
                val dateAddedIndex = cursor.getColumnIndex(MediaStore.Files.FileColumns.DATE_ADDED)
                val nameIndex = cursor.getColumnIndex(MediaStore.Files.FileColumns.DISPLAY_NAME)
                val sizeIndex = cursor.getColumnIndex(MediaStore.Files.FileColumns.SIZE)
                val pathIndex = cursor.getColumnIndex(MediaStore.Files.FileColumns.RELATIVE_PATH)

                while (cursor.moveToNext()) {
                    val tsMillis = resolveTimestampMillis(cursor, dateTakenIndex, dateAddedIndex)
                    if (tsMillis <= 0L) continue

                    val type = cursor.getInt(typeIndex)
                    val displayName = cursor.getString(nameIndex) ?: "media"
                    val relativePath = if (pathIndex >= 0) cursor.getString(pathIndex) else null
                    val (bucket, reason) = classifyRow(type, displayName, relativePath)

                    rows.add(
                        RankedRow(
                            id = cursor.getLong(idIndex),
                            type = type,
                            tsMillis = tsMillis,
                            displayName = displayName,
                            size = cursor.getOptionalLong(sizeIndex) ?: 0L,
                            bucket = bucket,
                            reason = reason
                        )
                    )
                }
            }

            rows.sortWith(
                compareBy<RankedRow> { it.bucket }
                    .thenByDescending { it.size }
                    .thenByDescending { it.tsMillis }
            )

            val result = Arguments.createArray()
            val from = offset.coerceAtLeast(0).coerceAtMost(rows.size)
            val to = (from + limit.coerceAtLeast(0)).coerceAtMost(rows.size)

            for (i in from until to) {
                val row = rows[i]
                val isVideo = row.type == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO
                val contentUri: Uri = if (isVideo) {
                    ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, row.id)
                } else {
                    ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, row.id)
                }

                val map = Arguments.createMap()
                map.putString("id", row.id.toString())
                map.putString("uri", contentUri.toString())
                map.putString("type", if (isVideo) "video" else "photo")
                map.putDouble("timestamp", row.tsMillis.toDouble())
                map.putString("source", "Gallery")
                map.putString("filename", row.displayName)
                map.putDouble("size", row.size.toDouble())
                map.putString("junkReason", row.reason)
                map.putInt("junkRank", row.bucket)
                result.pushMap(map)
            }

            Log.d(
                "PhotoMonths",
                "fetchMonthPhotosRanked: ${System.currentTimeMillis() - startTime} ms, rows=${rows.size}, returned=${result.size()}"
            )
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_PHOTO_QUERY", "Failed to fetch ranked photos for month", e)
        }
    }

    // ===== Ghost Album =====

    /**
     * Writes a small JPEG thumbnail of the media at [uri] to [destPath] and reports the
     * original file size, so a faded memory of a photo survives its deletion.
     */
    @ReactMethod
    fun saveGhostThumbnail(uri: String, destPath: String, maxSize: Int, promise: Promise) {
        try {
            val contentUri = Uri.parse(uri)
            val side = maxSize.coerceIn(64, 1024)
            val bitmap: Bitmap =
                reactContext.contentResolver.loadThumbnail(contentUri, Size(side, side), null)

            val file = File(destPath)
            file.parentFile?.mkdirs()
            FileOutputStream(file).use { out ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, 70, out)
            }
            val width = bitmap.width
            val height = bitmap.height
            bitmap.recycle()

            var originalSize = 0L
            reactContext.contentResolver.query(
                contentUri,
                arrayOf(MediaStore.MediaColumns.SIZE),
                null,
                null,
                null
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    originalSize = cursor.getOptionalLong(
                        cursor.getColumnIndex(MediaStore.MediaColumns.SIZE)
                    ) ?: 0L
                }
            }

            val map = Arguments.createMap()
            map.putString("path", file.absolutePath)
            map.putInt("width", width)
            map.putInt("height", height)
            map.putDouble("size", originalSize.toDouble())
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("ERR_GHOST_THUMBNAIL", "Failed to create ghost thumbnail", e)
        }
    }
}
