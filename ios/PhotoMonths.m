#import "PhotoMonths.h"
#import <Photos/Photos.h>

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

@end 
