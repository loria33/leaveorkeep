#import "PhotoMonths.h"
#import <Photos/Photos.h>

@implementation PhotoMonths

RCT_EXPORT_MODULE();

RCT_REMAP_METHOD(fetchMonths,
                 resolve:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{

  
  NSMutableArray *results = [NSMutableArray array];
  NSMutableDictionary *monthCounts = [NSMutableDictionary dictionary]; // Store counts per month
  NSMutableDictionary *photoCounts = [NSMutableDictionary dictionary]; // Store photo counts per month
  NSMutableDictionary *videoCounts = [NSMutableDictionary dictionary]; // Store video counts per month
  NSMutableSet *seenMonths = [NSMutableSet set]; // Avoid duplicates

  // First, get all photos and count them by month
  PHFetchOptions *assetOptions = [[PHFetchOptions alloc] init];
  assetOptions.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:@"creationDate" ascending:NO]];
  
  PHFetchResult<PHAsset *> *allAssets = [PHAsset fetchAssetsWithMediaType:PHAssetMediaTypeImage options:assetOptions];
  PHFetchResult<PHAsset *> *allVideos = [PHAsset fetchAssetsWithMediaType:PHAssetMediaTypeVideo options:assetOptions];
  
  NSCalendar *cal = [NSCalendar currentCalendar];
  
  // Count images
  for (PHAsset *asset in allAssets) {
    if (asset.creationDate) {
      NSInteger year = [cal component:NSCalendarUnitYear fromDate:asset.creationDate];
      NSInteger month = [cal component:NSCalendarUnitMonth fromDate:asset.creationDate];
      NSString *monthKey = [NSString stringWithFormat:@"%04ld-%02ld", (long)year, (long)month];
      
      NSNumber *currentCount = monthCounts[monthKey] ?: @(0);
      monthCounts[monthKey] = @([currentCount integerValue] + 1);
      
      NSNumber *currentPhotoCount = photoCounts[monthKey] ?: @(0);
      photoCounts[monthKey] = @([currentPhotoCount integerValue] + 1);
    }
  }
  
  // Count videos
  for (PHAsset *asset in allVideos) {
    if (asset.creationDate) {
      NSInteger year = [cal component:NSCalendarUnitYear fromDate:asset.creationDate];
      NSInteger month = [cal component:NSCalendarUnitMonth fromDate:asset.creationDate];
      NSString *monthKey = [NSString stringWithFormat:@"%04ld-%02ld", (long)year, (long)month];
      
      NSNumber *currentCount = monthCounts[monthKey] ?: @(0);
      monthCounts[monthKey] = @([currentCount integerValue] + 1);
      
      NSNumber *currentVideoCount = videoCounts[monthKey] ?: @(0);
      videoCounts[monthKey] = @([currentVideoCount integerValue] + 1);
    }
  }

  NSDateFormatter *fmt = [[NSDateFormatter alloc] init];
  fmt.locale = [NSLocale localeWithLocaleIdentifier:@"en_US"];
  fmt.dateFormat = @"LLLL yyyy";

  // Create month summaries with counts
  for (NSString *monthKey in monthCounts) {
    NSArray *parts = [monthKey componentsSeparatedByString:@"-"];
    if (parts.count == 2) {
      NSInteger year = [parts[0] integerValue];
      NSInteger month = [parts[1] integerValue];
      NSInteger count = [monthCounts[monthKey] integerValue];
      
      NSDateComponents *components = [[NSDateComponents alloc] init];
      components.year = year;
      components.month = month;
      components.day = 1;
      NSDate *monthDate = [cal dateFromComponents:components];
      NSString *monthName = [fmt stringFromDate:monthDate];

      NSNumber *photoCount = photoCounts[monthKey] ?: @(0);
      NSNumber *videoCount = videoCounts[monthKey] ?: @(0);
      
      NSDictionary *monthData = @{
         @"monthKey": monthKey,
         @"year": @(year),
         @"month": @(month),
         @"monthName": monthName,
         @"totalCount": @(count),
         @"photoCount": photoCount,
         @"videoCount": videoCount,
         @"hasMore": @YES
      };
      
      [results addObject:monthData];
    }
  }

  // Sort by year and month descending (newest first)
  [results sortUsingComparator:^NSComparisonResult(NSDictionary *a, NSDictionary *b) {
    NSInteger yearA = [a[@"year"] integerValue];
    NSInteger yearB = [b[@"year"] integerValue];
    NSInteger monthA = [a[@"month"] integerValue];
    NSInteger monthB = [b[@"month"] integerValue];
    
    // For descending order (newest first):
    if (yearA != yearB) {
      return yearB - yearA; // Higher year comes first
    }
    return monthB - monthA; // Higher month comes first
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
  // Parse monthKey (e.g. "2024-12")
  NSArray *parts = [monthKey componentsSeparatedByString:@"-"];
  if (parts.count != 2) {
    reject(@"ERR_INVALID_MONTH", @"Invalid month key format", nil);
    return;
  }
  
  NSInteger targetYear = [parts[0] integerValue];
  NSInteger targetMonth = [parts[1] integerValue];
  NSInteger offsetValue = [offset integerValue];
  NSInteger limitValue = [limit integerValue];
  
  // Get all photos and videos
  PHFetchOptions *assetOptions = [[PHFetchOptions alloc] init];
  assetOptions.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:@"creationDate" ascending:NO]];
  
  PHFetchResult<PHAsset *> *allAssets = [PHAsset fetchAssetsWithOptions:assetOptions];
  
  NSMutableArray *results = [NSMutableArray array];
  NSCalendar *cal = [NSCalendar currentCalendar];
  NSInteger foundCount = 0;
  
  for (PHAsset *asset in allAssets) {
    if (asset.creationDate) {
      NSInteger year = [cal component:NSCalendarUnitYear fromDate:asset.creationDate];
      NSInteger month = [cal component:NSCalendarUnitMonth fromDate:asset.creationDate];
      
      if (year == targetYear && month == targetMonth) {
        if (foundCount >= offsetValue && results.count < limitValue) {
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
        }
        foundCount++;
        // Stop if we've collected enough
        if (results.count >= limitValue) {
          break;
        }
      }
    }
  }
  
  resolve(results);
}

@end 
