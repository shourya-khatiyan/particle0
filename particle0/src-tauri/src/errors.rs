//! Error types for particle0.

use serde::Serialize;

/// All possible errors from the NIM client and app logic.
#[derive(Debug, thiserror::Error, Serialize)]
pub enum NimError {
    #[error("NIM server unreachable: {0}")]
    NetworkError(String),

    #[error("Authentication failed: check your API key")]
    AuthError,

    #[error("Model '{0}' not found on this endpoint")]
    ModelNotFound(String),

    #[error("Request timed out after {0}s")]
    Timeout(u64),

    #[error("Stream parse error: {0}")]
    StreamParseError(String),

    #[error("Server error: {0}")]
    ServerError(String),

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("Request cancelled")]
    Cancelled,
}

/// Maps NimError to a user-facing message and error_type string.
pub struct UserFacingError {
    pub message: String,
    pub error_type: String,
    pub retryable: bool,
}

impl From<&NimError> for UserFacingError {
    fn from(e: &NimError) -> Self {
        match e {
            NimError::NetworkError(_) => UserFacingError {
                message: "Cannot reach the model server.".into(),
                error_type: "network".into(),
                retryable: true,
            },
            NimError::AuthError => UserFacingError {
                message: "Authentication failed. Check your API key in Settings.".into(),
                error_type: "auth".into(),
                retryable: false,
            },
            NimError::ModelNotFound(_) => UserFacingError {
                message: "Selected model is not available.".into(),
                error_type: "model".into(),
                retryable: false,
            },
            NimError::Timeout(secs) => UserFacingError {
                message: format!("Request timed out after {secs}s. Try again or increase timeout in Settings."),
                error_type: "timeout".into(),
                retryable: true,
            },
            NimError::StreamParseError(_) => UserFacingError {
                message: "Response was corrupted. Try again.".into(),
                error_type: "parse".into(),
                retryable: true,
            },
            NimError::ServerError(_) => UserFacingError {
                message: "The model server returned an error.".into(),
                error_type: "server".into(),
                retryable: true,
            },
            NimError::ConfigError(_) => UserFacingError {
                message: "Configuration issue. Open Settings to fix.".into(),
                error_type: "config".into(),
                retryable: false,
            },
            NimError::Cancelled => UserFacingError {
                message: "Request cancelled.".into(),
                error_type: "cancelled".into(),
                retryable: false,
            },
        }
    }
}

// NimError is returned from Tauri commands as a serialized error string via Result<T, String>.
