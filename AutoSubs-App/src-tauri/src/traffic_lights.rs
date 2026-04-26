//! macOS traffic-light (window button) repositioning.
//!
//! Tauri v2's `trafficLightPosition` in `tauri.conf.json` is only applied at
//! window creation. AppKit re-lays out the standard window buttons after
//! various lifecycle events (window shown, resized, fullscreen toggled, etc.),
//! which is why packaged builds drift from the configured offset while
//! `tauri dev` looks correct. This module repositions the buttons via Cocoa
//! and re-applies the offset on the relevant window events.

#![cfg(target_os = "macos")]
#![allow(deprecated)] // `cocoa` crate is deprecated in favor of `objc2` but still works fine here.

use cocoa::appkit::{NSWindow, NSWindowButton};
use cocoa::base::{id, nil};
use cocoa::foundation::NSRect;
use objc::{msg_send, sel, sel_impl};
use tauri::{Runtime, WebviewWindow, WindowEvent};

/// Desired offset of the leftmost (close) traffic-light button from the
/// **top-left** of the window's title-bar area, in points. This matches the
/// coordinate semantics of Tauri's `trafficLightPosition` config field.
pub const TRAFFIC_LIGHT_X: f64 = 10.0;
pub const TRAFFIC_LIGHT_Y: f64 = 20.0;

/// Reposition the three standard window buttons (close / minimize / zoom).
///
/// We don't fight AppKit by moving each button to an absolute Y. Instead we
/// resize the **title-bar container view** so AppKit naturally centers the
/// buttons within it, and only override the X coordinates. This matches the
/// technique used by `tao` (and therefore Tauri) and avoids the resize glitch
/// where AppKit re-runs its layout pass after we've moved the buttons.
pub fn position<R: Runtime>(window: &WebviewWindow<R>) {
    let ns_window_ptr = match window.ns_window() {
        Ok(ptr) => ptr as id,
        Err(_) => return,
    };
    if ns_window_ptr == nil {
        return;
    }

    unsafe {
        let close: id = ns_window_ptr.standardWindowButton_(NSWindowButton::NSWindowCloseButton);
        let mini: id =
            ns_window_ptr.standardWindowButton_(NSWindowButton::NSWindowMiniaturizeButton);
        let zoom: id = ns_window_ptr.standardWindowButton_(NSWindowButton::NSWindowZoomButton);
        if close == nil || mini == nil || zoom == nil {
            return;
        }

        // The buttons live inside a title-bar view whose own superview is the
        // title-bar container. Resizing the container is what makes AppKit
        // place the buttons at the desired offset on every layout pass.
        let title_bar: id = msg_send![close, superview];
        if title_bar == nil {
            return;
        }
        let title_bar_container: id = msg_send![title_bar, superview];
        if title_bar_container == nil {
            return;
        }

        let close_frame: NSRect = msg_send![close, frame];
        let window_frame: NSRect = msg_send![ns_window_ptr, frame];

        // New title-bar height = button height + desired top padding.
        let new_title_bar_height = close_frame.size.height + TRAFFIC_LIGHT_Y;
        let mut container_frame: NSRect = msg_send![title_bar_container, frame];
        container_frame.size.height = new_title_bar_height;
        // Keep the container pinned to the top of the window.
        container_frame.origin.y = window_frame.size.height - new_title_bar_height;
        let _: () = msg_send![title_bar_container, setFrame: container_frame];

        // Preserve AppKit's native horizontal spacing between the buttons,
        // anchored at our configured X.
        let mini_frame: NSRect = msg_send![mini, frame];
        let space_between = mini_frame.origin.x - close_frame.origin.x;

        for (i, btn) in [close, mini, zoom].iter().enumerate() {
            let mut rect: NSRect = msg_send![*btn, frame];
            rect.origin.x = TRAFFIC_LIGHT_X + (i as f64) * space_between;
            let _: () = msg_send![*btn, setFrameOrigin: rect.origin];
        }
    }
}

/// Apply the offset now and register a window-event listener that re-applies
/// it whenever AppKit may have reset the button layout.
pub fn install<R: Runtime>(window: &WebviewWindow<R>) {
    position(window);

    let w = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Resized(_)
        | WindowEvent::Focused(_)
        | WindowEvent::ThemeChanged(_)
        | WindowEvent::ScaleFactorChanged { .. } => {
            position(&w);
        }
        _ => {}
    });
}
