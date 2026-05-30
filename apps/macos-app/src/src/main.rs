#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::image::Image;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{ActivationPolicy, Manager};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(ActivationPolicy::Accessory);

            let tray_icon = Image::from_bytes(include_bytes!("../icons/tray-icon.png"))?;
            let app_handle = app.handle().clone();

            TrayIconBuilder::with_id("content-relay")
                .tooltip("Content Relay")
                .icon(tray_icon)
                .icon_as_template(true)
                .on_tray_icon_event(move |_tray, event| {
                    if is_primary_click_release(&event) {
                        show_web_app(&app_handle);
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();

                if let Err(error) = window.hide() {
                    eprintln!("Failed to hide Content Relay window: {error}");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Content Relay macOS app");
}

fn is_primary_click_release(event: &TrayIconEvent) -> bool {
    matches!(
        event,
        TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        }
    )
}

fn show_web_app(app_handle: &tauri::AppHandle) {
    let Some(window) = app_handle.get_webview_window("main") else {
        eprintln!("Content Relay web app window was not found.");
        return;
    };

    if let Err(error) = window.show() {
        eprintln!("Failed to show Content Relay window: {error}");
        return;
    }

    if let Err(error) = window.set_focus() {
        eprintln!("Failed to focus Content Relay window: {error}");
    }
}
