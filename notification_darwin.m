#import <UserNotifications/UserNotifications.h>

// ---------- Delegate (allows banners while the app is in the foreground) ----------

@interface RDNotificationDelegate : NSObject <UNUserNotificationCenterDelegate>
@end

@implementation RDNotificationDelegate
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completionHandler {
    completionHandler(UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionSound);
}
@end

static RDNotificationDelegate *_delegate = nil;

// ---------- Public C functions called from Go via CGo ----------

void InitNotifications(void) {
    UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
    if (!center) {
        return;
    }

    _delegate = [[RDNotificationDelegate alloc] init];
    center.delegate = _delegate;

    [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge)
                          completionHandler:^(BOOL granted, NSError *error) {
        if (error) {
            NSLog(@"Review Deck: notification auth error: %@", error);
        }
    }];
}

void SendMacNotification(const char *title, const char *body) {
    NSString *nsTitle = [NSString stringWithUTF8String:title];
    NSString *nsBody  = [NSString stringWithUTF8String:body];

    UNMutableNotificationContent *content = [[UNMutableNotificationContent alloc] init];
    content.title = nsTitle;
    content.body  = nsBody;
    content.sound = [UNNotificationSound defaultSound];

    NSString *identifier = [NSString stringWithFormat:@"rd-%f",
                            [[NSDate date] timeIntervalSince1970]];

    UNNotificationRequest *request =
        [UNNotificationRequest requestWithIdentifier:identifier
                                             content:content
                                             trigger:nil];

    [[UNUserNotificationCenter currentNotificationCenter]
        addNotificationRequest:request
         withCompletionHandler:^(NSError *error) {
            if (error) {
                NSLog(@"Review Deck: send notification error: %@", error);
            }
        }];
}
