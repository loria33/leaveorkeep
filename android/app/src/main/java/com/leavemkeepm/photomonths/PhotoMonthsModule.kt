package com.leavemkeepm.photomonths

import android.provider.MediaStore
import com.facebook.react.bridge.*
import java.time.Month
import java.time.format.TextStyle
import java.util.Locale

class PhotoMonthsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PhotoMonths"

    @ReactMethod
    fun fetchMonths(promise: Promise) {
        try {
            val uri = MediaStore.Files.getContentUri("external")
            val projection = arrayOf(
                "strftime('%Y-%m', date_modified / 1000, 'unixepoch') AS monthKey",
                "COUNT(*) AS photoCount"
            )
            val selection = "_data IS NOT NULL AND (media_type = 1 OR media_type = 3)" // Images and videos only
            val groupBy = "monthKey"
            val sortOrder = "monthKey DESC"

            val cursor = reactContext.contentResolver.query(
                uri,
                projection,
                selection,
                null,
                "$groupBy ORDER BY $sortOrder"
            )

            val result = Arguments.createArray()
            
            cursor?.use {
                val monthKeyIndex = it.getColumnIndex("monthKey")
                val photoCountIndex = it.getColumnIndex("photoCount")
                
                while (it.moveToNext()) {
                    val monthKey = it.getString(monthKeyIndex)
                    val photoCount = it.getInt(photoCountIndex)
                    
                    if (monthKey != null) {
                        val parts = monthKey.split("-")
                        if (parts.size == 2) {
                            val year = parts[0].toInt()
                            val month = parts[1].toInt()
                            
                            val monthName = Month.of(month).getDisplayName(TextStyle.FULL, Locale.ENGLISH) + " " + year
                            
                            val map = Arguments.createMap()
                            map.putString("monthKey", monthKey)
                            map.putInt("year", year)
                            map.putInt("month", month)
                            map.putString("monthName", monthName)
                            map.putInt("totalCount", photoCount)
                            map.putBoolean("hasMore", true)
                            result.pushMap(map)
                        }
                    }
                }
            }
            
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_MONTH_QUERY", "Failed to fetch months", e)
        }
    }

    @ReactMethod
    fun fetchAllPhotos(promise: Promise) {
        try {
            val uri = MediaStore.Files.getContentUri("external")
            val projection = arrayOf(
                MediaStore.Files.FileColumns._ID,
                MediaStore.Files.FileColumns.DATA,
                MediaStore.Files.FileColumns.MEDIA_TYPE,
                MediaStore.Files.FileColumns.DATE_MODIFIED,
                MediaStore.Files.FileColumns.DISPLAY_NAME
            )
            
            val selection = "_data IS NOT NULL AND (media_type = 1 OR media_type = 3)"
            val sortOrder = "date_modified DESC LIMIT 2000"
            
            val cursor = reactContext.contentResolver.query(
                uri,
                projection,
                selection,
                null,
                sortOrder
            )
            
            val result = Arguments.createArray()
            
            cursor?.use {
                val idIndex = it.getColumnIndex(MediaStore.Files.FileColumns._ID)
                val dataIndex = it.getColumnIndex(MediaStore.Files.FileColumns.DATA)
                val typeIndex = it.getColumnIndex(MediaStore.Files.FileColumns.MEDIA_TYPE)
                val dateIndex = it.getColumnIndex(MediaStore.Files.FileColumns.DATE_MODIFIED)
                val nameIndex = it.getColumnIndex(MediaStore.Files.FileColumns.DISPLAY_NAME)
                
                while (it.moveToNext()) {
                    val id = it.getLong(idIndex)
                    val data = it.getString(dataIndex)
                    val type = it.getInt(typeIndex)
                    val dateModified = it.getLong(dateIndex)
                    val displayName = it.getString(nameIndex) ?: "photo"
                    
                    val map = Arguments.createMap()
                    map.putString("id", id.toString())
                    map.putString("uri", "file://$data")
                    map.putString("type", if (type == 3) "video" else "photo")
                    map.putDouble("timestamp", dateModified * 1000.0)
                    map.putString("source", "Gallery")
                    map.putString("filename", displayName)
                    result.pushMap(map)
                }
            }
            
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_PHOTO_QUERY", "Failed to fetch all photos", e)
        }
    }

    @ReactMethod
    fun fetchMonthPhotos(monthKey: String, promise: Promise) {
        try {
            // Parse monthKey (e.g. "2024-12")
            val parts = monthKey.split("-")
            if (parts.size != 2) {
                promise.reject("ERR_INVALID_MONTH", "Invalid month key format")
                return
            }
            
            val targetYear = parts[0].toInt()
            val targetMonth = parts[1].toInt()
            
            val uri = MediaStore.Files.getContentUri("external")
            val projection = arrayOf(
                MediaStore.Files.FileColumns._ID,
                MediaStore.Files.FileColumns.DATA,
                MediaStore.Files.FileColumns.MEDIA_TYPE,
                MediaStore.Files.FileColumns.DATE_MODIFIED,
                MediaStore.Files.FileColumns.DISPLAY_NAME
            )
            
            val selection = "_data IS NOT NULL AND (media_type = 1 OR media_type = 3) AND strftime('%Y-%m', date_modified / 1000, 'unixepoch') = ?"
            val selectionArgs = arrayOf(monthKey)
            val sortOrder = "date_modified DESC LIMIT 500"
            
            val cursor = reactContext.contentResolver.query(
                uri,
                projection,
                selection,
                selectionArgs,
                sortOrder
            )
            
            val result = Arguments.createArray()
            
            cursor?.use {
                val idIndex = it.getColumnIndex(MediaStore.Files.FileColumns._ID)
                val dataIndex = it.getColumnIndex(MediaStore.Files.FileColumns.DATA)
                val typeIndex = it.getColumnIndex(MediaStore.Files.FileColumns.MEDIA_TYPE)
                val dateIndex = it.getColumnIndex(MediaStore.Files.FileColumns.DATE_MODIFIED)
                val nameIndex = it.getColumnIndex(MediaStore.Files.FileColumns.DISPLAY_NAME)
                
                while (it.moveToNext()) {
                    val id = it.getLong(idIndex)
                    val data = it.getString(dataIndex)
                    val type = it.getInt(typeIndex)
                    val dateModified = it.getLong(dateIndex)
                    val displayName = it.getString(nameIndex) ?: "photo"
                    
                    val map = Arguments.createMap()
                    map.putString("id", id.toString())
                    map.putString("uri", "file://$data")
                    map.putString("type", if (type == 3) "video" else "photo")
                    map.putDouble("timestamp", dateModified * 1000.0)
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
} 
} 