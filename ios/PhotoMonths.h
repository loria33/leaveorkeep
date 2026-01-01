#import <React/RCTBridgeModule.h>
#import <Photos/Photos.h>
 
@interface PhotoMonths : NSObject <RCTBridgeModule>
- (void)fetchMonthPhotos:(NSString *)monthKey offset:(nonnull NSNumber *)offset limit:(nonnull NSNumber *)limit resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;
- (void)fetchMonthCount:(NSString *)monthKey resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;
@end 
