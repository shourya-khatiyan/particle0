//! App settings — load, save, validate, and default values.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThemePreference {
    Dark,
    Light,
    System,
}

impl Default for ThemePreference {
    fn default() -> Self {
        ThemePreference::Dark
    }
}

/// Configurable keyboard shortcut bindings (frontend-side only).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyBindings {
    pub focus_input: String,
    pub clear: String,
    pub toggle_mode: String,
    pub copy_answer: String,
    pub toggle_settings: String,
}

impl Default for KeyBindings {
    fn default() -> Self {
        KeyBindings {
            focus_input: "/".into(),
            clear: "Ctrl+X".into(),
            toggle_mode: "Ctrl+Z".into(),
            copy_answer: "Ctrl+C".into(),
            toggle_settings: "Ctrl+S".into(),
        }
    }
}

/// All user-configurable app settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub nim_base_url: String,
    pub nim_api_key: String,
    pub nim_model: String,
    pub hotkey: String,
    pub theme: ThemePreference,
    pub launch_on_startup: bool,
    pub max_tokens: Option<u32>,
    pub temperature: f32,
    pub request_timeout_secs: u64,
    pub overlay_width: u32,
    #[serde(default)]
    pub keybindings: KeyBindings,
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            nim_base_url: "https://integrate.api.nvidia.com/v1".into(),
            nim_api_key: String::new(),
            nim_model: String::new(),
            hotkey: "Ctrl+Space".into(),
            theme: ThemePreference::Dark,
            launch_on_startup: false,
            max_tokens: None,
            temperature: 0.7,
            request_timeout_secs: 30,
            overlay_width: 780,
            keybindings: KeyBindings::default(),
        }
    }
}

impl AppSettings {
    /// Returns the path to the settings file.
    fn settings_path(app: &AppHandle) -> Option<PathBuf> {
        app.path().app_data_dir().ok().map(|d| d.join("settings.json"))
    }

    /// Load settings from disk. Returns None if the file doesn't exist.
    pub fn load(app: &AppHandle) -> Option<Self> {
        let path = Self::settings_path(app)?;
        let data = std::fs::read_to_string(path).ok()?;
        serde_json::from_str(&data).ok()
    }

    /// Load from disk or return defaults if file is missing or corrupt.
    pub fn load_or_default(app: &AppHandle) -> Self {
        Self::load(app).unwrap_or_default()
    }

    /// Validate and save settings to disk. Creates directories if needed.
    pub fn save(&self, app: &AppHandle) -> Result<(), String> {
        self.validate()?;

        let path = Self::settings_path(app)
            .ok_or_else(|| "Cannot determine settings path".to_string())?;

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Cannot create settings directory: {e}"))?;
        }

        let json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Cannot serialize settings: {e}"))?;

        std::fs::write(&path, json)
            .map_err(|e| format!("Cannot write settings file: {e}"))?;

        Ok(())
    }

    /// Validate settings values before applying.
    pub fn validate(&self) -> Result<(), String> {
        if !self.nim_base_url.is_empty() {
            self.nim_base_url
                .parse::<url::Url>()
                .map_err(|_| "NIM base URL is not a valid URL".to_string())?;
        }
        if !(0.0..=2.0).contains(&self.temperature) {
            return Err("Temperature must be between 0.0 and 2.0".into());
        }
        if self.request_timeout_secs < 5 {
            return Err("Request timeout must be at least 5 seconds".into());
        }
        if let Some(mt) = self.max_tokens {
            if mt == 0 {
                return Err("Max tokens must be greater than 0".into());
            }
        }
        Ok(())
    }

    /// Returns true if the minimum required fields are set.
    pub fn is_configured(&self) -> bool {
        !self.nim_base_url.is_empty()
            && !self.nim_api_key.is_empty()
            && !self.nim_model.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_values() {
        let s = AppSettings::default();
        assert_eq!(s.nim_base_url, "https://integrate.api.nvidia.com/v1");
        assert!(s.nim_api_key.is_empty());
        assert!(s.nim_model.is_empty());
        assert_eq!(s.hotkey, "Alt+Space");
        assert_eq!(s.temperature, 0.7);
        assert_eq!(s.request_timeout_secs, 30);
        assert_eq!(s.overlay_width, 780);
        assert!(!s.launch_on_startup);
        assert!(s.max_tokens.is_none());
    }

    #[test]
    fn default_theme_is_dark() {
        let t = ThemePreference::default();
        matches!(t, ThemePreference::Dark);
    }

    #[test]
    fn serde_roundtrip() {
        let original = AppSettings {
            nim_base_url: "https://example.com/v1".into(),
            nim_api_key: "test-key-123".into(),
            nim_model: "meta/llama-3.1-8b-instruct".into(),
            hotkey: "Ctrl+Shift+Space".into(),
            theme: ThemePreference::Light,
            launch_on_startup: true,
            max_tokens: Some(4096),
            temperature: 1.2,
            request_timeout_secs: 60,
            overlay_width: 800,
        };
        let json = serde_json::to_string(&original).expect("serialize");
        let restored: AppSettings = serde_json::from_str(&json).expect("deserialize");

        assert_eq!(restored.nim_base_url, original.nim_base_url);
        assert_eq!(restored.nim_api_key, original.nim_api_key);
        assert_eq!(restored.nim_model, original.nim_model);
        assert_eq!(restored.hotkey, original.hotkey);
        assert_eq!(restored.temperature, original.temperature);
        assert_eq!(restored.max_tokens, Some(4096));
        assert_eq!(restored.request_timeout_secs, 60);
        assert!(restored.launch_on_startup);
    }

    #[test]
    fn validate_valid_settings() {
        let s = AppSettings {
            nim_base_url: "https://integrate.api.nvidia.com/v1".into(),
            temperature: 0.7,
            ..AppSettings::default()
        };
        assert!(s.validate().is_ok());
    }

    #[test]
    fn validate_empty_url_is_ok() {
        let s = AppSettings {
            nim_base_url: String::new(),
            ..AppSettings::default()
        };
        assert!(s.validate().is_ok());
    }

    #[test]
    fn validate_invalid_url_rejected() {
        let s = AppSettings {
            nim_base_url: "not a url".into(),
            ..AppSettings::default()
        };
        let err = s.validate().unwrap_err();
        assert!(err.contains("valid URL"));
    }

    #[test]
    fn validate_temperature_too_high() {
        let s = AppSettings {
            temperature: 2.5,
            ..AppSettings::default()
        };
        let err = s.validate().unwrap_err();
        assert!(err.contains("Temperature"));
    }

    #[test]
    fn validate_temperature_negative() {
        let s = AppSettings {
            temperature: -0.1,
            ..AppSettings::default()
        };
        assert!(s.validate().is_err());
    }

    #[test]
    fn validate_temperature_boundary_ok() {
        let s0 = AppSettings { temperature: 0.0, ..AppSettings::default() };
        assert!(s0.validate().is_ok());
        let s2 = AppSettings { temperature: 2.0, ..AppSettings::default() };
        assert!(s2.validate().is_ok());
    }

    #[test]
    fn is_configured_all_set() {
        let s = AppSettings {
            nim_base_url: "https://x.com".into(),
            nim_api_key: "key".into(),
            nim_model: "model".into(),
            ..AppSettings::default()
        };
        assert!(s.is_configured());
    }

    #[test]
    fn is_configured_missing_key() {
        let s = AppSettings {
            nim_base_url: "https://x.com".into(),
            nim_api_key: String::new(),
            nim_model: "model".into(),
            ..AppSettings::default()
        };
        assert!(!s.is_configured());
    }

    #[test]
    fn is_configured_missing_model() {
        let s = AppSettings {
            nim_base_url: "https://x.com".into(),
            nim_api_key: "key".into(),
            nim_model: String::new(),
            ..AppSettings::default()
        };
        assert!(!s.is_configured());
    }

    #[test]
    fn is_configured_defaults_false() {
        assert!(!AppSettings::default().is_configured());
    }
}
