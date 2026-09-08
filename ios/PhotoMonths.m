#import "PhotoMonths.h"
#import <Photos/Photos.h>
#import <UIKit/UIKit.h>

@implementation PhotoMonths

RCT_EXPORT_MODULE();

RCT_REMAP_METHOD(fetchMonths,
                 resolve:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  // Build month keys by iterating MOMENTS (collections), not assets.
  // This is usually far fewer items than PHAsset and avoids large scans.
  
  NSMutableSet<NSString *> *monthKeys = [NSMutableSet set];
  NSCalendar *cal = [NSCalendar currentCalendar];
  
  // Fetch all Moments (each moment typically corresponds to a day/event cluster)
  PHFetchResult<PHAssetCollection *> *moments =
    [PHAssetCollection fetchAssetCollectionsWithType:PHAssetCollectionTypeMoment
                                            subtype:PHAssetCollectionSubtypeAny
                                            options:nil];
  
  // Derive month keys from each moment's startDate/endDate
  // Handle edge case: moments that cross month boundaries by checking both dates
  for (PHAssetCollection *moment in moments) {
    NSDate *startDate = moment.startDate;
    NSDate *endDate = moment.endDate;
    
    // Add month from startDate
    if (startDate) {
      NSInteger year = [cal component:NSCalendarUnitYear fromDate:startDate];
      NSInteger month = [cal component:NSCalendarUnitMonth fromDate:startDate];
      NSString *monthKey = [NSString stringWithFormat:@"%04ld-%02ld", (long)year, (long)month];
      [monthKeys addObject:monthKey];
    }
    
    // Add month from endDate (handles moments that cross month boundaries)
    if (endDate) {
      NSInteger year = [cal component:NSCalendarUnitYear fromDate:endDate];
      NSInteger month = [cal component:NSCalendarUnitMonth fromDate:endDate];
      NSString *monthKey = [NSString stringWithFormat:@"%04ld-%02ld", (long)year, (long)month];
      [monthKeys addObject:monthKey];
    }
  }
  
  // Format month display names
  NSDateFormatter *fmt = [[NSDateFormatter alloc] init];
  fmt.locale = [NSLocale localeWithLocaleIdentifier:@"en_US"];
  fmt.dateFormat = @"LLLL yyyy";
  
  // Create month summaries WITHOUT counts (lazy loading)
  NSMutableArray *results = [NSMutableArray arrayWithCapacity:monthKeys.count];
  
  for (NSString *monthKey in monthKeys) {
    NSArray *parts = [monthKey componentsSeparatedByString:@"-"];
    if (parts.count != 2) continue;
    
    NSInteger year = [parts[0] integerValue];
    NSInteger month = [parts[1] integerValue];
    
    NSDateComponents *components = [[NSDateComponents alloc] init];
    components.year = year;
    components.month = month;
    components.day = 1;
    
    NSDate *monthDate = [cal dateFromComponents:components];
    NSString *monthName = monthDate ? [fmt stringFromDate:monthDate] : monthKey;
    
    NSDictionary *monthData = @{
      @"monthKey": monthKey,
      @"year": @(year),
      @"month": @(month),
      @"monthName": monthName,
      @"totalCount": @(0), // lazy
      @"photoCount": @(0), // lazy
      @"videoCount": @(0), // lazy
      @"hasMore": @YES
    };
    
    [results addObject:monthData];
  }
  
  // Sort newest first
  [results sortUsingComparator:^NSComparisonResult(NSDictionary *a, NSDictionary *b) {
    NSInteger yearA = [a[@"year"] integerValue];
    NSInteger yearB = [b[@"year"] integerValue];
    NSInteger monthA = [a[@"month"] integerValue];
    NSInteger monthB = [b[@"month"] integerValue];
    
    if (yearA != yearB) {
      return (yearB > yearA) ? NSOrderedAscending : NSOrderedDescending;
    }
    if (monthA != monthB) {
      return (monthB > monthA) ? NSOrderedAscending : NSOrderedDescending;
    }
    return NSOrderedSame;
  }];
  
  resolve(results);
}

RCT_REMAP_METHOD(fetchAllPhotos,
                 resolvee:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  // Get all photos and videos
  PHFetchOptions *assetOptions = [[PHFetchOptions alloc] init];
  assetOptions.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:@"creationDate" ascending:NO]];
  
  PHFetchResult<PHAsset *> *allAssets = [PHAsset fetchAssetsWithOptions:assetOptions];
  
  NSMutableArray *results = [NSMutableArray array];
  
  for (PHAsset *asset in allAssets) {
    if (asset.creationDate) {
      // Convert PHAsset to our format
      NSString *assetURI = [NSString stringWithFormat:@"ph://%@", asset.localIdentifier];
      NSNumber *pixelWidth = @(asset.pixelWidth);
      NSNumber *pixelHeight = @(asset.pixelHeight);
      NSNumber *fileSize = @(0);
      // Try to get file size (asynchronously, so just set 0 for now)
      // For future: use PHAssetResource to get file size if needed
      NSDictionary *photo = @{
        @"id": asset.localIdentifier,
        @"uri": assetURI,
        @"type": asset.mediaType == PHAssetMediaTypeVideo ? @"video" : @"photo",
        @"timestamp": @([asset.creationDate timeIntervalSince1970] * 1000),
        @"source": @"Gallery",
        @"filename": [NSString stringWithFormat:@"photo_%@", asset.localIdentifier],
        @"pixelWidth": pixelWidth,
        @"pixelHeight": pixelHeight,
        @"fileSize": fileSize
      };
      
      [results addObject:photo];
      
      // Limit to 2000 photos to avoid memory issues
      if ([results count] >= 2000) {
        break;
      }
    }
  }
  // Log the number of assets and all asset dictionaries
  NSLog(@"[PhotoMonths] fetchAllPhotos: Found %lu assets", (unsigned long)[results count]);
 
  resolve(results);
}

RCT_REMAP_METHOD(fetchMonthPhotos,
                 monthKey:(NSString *)monthKey
                 offset:(nonnull NSNumber *)offset
                 limit:(nonnull NSNumber *)limit
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSLog(@"[PhotoMonths] fetchMonthPhotos called with monthKey=%@, offset=%@, limit=%@", monthKey, offset, limit);
  
  // Parse monthKey (e.g. "2024-12")
  NSArray *parts = [monthKey componentsSeparatedByString:@"-"];
  if (parts.count != 2) {
    NSLog(@"[PhotoMonths] ERROR: Invalid month key format: %@", monthKey);
    reject(@"ERR_INVALID_MONTH", @"Invalid month key format", nil);
    return;
  }
  
  NSInteger targetYear = [parts[0] integerValue];
  NSInteger targetMonth = [parts[1] integerValue];
  NSInteger offsetValue = [offset integerValue];
  NSInteger limitValue = [limit integerValue];
  
  NSLog(@"[PhotoMonths] Parsed: year=%ld, month=%ld, offset=%ld, limit=%ld", (long)targetYear, (long)targetMonth, (long)offsetValue, (long)limitValue);
  
  // MEMORY FIX: Use date range predicate to filter assets efficiently
  NSCalendar *cal = [NSCalendar currentCalendar];
  NSDateComponents *startComponents = [[NSDateComponents alloc] init];
  startComponents.year = targetYear;
  startComponents.month = targetMonth;
  startComponents.day = 1;
  startComponents.hour = 0;
  startComponents.minute = 0;
  startComponents.second = 0;
  NSDate *startDate = [cal dateFromComponents:startComponents];
  
  NSDateComponents *endComponents = [[NSDateComponents alloc] init];
  endComponents.year = targetYear;
  endComponents.month = targetMonth + 1;
  endComponents.day = 1;
  endComponents.hour = 0;
  endComponents.minute = 0;
  endComponents.second = 0;
  NSDate *endDate = [cal dateFromComponents:endComponents];
  
  // Create predicate to filter by date range (more efficient than iterating all assets)
  NSPredicate *datePredicate = [NSPredicate predicateWithFormat:@"creationDate >= %@ AND creationDate < %@", startDate, endDate];
  
  PHFetchOptions *assetOptions = [[PHFetchOptions alloc] init];
  assetOptions.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:@"creationDate" ascending:NO]];
  assetOptions.predicate = datePredicate; // Filter by date range
  
  // Only fetch assets in this month's date range (much more efficient!)
  PHFetchResult<PHAsset *> *monthAssets = [PHAsset fetchAssetsWithOptions:assetOptions];
  
  NSLog(@"[PhotoMonths] Found %lu assets in month range", (unsigned long)monthAssets.count);
  
  NSMutableArray *results = [NSMutableArray array];
  NSInteger foundCount = 0;
  
  // Only iterate through assets in this month (not all assets!)
  for (NSInteger i = offsetValue; i < monthAssets.count && results.count < limitValue; i++) {
    PHAsset *asset = [monthAssets objectAtIndex:i];
    if (asset.creationDate) {
      // Convert PHAsset to our format
      NSString *assetURI = [NSString stringWithFormat:@"ph://%@", asset.localIdentifier];
      NSDictionary *photo = @{
        @"id": asset.localIdentifier,
        @"uri": assetURI,
        @"type": asset.mediaType == PHAssetMediaTypeVideo ? @"video" : @"photo",
        @"timestamp": @([asset.creationDate timeIntervalSince1970] * 1000),
        @"source": @"Gallery",
        @"filename": [NSString stringWithFormat:@"photo_%@", asset.localIdentifier]
      };
      [results addObject:photo];
      foundCount++;
      
      if (foundCount <= 3) {
        NSLog(@"[PhotoMonths] Added photo %ld: id=%@, uri=%@, type=%@", (long)foundCount, asset.localIdentifier, assetURI, photo[@"type"]);
      }
    }
  }
  
  NSLog(@"[PhotoMonths] Returning %lu results", (unsigned long)results.count);
  resolve(results);
}

// LAZY LOADING: Count photos for a specific month without loading them
RCT_REMAP_METHOD(fetchMonthCount,
                 monthKey:(NSString *)monthKey
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSLog(@"[PhotoMonths] fetchMonthCount called with monthKey=%@", monthKey);
  
  // Parse monthKey (e.g. "2024-12")
  NSArray *parts = [monthKey componentsSeparatedByString:@"-"];
  if (parts.count != 2) {
    NSLog(@"[PhotoMonths] ERROR: Invalid month key format: %@", monthKey);
    reject(@"ERR_INVALID_MONTH", @"Invalid month key format", nil);
    return;
  }
  
  NSInteger targetYear = [parts[0] integerValue];
  NSInteger targetMonth = [parts[1] integerValue];
  
  NSLog(@"[PhotoMonths] Counting for year=%ld, month=%ld", (long)targetYear, (long)targetMonth);
  
  // MEMORY FIX: Use date range predicate to count efficiently
  NSCalendar *cal = [NSCalendar currentCalendar];
  NSDateComponents *startComponents = [[NSDateComponents alloc] init];
  startComponents.year = targetYear;
  startComponents.month = targetMonth;
  startComponents.day = 1;
  startComponents.hour = 0;
  startComponents.minute = 0;
  startComponents.second = 0;
  NSDate *startDate = [cal dateFromComponents:startComponents];
  
  NSDateComponents *endComponents = [[NSDateComponents alloc] init];
  endComponents.year = targetYear;
  endComponents.month = targetMonth + 1;
  endComponents.day = 1;
  endComponents.hour = 0;
  endComponents.minute = 0;
  endComponents.second = 0;
  NSDate *endDate = [cal dateFromComponents:endComponents];
  
  // Create predicate to filter by date range (efficient counting)
  NSPredicate *datePredicate = [NSPredicate predicateWithFormat:@"creationDate >= %@ AND creationDate < %@", startDate, endDate];
  
  PHFetchOptions *assetOptions = [[PHFetchOptions alloc] init];
  assetOptions.predicate = datePredicate;
  
  // Count photos
  PHFetchResult<PHAsset *> *photos = [PHAsset fetchAssetsWithMediaType:PHAssetMediaTypeImage options:assetOptions];
  NSInteger photoCount = photos.count;
  
  // Count videos
  PHFetchResult<PHAsset *> *videos = [PHAsset fetchAssetsWithMediaType:PHAssetMediaTypeVideo options:assetOptions];
  NSInteger videoCount = videos.count;
  
  NSInteger totalCount = photoCount + videoCount;
  
  NSLog(@"[PhotoMonths] Count results: total=%ld, photos=%ld, videos=%ld", (long)totalCount, (long)photoCount, (long)videoCount);
  
  NSDictionary *counts = @{
    @"totalCount": @(totalCount),
    @"photoCount": @(photoCount),
    @"videoCount": @(videoCount)
  };
  
  resolve(counts);
}

#pragma mark - Shared helpers

// Start and end of the month named by "YYYY-MM" in the current calendar.
static BOOL MonthDateRange(NSString *monthKey, NSDate **startDate, NSDate **endDate)
{
  NSArray *parts = [monthKey componentsSeparatedByString:@"-"];
  if (parts.count != 2) return NO;

  NSInteger year = [parts[0] integerValue];
  NSInteger month = [parts[1] integerValue];
  NSCalendar *cal = [NSCalendar currentCalendar];

  NSDateComponents *startComponents = [[NSDateComponents alloc] init];
  startComponents.year = year;
  startComponents.month = month;
  startComponents.day = 1;

  NSDateComponents *endComponents = [[NSDateComponents alloc] init];
  endComponents.year = year;
  endComponents.month = month + 1;
  endComponents.day = 1;

  *startDate = [cal dateFromComponents:startComponents];
  *endDate = [cal dateFromComponents:endComponents];
  return *startDate != nil && *endDate != nil;
}

// Bytes the asset occupies across all of its resources (original, edits, paired video).
// PhotoKit exposes this only through KVC, so treat 0 as "unknown".
static unsigned long long FileSizeForAsset(PHAsset *asset)
{
  @try {
    NSArray<PHAssetResource *> *resources = [PHAssetResource assetResourcesForAsset:asset];
    unsigned long long total = 0;
    for (PHAssetResource *resource in resources) {
      id size = [resource valueForKey:@"fileSize"];
      if ([size isKindOfClass:[NSNumber class]]) {
        total += [size unsignedLongLongValue];
      }
    }
    return total;
  } @catch (NSException *exception) {
    return 0;
  }
}

#pragma mark - Biggest wins first

// Bucket 0: videos, 1: screenshots, 3: everything else. `proxy` orders within a bucket
// (largest first) from metadata alone, so ranking a month never touches the file system.
static NSInteger JunkBucketForAsset(PHAsset *asset, NSString **reason, double *proxy)
{
  double pixels = (double)asset.pixelWidth * (double)asset.pixelHeight;
  if (asset.mediaType == PHAssetMediaTypeVideo) {
    *reason = @"Video";
    *proxy = pixels * MAX(asset.duration, 1.0);
    return 0;
  }
  if (asset.mediaSubtypes & PHAssetMediaSubtypePhotoScreenshot) {
    *reason = @"Screenshot";
    *proxy = pixels;
    return 1;
  }
  *reason = @"Photo";
  *proxy = pixels;
  return 3;
}

RCT_REMAP_METHOD(fetchMonthPhotosRanked,
                 rankedMonthKey:(NSString *)monthKey
                 rankedOffset:(nonnull NSNumber *)offset
                 rankedLimit:(nonnull NSNumber *)limit
                 rankedResolver:(RCTPromiseResolveBlock)resolve
                 rankedRejecter:(RCTPromiseRejectBlock)reject)
{
  NSDate *startDate = nil;
  NSDate *endDate = nil;
  if (!MonthDateRange(monthKey, &startDate, &endDate)) {
    reject(@"ERR_INVALID_MONTH", @"Invalid month key format", nil);
    return;
  }

  PHFetchOptions *assetOptions = [[PHFetchOptions alloc] init];
  assetOptions.predicate = [NSPredicate predicateWithFormat:@"creationDate >= %@ AND creationDate < %@", startDate, endDate];
  assetOptions.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:@"creationDate" ascending:NO]];
  PHFetchResult<PHAsset *> *monthAssets = [PHAsset fetchAssetsWithOptions:assetOptions];

  NSMutableArray<NSDictionary *> *ranked = [NSMutableArray arrayWithCapacity:monthAssets.count];
  for (PHAsset *asset in monthAssets) {
    if (!asset.creationDate) continue;
    NSString *reason = @"Photo";
    double proxy = 0;
    NSInteger bucket = JunkBucketForAsset(asset, &reason, &proxy);
    [ranked addObject:@{
      @"asset": asset,
      @"bucket": @(bucket),
      @"proxy": @(proxy),
      @"reason": reason
    }];
  }

  [ranked sortUsingComparator:^NSComparisonResult(NSDictionary *a, NSDictionary *b) {
    NSInteger bucketA = [a[@"bucket"] integerValue];
    NSInteger bucketB = [b[@"bucket"] integerValue];
    if (bucketA != bucketB) {
      return bucketA < bucketB ? NSOrderedAscending : NSOrderedDescending;
    }
    double proxyA = [a[@"proxy"] doubleValue];
    double proxyB = [b[@"proxy"] doubleValue];
    if (proxyA != proxyB) {
      return proxyA > proxyB ? NSOrderedAscending : NSOrderedDescending;
    }
    return NSOrderedSame;
  }];

  NSInteger count = (NSInteger)ranked.count;
  NSInteger from = MAX(0, MIN(count, [offset integerValue]));
  NSInteger to = MIN(count, from + MAX(0, [limit integerValue]));

  NSMutableArray *results = [NSMutableArray arrayWithCapacity:MAX(0, to - from)];
  for (NSInteger i = from; i < to; i++) {
    NSDictionary *entry = ranked[i];
    PHAsset *asset = entry[@"asset"];
    NSString *assetURI = [NSString stringWithFormat:@"ph://%@", asset.localIdentifier];
    [results addObject:@{
      @"id": asset.localIdentifier,
      @"uri": assetURI,
      @"type": asset.mediaType == PHAssetMediaTypeVideo ? @"video" : @"photo",
      @"timestamp": @([asset.creationDate timeIntervalSince1970] * 1000),
      @"source": @"Gallery",
      @"filename": [NSString stringWithFormat:@"photo_%@", asset.localIdentifier],
      @"size": @(FileSizeForAsset(asset)),
      @"junkReason": entry[@"reason"],
      @"junkRank": entry[@"bucket"]
    }];
  }

  NSLog(@"[PhotoMonths] fetchMonthPhotosRanked: %ld assets ranked, returning %lu", (long)count, (unsigned long)results.count);
  resolve(results);
}

#pragma mark - Ghost Album

// Writes a small JPEG of the asset to destPath and reports the original's size, so a
// faded memory of a photo survives its deletion.
RCT_REMAP_METHOD(saveGhostThumbnail,
                 ghostUri:(NSString *)uri
                 ghostDestPath:(NSString *)destPath
                 ghostMaxSize:(nonnull NSNumber *)maxSize
                 ghostResolver:(RCTPromiseResolveBlock)resolve
                 ghostRejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *localId = [uri stringByReplacingOccurrencesOfString:@"ph://" withString:@""];
  PHFetchResult<PHAsset *> *fetched = [PHAsset fetchAssetsWithLocalIdentifiers:@[localId] options:nil];
  PHAsset *asset = fetched.firstObject;
  if (!asset) {
    reject(@"ERR_GHOST_NOT_FOUND", @"Asset not found", nil);
    return;
  }

  CGFloat side = MAX(64.0, MIN(1024.0, [maxSize doubleValue]));
  PHImageRequestOptions *options = [[PHImageRequestOptions alloc] init];
  options.synchronous = YES;
  options.networkAccessAllowed = YES;
  options.resizeMode = PHImageRequestOptionsResizeModeFast;
  options.deliveryMode = PHImageRequestOptionsDeliveryModeHighQualityFormat;

  __block UIImage *thumbnail = nil;
  [[PHImageManager defaultManager] requestImageForAsset:asset
                                             targetSize:CGSizeMake(side, side)
                                            contentMode:PHImageContentModeAspectFit
                                                options:options
                                          resultHandler:^(UIImage *result, NSDictionary *info) {
    thumbnail = result;
  }];

  if (!thumbnail) {
    reject(@"ERR_GHOST_THUMBNAIL", @"Could not render thumbnail", nil);
    return;
  }

  NSData *jpeg = UIImageJPEGRepresentation(thumbnail, 0.7);
  if (!jpeg) {
    reject(@"ERR_GHOST_THUMBNAIL", @"Could not encode thumbnail", nil);
    return;
  }

  [[NSFileManager defaultManager] createDirectoryAtPath:[destPath stringByDeletingLastPathComponent]
                            withIntermediateDirectories:YES
                                             attributes:nil
                                                  error:nil];
  if (![jpeg writeToFile:destPath atomically:YES]) {
    reject(@"ERR_GHOST_WRITE", @"Could not write thumbnail", nil);
    return;
  }

  resolve(@{
    @"path": destPath,
    @"width": @(thumbnail.size.width * thumbnail.scale),
    @"height": @(thumbnail.size.height * thumbnail.scale),
    @"size": @(FileSizeForAsset(asset))
  });
}

@end
