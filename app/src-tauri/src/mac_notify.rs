//! macOS notifications through the UserNotifications framework. The notification plugin goes
//! through the old NSUserNotificationCenter, which current macOS no longer shows, and reports
//! permission as granted without asking: messages arrived with no banner, the app never
//! appeared in System Settings → Notifications, and the Dock badge (which needs the same
//! permission) stayed hidden. Only inside the app bundle: the framework throws outside one
//! (`tauri dev`), where the plugin stays in use.

use std::sync::OnceLock;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{Bool, NSObject, NSObjectProtocol, ProtocolObject};
use objc2::{define_class, msg_send, AllocAnyThread};
use objc2_foundation::{NSBundle, NSError, NSString, NSUUID};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNAuthorizationStatus, UNMutableNotificationContent, UNNotification,
    UNNotificationPresentationOptions, UNNotificationRequest, UNNotificationSettings, UNUserNotificationCenter,
    UNUserNotificationCenterDelegate,
};

define_class!(
    // Shows banners while the app is in the front too (by default macOS hides them then); the
    // app itself decides when a notification is due (not for the chat being read).
    #[unsafe(super(NSObject))]
    #[name = "DialogNotificationDelegate"]
    struct Delegate;

    unsafe impl NSObjectProtocol for Delegate {}

    unsafe impl UNUserNotificationCenterDelegate for Delegate {
        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        fn will_present(
            &self,
            _center: &UNUserNotificationCenter,
            _notification: &UNNotification,
            handler: &block2::DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
        ) {
            handler.call((UNNotificationPresentationOptions::Banner | UNNotificationPresentationOptions::List,));
        }
    }
);

struct Shared(Retained<Delegate>);
// The delegate has no state and is only handed to the notification center.
unsafe impl Send for Shared {}
unsafe impl Sync for Shared {}
static DELEGATE: OnceLock<Shared> = OnceLock::new();

/// Running from an app bundle (the framework requires one).
pub fn available() -> bool {
    let bundle = NSBundle::mainBundle();
    bundle.bundleIdentifier().is_some() && bundle.bundlePath().to_string().ends_with(".app")
}

fn center() -> Option<Retained<UNUserNotificationCenter>> {
    available().then(UNUserNotificationCenter::currentNotificationCenter)
}

/// Installs the delegate; called once at startup.
pub fn init() {
    log::info!("notifications: UserNotifications available={}", available());
    let Some(center) = center() else { return };
    let shared = DELEGATE.get_or_init(|| {
        let this = Delegate::alloc().set_ivars(());
        Shared(unsafe { msg_send![super(this), init] })
    });
    center.setDelegate(Some(ProtocolObject::from_ref(&*shared.0)));
}

/// Asks for permission (alerts and the Dock badge) the first time; later returns the answer
/// given. Resolves when the user has answered. (The Objective-C objects stay out of the
/// future, which must be Send.)
pub async fn request_permission() -> bool {
    log::info!("notifications: requesting authorization");
    let granted = match ask_permission() {
        Some(rx) => rx.await.unwrap_or(false),
        None => false,
    };
    log::info!("notifications: authorization granted={granted}");
    granted
}

fn ask_permission() -> Option<tokio::sync::oneshot::Receiver<bool>> {
    let center = center()?;
    let (tx, rx) = tokio::sync::oneshot::channel::<bool>();
    let tx = std::sync::Mutex::new(Some(tx));
    let block = RcBlock::new(move |granted: Bool, _error: *mut NSError| {
        if let Some(tx) = tx.lock().unwrap().take() {
            let _ = tx.send(granted.as_bool());
        }
    });
    center.requestAuthorizationWithOptions_completionHandler(
        UNAuthorizationOptions::Alert | UNAuthorizationOptions::Badge | UNAuthorizationOptions::Sound,
        &block,
    );
    Some(rx)
}

/// "granted", "denied" or "default" (not asked yet).
pub async fn permission_state() -> &'static str {
    let state = match query_permission() {
        Some(rx) => rx.await.unwrap_or("default"),
        None => "default",
    };
    log::info!("notifications: permission state {state}");
    state
}

fn query_permission() -> Option<tokio::sync::oneshot::Receiver<&'static str>> {
    let center = center()?;
    let (tx, rx) = tokio::sync::oneshot::channel::<&'static str>();
    let tx = std::sync::Mutex::new(Some(tx));
    let block = RcBlock::new(move |settings: std::ptr::NonNull<UNNotificationSettings>| {
        let status = unsafe { settings.as_ref() }.authorizationStatus();
        let state = if status == UNAuthorizationStatus::Denied {
            "denied"
        } else if status == UNAuthorizationStatus::NotDetermined {
            "default"
        } else {
            "granted"
        };
        if let Some(tx) = tx.lock().unwrap().take() {
            let _ = tx.send(state);
        }
    });
    center.getNotificationSettingsWithCompletionHandler(&block);
    Some(rx)
}

/// Shows a notification (silent: the app plays its own sounds).
pub fn show(title: &str, body: &str) {
    log::info!("notifications: show ({} chars)", body.len());
    let Some(center) = center() else { return };
    let content = UNMutableNotificationContent::new();
    content.setTitle(&NSString::from_str(title));
    content.setBody(&NSString::from_str(body));
    let id = NSUUID::new().UUIDString();
    let request = UNNotificationRequest::requestWithIdentifier_content_trigger(&id, &content, None);
    center.addNotificationRequest_withCompletionHandler(&request, None);
}
