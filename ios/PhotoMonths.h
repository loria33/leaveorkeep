#import <React/RCTBridgeModule.h>
#import <Photos/Photos.h>
 
@interface PhotoMonths : NSObject <RCTBridgeModule>
- (void)fetchMonthPhotos:(NSString *)monthKey offset:(nonnull NSNumber *)offset limit:(nonnull NSNumber *)limit resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;
- (void)fetchMonthCount:(NSString *)monthKey resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;
- (void)rankedMonthKey:(NSString *)monthKey rankedOffset:(nonnull NSNumber *)offset rankedLimit:(nonnull NSNumber *)limit rankedResolver:(RCTPromiseResolveBlock)resolve rankedRejecter:(RCTPromiseRejectBlock)reject;
- (void)ghostUri:(NSString *)uri ghostDestPath:(NSString *)destPath ghostMaxSize:(nonnull NSNumber *)maxSize ghostResolver:(RCTPromiseResolveBlock)resolve ghostRejecter:(RCTPromiseRejectBlock)reject;
@end 
