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
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            nim_base_url: "https://integrate.api.nvidia.com/v1".into(),
            nim_api_key: String::new(),
            nim_model: String::new(),
            hotkey: "Alt+Space".into(),
            theme: ThemePreference::Dark,
            launch_on_startup: false,
            max_tokens: None,
            temperature: 0.7,
            request_timeout_secs: 30,
            overlay_width: 780,
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

    /// Load from disk or return defaults if missing/corrupt.
    pub fn load_or_default(app: &AppHandle) -> Result<Self, String> {
        Ok(Self::load(app).unwrap_or_default())
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
        Ok(())
    }

    /// Returns true if the minimum required fields are set.
    pub fn is_configured(&self) -> bool {
        !self.nim_base_url.is_empty()
            && !self.nim_api_key.is_empty()
            && !self.nim_model.is_empty()
    }
}
