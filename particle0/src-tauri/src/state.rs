//! AppState — central mutable state managed by Tauri.

use crate::settings::AppSettings;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum BackendStatus {
    Ready,
    Unreachable,
    ModelMissing,
    NotConfigured,
    Checking,
}

/// A single chat message for multi-turn conversation history.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Global mutable app state, wrapped in Mutex and managed by Tauri.
pub struct AppState {
    pub settings: AppSettings,
    pub backend_status: BackendStatus,
    pub hotkey_registered: bool,
    pub active_request_id: Option<String>,
    pub overlay_visible: bool,
    pub conversation_history: Vec<ChatMessage>,
    pub multi_turn_enabled: bool,
    /// Cancellation flag — set to true to abort the active stream.
    pub cancel_requested: bool,
}

impl Default for AppState {
    fn default() -> Self {
        AppState {
            settings: AppSettings::default(),
            backend_status: BackendStatus::NotConfigured,
            hotkey_registered: false,
            active_request_id: None,
            overlay_visible: false,
            conversation_history: Vec::new(),
            multi_turn_enabled: false,
            cancel_requested: false,
        }
    }
}
