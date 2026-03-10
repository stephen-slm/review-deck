package main

/*
#cgo CFLAGS: -x objective-c -mmacosx-version-min=11.0
#cgo LDFLAGS: -framework UserNotifications -framework Foundation

#include <stdlib.h>

void InitNotifications(void);
void SendMacNotification(const char *title, const char *body);
*/
import "C"
import "unsafe"

// initNotifications requests notification permission and installs the
// delegate that allows banners while the app is in the foreground.
// Call once during startup (e.g. domReady).
func initNotifications() {
	C.InitNotifications()
}

// sendNotification delivers a native macOS notification via
// UNUserNotificationCenter so the app appears in System Settings >
// Notifications and respects the user's notification preferences.
func sendNotification(title, body string) {
	cTitle := C.CString(title)
	cBody := C.CString(body)
	defer C.free(unsafe.Pointer(cTitle))
	defer C.free(unsafe.Pointer(cBody))
	C.SendMacNotification(cTitle, cBody)
}
